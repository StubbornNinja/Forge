# CLAUDE.md — Forge Project

## What is this project?

Forge is a local-first AI assistant desktop app built with Tauri v2 (Rust backend, React/TypeScript frontend). It connects to local LLM inference servers (LM Studio, MLX server, llama.cpp) via the OpenAI-compatible API, and supports file upload and web search via self-hosted SearXNG.

## Build & run commands

```bash
# Development (hot reload)
cargo tauri dev

# Build for release
cargo tauri build

# Frontend only (for UI iteration)
npm run dev

# Run Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Run specific Rust test module
cargo test --manifest-path src-tauri/Cargo.toml db::conversations::tests

# Type-check frontend
npx tsc --noEmit

# Lint Rust
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Lint & format frontend
npm run lint
npm run format

# Start SearXNG (required for web search tool)
cd docker && docker compose up -d
```

## Architecture overview

```
Frontend (React/TS)  <->  Tauri IPC  <->  Backend (Rust)  <->  LM Studio (OpenAI API)
     Zustand stores        invoke()        SQLite + FTS5       http://localhost:1234
     Tailwind CSS v4       events          Tool registry       (or LAN address)
```

- **IPC pattern**: Frontend calls `invoke('command_name', { args })`. Backend emits events for streaming: `stream:delta`, `stream:end`, `stream:error`, `tool:call`, `tool:result`, `conversation:title-updated`.
- **State**: Zustand stores on frontend. `AppState` struct with `Mutex<Connection>`, `Box<dyn ModelProvider>`, `RwLock<AppSettings>`, `CancellationToken`, `ToolRegistry` on backend.
- **Inference abstraction**: `ModelProvider` trait in `src-tauri/src/inference/provider.rs`. Only implementation is `OpenAICompatProvider`. All backends speak the same HTTP API.
- **Tool system**: `Tool` trait with `name()`, `description()`, `parameters_schema()`, `execute()`. Registered in `ToolRegistry`. Orchestrator loops tool calls up to 5 rounds.
- **Database**: SQLite via rusqlite. FTS5 for message search. Migrations tracked in a `_migrations` table.

## Theming system

The app supports **System**, **Light**, and **Dark** themes.

- **CSS variable indirection**: Tailwind `@theme` tokens in `src/styles/globals.css` reference CSS custom properties (e.g., `--color-surface-primary: var(--surface-primary)`).
- **Dark is default**: `:root` defines dark values.
- **Light via media query**: `@media (prefers-color-scheme: light)` overrides when `data-theme` is not `"dark"`.
- **Manual override**: `[data-theme="light"]` and `[data-theme="dark"]` selectors force a theme regardless of OS.
- **Application logic** (`src/App.tsx`): A `useEffect` sets/removes `data-theme` on `document.documentElement` based on `settings.theme`.
- **Settings type**: `theme: 'system' | 'light' | 'dark'` (default: `"system"`).

### macOS title bar

- `tauri.conf.json`: `"titleBarStyle": "Overlay"`, `"hiddenTitle": true` — makes the title bar transparent, web content shows through.
- Traffic lights are native; window dragging is enabled via a `data-tauri-drag-region` div in `App.tsx`.
- Sidebar header and chat top bar use `pt-8` padding to clear the traffic light area.
- Minimum window size: `minWidth: 520`, `minHeight: 400`.

## Model profile registry

Data-driven model adapter system in `src-tauri/src/inference/model_profile.rs`. Adding a new model format requires only a new entry in the `PROFILES` array.

- **`ModelProfile`**: `name`, `patterns` (case-insensitive matching), `reasoning_style`, `thinking_suppression`, `supports_tool_use`.
- **`ReasoningStyle`**: `None` | `InlineThinkTags` (Qwen3/3.5: `<think>` in content) | `ReasoningContentField` (GPT-OSS: `reasoning_content` delta field).
- **`ThinkingSuppression`**: `None` | `ChatTemplateKwargs` (Qwen3/3.5: `enable_thinking`) | `ReasoningEffort` (GPT-OSS: `reasoning_effort`).
- Built-in profiles: `qwen3`, `qwen3.5`, `gpt-oss` (+ `harmony`), `default` fallback.
- `detect_profile()` → first pattern match wins. `build_extra_params()` → model-specific JSON for `ChatRequest.extra`.
- Reasoning deltas streamed via `stream:reasoning_delta` event; all reasoning normalized to `<think>` tags before DB storage.
- Frontend: `streamingReasoning` state in `chatStore.ts`, subscribed via `InputArea.tsx`, displayed in `MessageList.tsx`.

### Serde aliases

`StreamDelta.reasoning_content` and `ChatMessage.reasoning_content` use `#[serde(alias = "reasoning")]` because LM Studio may serialize the field as either `reasoning` or `reasoning_content`.

## Title generation

After the first assistant response in a new conversation, a background task generates a short title.

- Uses a **separate small model** (default: `unsloth/Qwen3-0.6B-GGUF`) to avoid reasoning/thinking overhead from larger models.
- Configurable via `title_model` setting in the UI.
- **Model-profile-aware**: detects profile of title model, applies appropriate suppression. InlineThinkTags models get `/no_think` prefix (belt-and-suspenders with `chat_template_kwargs`). ReasoningEffort models get `reasoning_effort: "low"`.
- `clean_title()` in `chat.rs` strips `<think>` blocks, markdown formatting, numbered lists, and quotes as a safety net.
- Backend emits `conversation:title-updated` event; frontend listens in `InputArea.tsx` and updates the conversation store.

## System prompt

- Built in `src-tauri/src/system_prompt/builder.rs`.
- Default prompt establishes Forge's personality (honest, direct, no sycophancy).
- Appends tool-specific instructions when tools are available (e.g., web_search guidance).
- **Injects current date/time** (`chrono::Local::now()`) into every system prompt so the model knows the current timestamp.
- Custom system prompt overrides the default but still gets the timestamp appended.
- Controlled by `system_prompt_enabled` and `custom_system_prompt` settings.

## ChatRequest extra field

`ChatRequest` has an `extra: Option<serde_json::Value>` field with `#[serde(flatten)]`. This merges arbitrary JSON into the top-level request body. Used by the model profile system to inject model-specific parameters (`reasoning_effort`, `chat_template_kwargs`) for both chat and title generation requests.

## Code conventions

### Rust (backend)
- Error type: `ForgeError` in `src-tauri/src/error.rs`. All functions return `crate::Result<T>`.
- Tauri commands are `async fn` with `#[tauri::command]`, registered via `tauri::generate_handler![]`.
- snake_case everywhere. Tauri auto-converts to camelCase for the JS bridge.
- Use `thiserror` for error variants. Implement `Serialize` on errors for IPC.
- Database queries go in `src-tauri/src/db/`. Business logic in domain modules.
- Tests use `#[cfg(test)]` modules with in-memory SQLite (`Connection::open_in_memory()`).

### TypeScript (frontend)
- camelCase for variables/functions, PascalCase for components/types.
- All Tauri invocations go through `src/lib/tauri.ts` — never call `invoke()` directly from components.
- Zustand stores in `src/stores/`. Components subscribe to stores directly.
- Tailwind v4 for all styling. Design tokens via CSS custom properties (see `globals.css`).
- `react-markdown` with `remark-gfm` for rendering assistant messages.

### General
- No cloud dependencies. No telemetry. No analytics.
- All file paths via Tauri's `app.path()` API — never hardcode OS-specific paths.
- JSON stored in SQLite TEXT columns for flexible fields (tool_calls, attachments).
- UUID v4 for all entity IDs, generated at insertion time.

## Key files

### Backend (Rust)

| File | Purpose |
|------|---------|
| `src-tauri/src/main.rs` | App entry point, state setup, command registration |
| `src-tauri/src/commands/chat.rs` | `send_message`, `stop_generation`, title generation, `clean_title()` |
| `src-tauri/src/commands/conversations.rs` | Conversation CRUD commands |
| `src-tauri/src/commands/settings.rs` | `get_settings`, `update_settings`, `list_models`, `health_check` |
| `src-tauri/src/commands/files.rs` | `upload_file` command |
| `src-tauri/src/inference/provider.rs` | `ModelProvider` trait definition |
| `src-tauri/src/inference/openai_compat.rs` | HTTP client for OpenAI-compatible servers |
| `src-tauri/src/inference/types.rs` | `ChatRequest`, `ChatMessage`, `StreamDelta`, `ToolCall`, etc. |
| `src-tauri/src/inference/model_profile.rs` | Model profile registry: detection, extra params, reasoning style |
| `src-tauri/src/orchestrator/agent.rs` | Tool-use loop (call model -> execute tools -> re-call) |
| `src-tauri/src/tools/registry.rs` | `Tool` trait + `ToolRegistry` |
| `src-tauri/src/tools/web_search.rs` | SearXNG web search tool |
| `src-tauri/src/tools/file_reader.rs` | File reading tool |
| `src-tauri/src/system_prompt/builder.rs` | System prompt construction with timestamp injection |
| `src-tauri/src/config/settings.rs` | `AppSettings` struct, load/save from SQLite KV table |
| `src-tauri/src/db/migrations.rs` | SQL schema migrations |
| `src-tauri/src/db/conversations.rs` | Conversation DB queries |
| `src-tauri/src/db/messages.rs` | Message DB queries + FTS search |
| `src-tauri/tauri.conf.json` | Tauri window config (Overlay title bar, min size, etc.) |

### Frontend (TypeScript/React)

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root layout, theme application, drag region |
| `src/lib/tauri.ts` | Typed IPC wrappers (invoke + event listeners) |
| `src/lib/types.ts` | All TypeScript interfaces (`Message`, `AppSettings`, etc.) |
| `src/stores/chatStore.ts` | Active chat state (messages, streaming, tool calls) |
| `src/stores/conversationStore.ts` | Conversation list + CRUD actions |
| `src/stores/settingsStore.ts` | Settings state + persistence |
| `src/stores/uiStore.ts` | UI state (sidebar open, settings panel open) |
| `src/styles/globals.css` | Tailwind v4 `@theme`, CSS variable theming, drag region styles |
| `src/components/chat/ChatView.tsx` | Main chat area with message list + input |
| `src/components/chat/InputArea.tsx` | Message input, stream event subscriptions, send/stop |
| `src/components/chat/MessageBubble.tsx` | Individual message rendering |
| `src/components/chat/MessageList.tsx` | Scrollable message list |
| `src/components/chat/ToolCallDisplay.tsx` | Inline tool call/result display |
| `src/components/chat/ThinkingBlock.tsx` | Collapsible `<think>` block rendering |
| `src/components/shared/MarkdownRenderer.tsx` | Markdown rendering with remark-gfm |
| `src/components/shared/CodeBlock.tsx` | Syntax-highlighted code blocks with copy button |
| `src/components/sidebar/Sidebar.tsx` | Conversation list + new chat button |
| `src/components/sidebar/ConversationItem.tsx` | Individual conversation in sidebar |
| `src/components/sidebar/SearchBar.tsx` | FTS conversation search |
| `src/components/settings/SettingsPanel.tsx` | Settings modal container |
| `src/components/settings/ModelConfig.tsx` | Model/inference URL/temperature/reasoning effort settings |
| `src/components/settings/GeneralConfig.tsx` | Theme, shortcuts, title model, search, system prompt |

## AppSettings fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `inference_url` | `String` | `"http://localhost:1234"` | OpenAI-compatible endpoint |
| `default_model` | `Option<String>` | `None` | Model ID for chat |
| `temperature` | `f32` | `0.7` | |
| `max_tokens` | `u32` | `4096` | |
| `searxng_url` | `String` | `"http://localhost:8080"` | SearXNG instance URL |
| `search_enabled` | `bool` | `true` | Enables web_search tool |
| `send_shortcut` | `String` | `"Enter"` | `"Enter"` or `"Ctrl+Enter"` |
| `theme` | `String` | `"system"` | `"system"`, `"light"`, or `"dark"` |
| `system_prompt_enabled` | `bool` | `true` | |
| `custom_system_prompt` | `Option<String>` | `None` | Overrides default prompt |
| `title_model` | `Option<String>` | `None` | Falls back to `unsloth/Qwen3-0.6B-GGUF` |
| `reasoning_effort` | `Option<String>` | `None` | `"low"`, `"medium"`, `"high"`, or `None` (off) |

## What to avoid

- Don't add authentication, user accounts, or cloud sync
- Don't implement RAG, memory system, or conversation branching (future roadmap)
- Don't support non-OpenAI-compatible inference APIs
- Don't use `localStorage` — all persistence goes through Tauri IPC -> SQLite
- Don't call external APIs other than the local inference server and SearXNG
- Don't use `unwrap()` in production code — propagate errors with `?`

## Testing

- Rust: `cargo test` with in-memory SQLite. Mock `ModelProvider` with a struct returning canned responses.
- Frontend: `npx tsc --noEmit` for type-checking. Components should render without crashing. No E2E tests needed yet.
- Integration: `cargo tauri dev` -> manual test against LM Studio running locally.

## Platform notes

- Primary dev on macOS (Apple Silicon). Also targets CachyOS (Arch Linux).
- Linux system deps: `webkit2gtk-4.1 base-devel curl wget file openssl gtk3 librsvg pango`
- LAN mode: Linux thin client connects to Mac running LM Studio with "Serve on Local Network" enabled.
- Keyboard shortcuts differ per platform — detect with Tauri's `os.platform()` or `navigator.platform`.

## Known model quirks

- **Qwen3**: Supports `/no_think` in system prompt + `chat_template_kwargs: {"enable_thinking": false}`. Both are sent (belt-and-suspenders) because local servers may not support `chat_template_kwargs`.
- **Qwen3.5**: Supports `chat_template_kwargs: {"enable_thinking": false}` (confirmed via HuggingFace discussion). Also gets `/no_think` prefix as fallback. Does NOT support `/think`/`/nothink` soft switches in message content.
- **GPT-OSS (openai/gpt-oss-20b, harmony)**: Reasoning in `reasoning_content` field (aliased as `reasoning` by some servers). `reasoning_effort` param sent via `ChatRequest.extra` but **LM Studio ignores it** on `/v1/chat/completions` (open issue #1250). Works via `chat_template_kwargs` on llama.cpp. See `docs/LLAMA_CPP_INTEGRATION.md`.
- **Title generation**: Uses a separate small model (default Qwen3 0.6B) to avoid reasoning overhead. Profile-aware suppression applied automatically.

## Typography

- **Inter variable font** (`@fontsource-variable/inter`) bundled via npm, imported in `main.tsx`.
- OpenType stylistic alternates enabled: `cv02`, `cv03`, `cv04`, `cv11` (refined letterforms for a, g, l).
- Fallback chain: Inter Variable → Inter → system fonts.

## Chat UI design

- **User messages**: right-aligned bubble with `bg-accent/20`, `rounded-2xl`, max-width 85%.
- **Assistant messages**: full-width, flat against the background (no bubble), matching the style of ChatGPT/Claude.
- **Copy button**: renders below message content (not overlaid on top), visible on hover.
- **Agent activity**: collapsible block above assistant content showing thinking + tool calls.
