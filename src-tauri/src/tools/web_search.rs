use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::Mutex;

use super::registry::Tool;
use super::search::{format_results, SearchProvider};
use crate::Result;

/// Cached search result entry.
struct CacheEntry {
    result: String,
    created_at: Instant,
}

pub struct WebSearchTool {
    provider: Box<dyn SearchProvider>,
    cache: Mutex<HashMap<String, CacheEntry>>,
}

const CACHE_TTL_SECS: u64 = 300; // 5 minutes
const MAX_CACHE_ENTRIES: usize = 100;

impl WebSearchTool {
    pub fn new(provider: Box<dyn SearchProvider>) -> Self {
        Self {
            provider,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Build a cache key from provider name, query, and result count.
    fn cache_key(provider_name: &str, query: &str, num_results: usize) -> String {
        format!("{}:{}:{}", provider_name, query.to_lowercase(), num_results)
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web for current information. Returns relevant search results for a given query."
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

        // Check cache
        let key = Self::cache_key(self.provider.name(), query, num_results);
        {
            let cache = self.cache.lock().await;
            if let Some(entry) = cache.get(&key) {
                if entry.created_at.elapsed().as_secs() < CACHE_TTL_SECS {
                    return Ok(entry.result.clone());
                }
            }
        }

        // Execute search
        let results = self.provider.search(query, num_results).await?;
        let formatted = format_results(&results);

        // Store in cache (with LRU eviction)
        {
            let mut cache = self.cache.lock().await;
            // Evict expired entries
            cache.retain(|_, v| v.created_at.elapsed().as_secs() < CACHE_TTL_SECS);
            // If still over limit, remove oldest
            while cache.len() >= MAX_CACHE_ENTRIES {
                if let Some(oldest_key) = cache
                    .iter()
                    .min_by_key(|(_, v)| v.created_at)
                    .map(|(k, _)| k.clone())
                {
                    cache.remove(&oldest_key);
                }
            }
            cache.insert(key, CacheEntry {
                result: formatted.clone(),
                created_at: Instant::now(),
            });
        }

        Ok(formatted)
    }
}
