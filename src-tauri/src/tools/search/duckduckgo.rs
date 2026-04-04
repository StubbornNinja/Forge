use async_trait::async_trait;
use scraper::{Html, Selector};

use super::{SearchProvider, SearchResult};
use crate::Result;

pub struct DuckDuckGoProvider {
    client: reqwest::Client,
}

impl DuckDuckGoProvider {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .build()
                .unwrap_or_default(),
        }
    }
}

#[async_trait]
impl SearchProvider for DuckDuckGoProvider {
    async fn search(&self, query: &str, num_results: usize) -> Result<Vec<SearchResult>> {
        // POST to html.duckduckgo.com with Referer header — avoids CAPTCHA
        let resp = self
            .client
            .post("https://html.duckduckgo.com/html")
            .header("Referer", "https://html.duckduckgo.com/")
            .form(&[("q", query), ("b", ""), ("kl", "wt-wt")])
            .send()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("DuckDuckGo search failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(crate::ForgeError::Tool(format!(
                "DuckDuckGo returned status {}",
                resp.status()
            )));
        }

        let html = resp
            .text()
            .await
            .map_err(|e| crate::ForgeError::Tool(format!("Failed to read DuckDuckGo response: {}", e)))?;

        let document = Html::parse_document(&html);

        let title_selector = Selector::parse("h2.result__title a.result__a").unwrap();
        let snippet_selector = Selector::parse(".result__snippet").unwrap();

        let titles: Vec<(String, String)> = document
            .select(&title_selector)
            .map(|el| {
                let title = el.text().collect::<String>().trim().to_string();
                let url = el.value().attr("href").unwrap_or("").to_string();
                (title, url)
            })
            .collect();

        let snippets: Vec<String> = document
            .select(&snippet_selector)
            .map(|el| el.text().collect::<String>().trim().to_string())
            .collect();

        let results = titles
            .into_iter()
            .take(num_results)
            .enumerate()
            .filter_map(|(i, (title, url))| {
                if title.is_empty() || url.is_empty() {
                    return None;
                }
                // Skip DDG internal links
                if url.contains("duckduckgo.com") {
                    return None;
                }
                let snippet = snippets.get(i).cloned().unwrap_or_default();
                Some(SearchResult { title, url, snippet })
            })
            .collect();

        Ok(results)
    }

    fn name(&self) -> &str {
        "duckduckgo"
    }
}
