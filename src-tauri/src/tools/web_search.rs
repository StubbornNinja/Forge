use async_trait::async_trait;
use serde_json::{json, Value};

use super::registry::Tool;
use crate::Result;

pub struct WebSearchTool {
    searxng_url: String,
    client: reqwest::Client,
}

impl WebSearchTool {
    pub fn new(searxng_url: String) -> Self {
        Self {
            searxng_url: searxng_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web using SearXNG. Returns relevant search results for a given query."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)",
                    "default": 5
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<String> {
        let query = arguments["query"]
            .as_str()
            .ok_or_else(|| crate::ForgeError::Tool("Missing 'query' parameter".to_string()))?;

        let num_results = arguments["num_results"].as_u64().unwrap_or(5) as usize;

        let url = format!("{}/search", self.searxng_url);
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
            .map_err(|e| crate::ForgeError::Tool(format!("Search request failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(crate::ForgeError::Tool(format!(
                "Search returned status {}",
                resp.status()
            )));
        }

        let body: Value = resp
            .json()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("Failed to parse search response: {}", e)))?;

        let results = body["results"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .take(num_results)
                    .map(|r| {
                        format!(
                            "**{}**\n{}\nURL: {}",
                            r["title"].as_str().unwrap_or("Untitled"),
                            r["content"].as_str().unwrap_or("No description"),
                            r["url"].as_str().unwrap_or(""),
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n---\n\n")
            })
            .unwrap_or_else(|| "No results found.".to_string());

        Ok(results)
    }
}
