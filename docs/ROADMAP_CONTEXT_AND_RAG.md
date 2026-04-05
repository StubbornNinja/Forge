# Roadmap: Context Compression & Document RAG

## Design Philosophy

**Simple by default, powerful if you dig.** Every feature below should work invisibly for casual users. Power users who open Advanced settings get full control: context inspector, compression strategy toggles, token budgets, retrieval thresholds.

---

## Target Hardware & Model Strategy

### Primary target: MacBook Neo (8GB unified, ~60GB/s)

**Primary model: Gemma 4 E2B Q4_K_M (3.11 GB)**
- 5.1B params (2.3B effective), 128K context window
- Native tool calling, thinking mode, vision, audio
- Standard llama.cpp — no forks, existing binary download works
- Fits comfortably in 8GB with room for KV cache + embedding model

**Future model: Bonsai 8B 1-bit (1.15 GB)** — when Q1_0 merges into mainline llama.cpp
- [PR #21273](https://github.com/ggml-org/llama.cpp/pull/21273) is open, PrismML upstreaming, ggerganov reviewing
- Once merged: 1.15 GB leaves ~3.5 GB more headroom than Gemma E2B
- Could enable dual-model (chat + compression summary) or larger KV cache
- Monitor PR status; add to model catalog when it lands upstream

**Memory budget (Gemma 4 E2B Q4):**
```
macOS system:           ~3.0 GB
Gemma 4 E2B Q4_K_M:    ~3.1 GB
KV cache (8K context):  ~0.3 GB
Embedding model:        ~0.1 GB
App + WebView:          ~0.2 GB
─────────────────────────────────
Total:                  ~6.7 GB  (leaves ~1.3 GB headroom)
```

### Architecture note: Gemma 4 hybrid attention

Gemma 4 E2B uses interleaved local sliding window (512 tokens) + global attention layers. Not all context positions are equal — the most recent ~512 tokens get full local attention, older tokens only attend at global layers. The context window builder should be aware of this: prioritize keeping the most recent turns completely uncompressed within that 512-token local window.

---

## Resolved Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Embedding model delivery** | Download on first use | Same pattern as llama-server. Avoids 80MB app size bloat. Infrastructure exists. |
| **PDF parser** | Rust-native (`pdf-extract`) | "Just works" — no `brew install poppler` required. |
| **Document scope** | Both, default per-conversation. Global opt-in. | Simple by default. Global document library is an advanced feature that pairs with future memory system. |
| **Compression timing** | Lazy (compress when aging out of full window) | Avoids wasted work on short conversations. Extractive fallback is instant. |
| **Context inspector** | Advanced settings toggle | Invisible by default. Power users get token budget bar, turn status (full/compressed/dropped/retrieved), RAG injection indicators. |
| **Full context retrieval** | Future advanced feature | Ability to go back and RAG the full uncompressed content of earlier turns when needed. Deferred — build the core compression + retrieval loop first. |

---

## v0.1.0 — Foundation (DONE)

- Chat with streaming, tool use, conversation persistence
- Embedded llama.cpp sidecar, model management, auto-updates
- Multi-tab settings, notification system
- UX polish (overscroll, resize, selection, min window size)

## v0.1.1 — Installation & Auto-Updates

- macOS DMG with code signing + notarization
- GitHub Actions CI/CD
- Tauri updater plugin for in-app auto-updates
- See `docs/V0.1.1_ROADMAP.md` for full plan

---

## v0.2.0 — Context Compression

### What the user sees
Nothing changes by default. Conversations just work longer without degrading. In Advanced settings: a "Context" section with window size and an opt-in inspector.

### What's built

**Context Window Builder** (`src-tauri/src/context/builder.rs`)
- Token budget allocator with configurable reserves (system prompt, generation headroom, RAG injection)
- Sliding window that fills backward: recent turns full, older turns compressed, ancient turns dropped
- Gemma 4 hybrid attention awareness: keep ~512 tokens uncompressed in the local window
- Deterministic: same state + budget = same output (debuggable)

**Token Counting** (`src-tauri/src/context/tokenizer.rs`)
- Primary: llama.cpp `/tokenize` endpoint (already running)
- Fallback: heuristic (`chars / 3.5`, calibrated per model profile)

**Think Block Compression** (`src-tauri/src/context/compression.rs`)
- Extractive (v0.2.0): pattern-match conclusion/recommendation/reference sentences, strip think blocks entirely from older turns. Zero cost.
- Model-generated (v0.5.0 upgrade): background inference call using the loaded model for higher quality summaries.

**DB Migrations**
```sql
ALTER TABLE messages ADD COLUMN content_compressed TEXT;
ALTER TABLE messages ADD COLUMN token_count INTEGER;
ALTER TABLE messages ADD COLUMN compressed_token_count INTEGER;
```

**Integration Point**
- `send_message` in `chat.rs` currently sends full history → replace with `build_context_window()` returning the optimized message array

**Settings UI (Advanced tab)**
- Context window size (auto-detect from model or manual override)
- Generation headroom slider
- Context Inspector toggle → shows token budget bar + turn statuses

---

## v0.3.0 — Conversational RAG

### What the user sees
Nothing changes by default. The model just "remembers" relevant things from earlier in long conversations. An indicator appears when retrieved context is injected (subtle, non-intrusive).

### What's built

**Embedding Model** — all-MiniLM-L6-v2 (80MB, 384-dim)
- Downloaded on first use (same pattern as llama-server)
- Integrated via ONNX Runtime in Rust (`ort` crate) — in-process, no sidecar
- ~5ms per embedding, CPU-only, negligible memory

**Per-Turn Embedding** (background task after each response)
- Embed `content_compressed` (or `content_final` for recent turns)
- Store as BLOB in messages table
- Non-blocking — doesn't delay the chat

**Retrieval Flow** (runs before context window assembly)
1. Embed current user message
2. Cosine similarity against all turns NOT in active window
3. Threshold > 0.75 → inject `content_compressed` as system context
4. Limit 1-2 retrieved turns per request

**DB Migration**
```sql
ALTER TABLE messages ADD COLUMN embedding BLOB;
```

**UI Indicator**
- Subtle badge/icon when RAG context is injected (e.g., small "recalled" tag)
- Context Inspector (Advanced): shows which turns were retrieved and their similarity scores

---

## v0.4.0 — Document RAG

### What the user sees
Upload a PDF or document → ask questions about it → get answers with page citations. Simple by default. Power users can opt into a global document library.

### What's built

**PDF Parser** — Rust-native (`pdf-extract` crate)
- Text extraction with page number tracking
- Section header detection where possible
- Handles common PDF formats; graceful fallback for complex layouts

**Document Chunker**
- ~300-token chunks with 50-token overlap
- Boundary-aware: split at paragraph/sentence boundaries
- Metadata: page number, section header, chunk index

**Storage**
```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,       -- NULL = global (opt-in), else scoped
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    page_count INTEGER,
    total_chunks INTEGER,
    uploaded_at TEXT NOT NULL
);

CREATE TABLE document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding BLOB,
    page_number INTEGER,
    section_header TEXT
);
```

**Query-Time Retrieval**
- Embed user message → top 3-5 similar chunks → inject with source attribution
- `[From "{filename}", page {N}: {chunk_content}]`

**Document Management UI**
- Upload button (extends existing file upload)
- Document list with delete
- Per-conversation vs global scope toggle (Advanced)
- "Chat with this document" conversation mode

**Memory Impact (8GB safe)**
- 100-page PDF: ~300 chunks × 384 dims × 4 bytes = ~460KB embeddings
- Embedding time: ~1.5 seconds total
- Query similarity: <1ms brute-force

---

## v0.5.0 — Polish & Advanced Features

- **Model-generated compression**: upgrade extractive to background model summaries
- **Full context retrieval**: Advanced feature to RAG full uncompressed turns when explicitly needed
- **Uncertainty detection**: scan think blocks for hedging language, optionally trigger web search verification
- **Conversation export**: markdown format for external audit/review
- **Context budget visualization**: token usage bar chart in inspector
- **Performance profiling**: benchmark on actual MacBook Neo hardware, tune budgets

---

## Future (post v0.5.0)

- **Memory system**: cross-conversation knowledge that persists (pairs with global document library)
- **Bonsai 8B support**: add to catalog once Q1_0 merges upstream in llama.cpp
- **Dual-model inference**: with Bonsai's 1.15 GB footprint, potentially run chat + compression models simultaneously
- **Linux/CachyOS target**: AppImage distribution, test on Arch
