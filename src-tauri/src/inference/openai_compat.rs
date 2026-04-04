use std::pin::Pin;
use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use futures::Stream;
use reqwest::Client;

use super::provider::ModelProvider;
use super::types::*;
use crate::{ForgeError, Result};

pub struct OpenAICompatProvider {
    base_url: Arc<RwLock<String>>,
    client: Client,
}

impl OpenAICompatProvider {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url: Arc::new(RwLock::new(base_url.trim_end_matches('/').to_string())),
            client: Client::new(),
        }
    }

    /// Update the base URL (for switching between local sidecar and external server).
    pub fn set_base_url(&self, url: &str) {
        if let Ok(mut u) = self.base_url.write() {
            *u = url.trim_end_matches('/').to_string();
        }
    }

    fn get_base_url(&self) -> String {
        self.base_url.read().map(|u| u.clone()).unwrap_or_default()
    }
}

#[async_trait]
impl ModelProvider for OpenAICompatProvider {
    async fn list_models(&self) -> Result<Vec<ModelInfo>> {
        let url = format!("{}/v1/models", self.get_base_url());
        let resp = self
            .client
            .get(&url)
            .send()
            .await?
            .json::<ModelsResponse>()
            .await?;
        Ok(resp.data)
    }

    async fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse> {
        let url = format!("{}/v1/chat/completions", self.get_base_url());
        let mut req = request;
        req.stream = Some(false);

        let resp = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ForgeError::Inference(format!(
                "API returned {}: {}",
                status, body
            )));
        }

        let chat_resp = resp.json::<ChatResponse>().await?;
        Ok(chat_resp)
    }

    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn Stream<Item = Result<StreamDelta>> + Send + Unpin>> {
        let url = format!("{}/v1/chat/completions", self.get_base_url());
        let mut req = request;
        req.stream = Some(true);
        // Request usage data in the final stream chunk
        req.stream_options = Some(serde_json::json!({"include_usage": true}));

        let resp = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ForgeError::Inference(format!(
                "API returned {}: {}",
                status, body
            )));
        }

        let stream = async_stream::stream! {
            use futures::StreamExt;
            let mut byte_stream = resp.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk) = byte_stream.next().await {
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(e) => {
                        yield Err(ForgeError::Network(e));
                        break;
                    }
                };

                buffer.push_str(&String::from_utf8_lossy(&chunk));

                // Process complete SSE lines
                while let Some(line_end) = buffer.find('\n') {
                    let line = buffer[..line_end].trim().to_string();
                    buffer = buffer[line_end + 1..].to_string();

                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        let data = data.trim();
                        if data == "[DONE]" {
                            return;
                        }

                        match serde_json::from_str::<StreamChunk>(data) {
                            Ok(chunk) => {
                                if let Some(choice) = chunk.choices.first() {
                                    let mut delta = choice.delta.clone();
                                    // Attach usage from the final chunk
                                    if chunk.usage.is_some() {
                                        delta.usage = chunk.usage;
                                    }
                                    yield Ok(delta);
                                } else if chunk.usage.is_some() {
                                    // Some servers send a final chunk with only usage, no choices
                                    yield Ok(StreamDelta {
                                        usage: chunk.usage,
                                        ..Default::default()
                                    });
                                }
                            }
                            Err(e) => {
                                log::warn!("Failed to parse SSE chunk: {} — data: {}", e, data);
                            }
                        }
                    }
                }
            }
        };

        Ok(Box::new(Pin::new(Box::new(
            futures::stream::StreamExt::boxed(stream),
        ))) as Box<dyn Stream<Item = Result<StreamDelta>> + Send + Unpin>)
    }

    async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/v1/models", self.get_base_url());
        match self.client.get(&url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}
