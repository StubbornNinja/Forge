use async_trait::async_trait;
use futures::Stream;
use reqwest::Client;
use std::pin::Pin;

use super::provider::ModelProvider;
use super::types::*;
use crate::{ForgeError, Result};

pub struct OpenAICompatProvider {
    base_url: String,
    client: Client,
}

impl OpenAICompatProvider {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: Client::new(),
        }
    }
}

#[async_trait]
impl ModelProvider for OpenAICompatProvider {
    async fn list_models(&self) -> Result<Vec<ModelInfo>> {
        let url = format!("{}/v1/models", self.base_url);
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
        let url = format!("{}/v1/chat/completions", self.base_url);
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
        let url = format!("{}/v1/chat/completions", self.base_url);
        let mut req = request;
        req.stream = Some(true);

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
                                    yield Ok(choice.delta.clone());
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
        let url = format!("{}/v1/models", self.base_url);
        match self.client.get(&url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}
