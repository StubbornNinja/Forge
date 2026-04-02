# Search Architecture — Hybrid Web Search for Forge

Design doc for replacing the Docker-dependent SearXNG setup with a hybrid search system that "just works" out of the box.

## Goal

Forge should work like ChatGPT or Claude Desktop — download, open, use. No Docker containers, no external services. Web search should work on first launch with zero configuration.

## Search Backend Hierarchy

Three backends, in order of priority:

| Backend | Config Required | API Key | Result Quality | Reliability |
|---------|----------------|---------|---------------|-------------|
| **DuckDuckGo** (default) | None | No | Good | Good (HTML scraping) |
| **Brave Search API** | API key | Yes (free tier: 2k queries/mo) | Very good | Excellent (official API) |
| **SearXNG** (self-hosted) | Instance URL | No | Best (multi-engine consensus) | Excellent |

### Selection Logic

```
if searxng_url is configured and reachable → use SearXNG
else if brave_api_key is configured → use Brave Search
else → use DuckDuckGo (zero-config default)
```

The user can also explicitly choose a preferred backend in settings, overriding auto-detection.

---

## Backend 1: DuckDuckGo (Default — Zero Config)

### How it works

Scrape DuckDuckGo's lightweight HTML endpoint: `https://duckduckgo.com/html/`

- No API key required
- Returns titles, URLs, and snippets
- Minimal HTML, straightforward to parse
- Rate limits exist but are generous for personal use

### Implementation approach

Use `reqwest` to fetch `https://duckduckgo.com/html/?q={query}`, parse with `scraper` crate (CSS selector-based HTML parsing). Extract `.result__title`, `.result__snippet`, `.result__url` elements.

### Request format

```
GET https://duckduckgo.com/html/?q=rust+web+scraping
Headers:
  User-Agent: Mozilla/5.0 (compatible; Forge/1.0)
```

### Parsed result structure

```rust
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}
```

### Caveats

- DuckDuckGo may change their HTML structure (scraping is inherently fragile)
- No official API for full web results (their Instant Answer API only covers factual queries)
- Respect `robots.txt` and rate limits
- Result diversity is smaller than multi-engine aggregation

---

## Backend 2: Brave Search API

### Why Brave

- Official REST API with structured JSON responses
- Free tier: 2,000 queries/month (grandfathered plan, closed to new users)
- High-quality results from an independent search index (one of only three large-scale Western web indexes)
- No scraping fragility — stable, versioned API
- Used by most top-10 LLMs for real-time web data

### API details

**Endpoint:** `GET https://api.search.brave.com/res/v1/web/search`

**Authentication:** `X-Subscription-Token: <API_KEY>` header

**Key parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `count` | int | Results per page (max 20, default 20) |
| `offset` | int | Pagination offset (0-based, max 9) |
| `country` | string | Country filter (e.g., `us`) |
| `search_lang` | string | Language filter (e.g., `en`) |
| `extra_snippets` | bool | Include additional excerpt variations |

**Response structure:**

```json
{
  "type": "search",
  "query": {
    "original": "rust programming",
    "more_results_available": true
  },
  "web": {
    "results": [
      {
        "title": "...",
        "url": "...",
        "description": "...",
        "extra_snippets": ["..."]
      }
    ]
  }
}
```

**Example request:**

```bash
curl -s --compressed \
  "https://api.search.brave.com/res/v1/web/search?q=rust+programming&count=5" \
  -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSA..."
```

### Settings fields needed

- `brave_api_key: Option<String>` — stored in settings KV table
- UI: text input in settings panel, masked like a password field

---

## Backend 3: SearXNG (Power User)

### Current implementation

Already implemented in `src-tauri/src/tools/web_search.rs`. Queries `{searxng_url}/search?q={query}&format=json&categories=general`.

### Why keep it

- Best result quality — multi-engine consensus ranking (Google + Bing + DuckDuckGo + others)
- 150+ engine configurations maintained by the SearXNG community
- Full control over which engines are queried
- No rate limits (self-hosted)

### No changes needed

The existing `WebSearchTool` implementation stays as-is. The only change is that it becomes one of three backends instead of the only one.

---

## Implementation Design

### New settings fields

```rust
// In AppSettings
pub search_backend: Option<String>,    // "auto" | "duckduckgo" | "brave" | "searxng"
pub brave_api_key: Option<String>,     // Brave Search API key
// Existing:
pub searxng_url: String,               // SearXNG instance URL
pub search_enabled: bool,              // Master toggle
```

Default `search_backend` is `"auto"` (follows the selection logic above).

### Search provider trait

```rust
#[async_trait]
pub trait SearchProvider: Send + Sync {
    async fn search(&self, query: &str, num_results: usize) -> Result<Vec<SearchResult>>;
    fn name(&self) -> &str;
}

pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}
```

Three implementations:
- `DuckDuckGoProvider` — HTML scraping, no config
- `BraveSearchProvider` — API calls with key
- `SearxngProvider` — existing logic extracted

### WebSearchTool refactor

`WebSearchTool` gets a `Box<dyn SearchProvider>` instead of a hardcoded SearXNG URL. The provider is selected at tool registration time based on settings. Output format stays identical — the model sees the same markdown regardless of backend.

### File structure

```
src-tauri/src/tools/
├── registry.rs          (unchanged)
├── web_search.rs        (refactored: uses SearchProvider trait)
├── file_reader.rs       (unchanged)
└── search/
    ├── mod.rs            (SearchProvider trait + SearchResult struct)
    ├── duckduckgo.rs     (HTML scraping provider)
    ├── brave.rs          (Brave API provider)
    └── searxng.rs        (extracted from current web_search.rs)
```

### Dependencies

```toml
# Already have:
reqwest = { version = "...", features = ["json"] }

# Need to add:
scraper = "0.22"  # HTML parsing for DuckDuckGo
```

---

## Settings UI Changes

### Search section in GeneralConfig.tsx

```
Search
├── Enable Web Search          [toggle]
├── Search Backend             [Auto (Recommended) | DuckDuckGo | Brave Search | SearXNG]
├── Brave API Key              [password input]  (shown when Brave selected or Auto)
├── SearXNG URL                [text input]      (shown when SearXNG selected or Auto)
└── Helper text explaining each backend
```

When "Auto" is selected, show which backend is currently active (e.g., "Using: DuckDuckGo (default)" or "Using: Brave Search").

---

## Migration Path

### Phase 1: Add Brave Search + DuckDuckGo backends (near-term)
- Implement `SearchProvider` trait and three backends
- Refactor `WebSearchTool` to use the trait
- Add settings fields and UI
- DuckDuckGo becomes the zero-config default
- SearXNG still works for existing users

### Phase 2: Remove Docker dependency from docs/setup (mid-term)
- Update README, TASKS.md to reflect Docker is optional
- New user experience: install Forge → web search works immediately

### Phase 3: Embed llama.cpp (long-term)
- Combined with search, Forge becomes fully self-contained
- Single binary + GGUF model file = complete AI assistant

---

## Rate Limit / Abuse Considerations

| Backend | Rate Limit | Mitigation |
|---------|-----------|------------|
| DuckDuckGo | Undocumented, ~30-50/min estimated | Cache results for identical queries (TTL: 5 min) |
| Brave | 2,000/month (free), then $5/1k queries | Show remaining quota in settings, warn at 80% |
| SearXNG | None (self-hosted) | N/A |

### Result caching

All backends should share a simple in-memory cache:
- Key: `(backend, query, num_results)`
- TTL: 5 minutes
- Max entries: 100 (LRU eviction)

This prevents redundant searches when the model retries or the user regenerates a response.

---

## References

- [Brave Search API docs](https://api.search.brave.com/app/documentation/web-search/get-started)
- [Brave Search API pricing](https://brave.com/search/api/)
- [DuckDuckGo HTML endpoint](https://duckduckgo.com/html/)
- [websearch Rust crate](https://github.com/xynehq/websearch) — reference implementation for multi-provider search
- [scraper crate](https://crates.io/crates/scraper) — CSS selector-based HTML parsing for Rust
- [SearXNG docs](https://docs.searxng.org/)
