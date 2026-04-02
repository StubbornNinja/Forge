# Forge — Claude Code Context

Forge is a local-first AI assistant desktop app: Tauri v2 (Rust backend) + React/TypeScript frontend + Tailwind CSS v4. Connects to local LLM inference via OpenAI-compatible API (LM Studio, llama.cpp, etc.).

## Quick reference

- **Full project guide**: `docs/CLAUDE.md` — architecture, conventions, all key files, settings fields, model quirks
- **Design spec**: `docs/FORGE_SPEC.md` — complete build specification
- **Task checklist**: `docs/TASKS.md` — what's done and what remains (Phases 1-9 complete, 10-11 remaining)
- **Search architecture**: `docs/SEARCH_ARCHITECTURE.md` — hybrid search design (DuckDuckGo/Brave/SearXNG)
- **llama.cpp integration**: `docs/LLAMA_CPP_INTEGRATION.md` — notes for embedding llama.cpp

## Build & run

```bash
cargo tauri dev          # Dev with hot reload
cargo tauri build        # Release build
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
npx tsc --noEmit         # TypeScript type-check
cd docker && docker compose up -d   # SearXNG for web search
```

## Current state

Phases 1-9 are complete. The app is functional with:
- Chat with streaming responses and tool use (web search, file reader)
- Conversation persistence with FTS search
- Auto title generation via dedicated small model (`title_model` setting, default `unsloth/Qwen3-0.6B-GGUF`)
- Light/dark/system theme with CSS variable indirection
- macOS Overlay title bar (transparent, blends with app background)
- System prompt with current date/time injection
- Settings UI for model, theme, shortcuts, search, system prompt, title model
- Model-aware reasoning support (Qwen3/3.5 thinking, GPT-OSS reasoning_content)
- Reasoning effort control (Off/Low/Medium/High) with model profile registry
- Inter font with OpenType stylistic alternates for polished typography
- Assistant messages render flat (no bubble) for a cleaner chat aesthetic

**Remaining work**: Phase 10 (cross-platform/LAN) and Phase 11 (polish/error handling).

## Key architecture decisions

- **IPC**: Frontend calls `invoke()` via `src/lib/tauri.ts`. Backend emits events for streaming (`stream:delta`, `stream:end`, `stream:error`, `tool:call`, `tool:result`, `conversation:title-updated`).
- **State**: Zustand stores (frontend). `AppState` with `Mutex<Connection>`, `Box<dyn ModelProvider>`, `RwLock<AppSettings>`, `CancellationToken`, `ToolRegistry` (backend).
- **Theming**: CSS custom properties in `:root` (dark default), overridden by `@media (prefers-color-scheme: light)` or `[data-theme]` attribute. Tailwind `@theme` tokens reference the CSS vars.
- **Title generation**: Separate small model in background `tokio::spawn` task. Model-profile-aware: uses `/no_think` prefix for InlineThinkTags models + `chat_template_kwargs`/`reasoning_effort` params. `clean_title()` strips `<think>` blocks and formatting as safety net.
- **System prompt**: Built in `system_prompt/builder.rs`. Injects tool guidance + timestamp. Custom prompt overrides default but still gets timestamp.
- **`ChatRequest.extra`**: `Option<serde_json::Value>` with `#[serde(flatten)]` — merges model-specific params into the request body.
- **Model profile registry**: Data-driven in `inference/model_profile.rs`. Profiles define `ReasoningStyle` (None/InlineThinkTags/ReasoningContentField) and `ThinkingSuppression` (None/ChatTemplateKwargs/ReasoningEffort). Adding a new model format = adding one entry to the `PROFILES` array.
- **Typography**: Inter variable font (`@fontsource-variable/inter`) with OpenType stylistic alternates (cv02, cv03, cv04, cv11).
