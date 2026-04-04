pub mod brave;
pub mod duckduckgo;
pub mod searxng;

use async_trait::async_trait;
use crate::Result;

/// A unified search result from any backend.
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// Trait implemented by each search backend.
#[async_trait]
pub trait SearchProvider: Send + Sync {
    async fn search(&self, query: &str, num_results: usize) -> Result<Vec<SearchResult>>;
    fn name(&self) -> &str;
}

/// Format search results into markdown for the model.
pub fn format_results(results: &[SearchResult]) -> String {
    if results.is_empty() {
        return "No results found.".to_string();
    }
    results
        .iter()
        .map(|r| format!("**{}**\n{}\nURL: {}", r.title, r.snippet, r.url))
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}
