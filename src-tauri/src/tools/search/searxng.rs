use async_trait::async_trait;
use serde_json::Value;

use super::{SearchProvider, SearchResult};
use crate::Result;

pub struct SearxngProvider {
    base_url: String,
    client: reqwest::Client,
}

impl SearxngProvider {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl SearchProvider for SearxngProvider {
    async fn search(&self, query: &str, num_results: usize) -> Result<Vec<SearchResult>> {
        let url = format!("{}/search", self.base_url);
        let resp = self
            .client
            .get(&url)
            .query(&[
                ("q", query),
                ("format", "json"),
                ("categories", "general"),
            ])
            .send()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("SearXNG search failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(crate::ForgeError::Tool(format!(
                "SearXNG returned status {}",
                resp.status()
            )));
        }

        let body: Value = resp
            .json()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("Failed to parse SearXNG response: {}", e)))?;

        let results = body["results"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .take(num_results)
                    .filter_map(|r| {
                        let title = r["title"].as_str().unwrap_or("Untitled").to_string();
                        let url = r["url"].as_str()?.to_string();
                        let snippet = r["content"].as_str().unwrap_or("").to_string();
                        Some(SearchResult { title, url, snippet })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(results)
    }

    fn name(&self) -> &str {
        "searxng"
    }
}
