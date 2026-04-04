use async_trait::async_trait;
use serde_json::Value;

use super::{SearchProvider, SearchResult};
use crate::Result;

pub struct BraveSearchProvider {
    api_key: String,
    client: reqwest::Client,
}

impl BraveSearchProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl SearchProvider for BraveSearchProvider {
    async fn search(&self, query: &str, num_results: usize) -> Result<Vec<SearchResult>> {
        let resp = self
            .client
            .get("https://api.search.brave.com/res/v1/web/search")
            .header("Accept", "application/json")
            .header("Accept-Encoding", "gzip")
            .header("X-Subscription-Token", &self.api_key)
            .query(&[
                ("q", query),
                ("count", &num_results.min(20).to_string()),
            ])
            .send()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("Brave search failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(crate::ForgeError::Tool(format!(
                "Brave Search returned status {}",
                resp.status()
            )));
        }

        let body: Value = resp
            .json()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("Failed to parse Brave response: {}", e)))?;

        let results = body["web"]["results"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .take(num_results)
                    .filter_map(|r| {
                        let title = r["title"].as_str()?.to_string();
                        let url = r["url"].as_str()?.to_string();
                        let snippet = r["description"].as_str().unwrap_or("").to_string();
                        Some(SearchResult { title, url, snippet })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(results)
    }

    fn name(&self) -> &str {
        "brave"
    }
}
