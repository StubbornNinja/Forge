# TASKS.md — Forge Build Checklist

**Instructions for Claude Code:** Work through these tasks in order. Each task is atomic — complete it fully before moving to the next. Check the box when done. If a task fails, fix it before proceeding. Reference `FORGE_SPEC.md` for detailed specs on any task.

---

## Phase 1 — Scaffold & Infrastructure

- [x] **1.1** Initialize Tauri v2 project with React TypeScript template. Verify `cargo tauri dev` opens a window.
- [x] **1.2** Install and configure Tailwind CSS v4. Add design tokens to `globals.css` (CSS custom properties with light/dark theme support via `prefers-color-scheme` and `data-theme` attribute).
- [x] **1.3** Install Zustand. Create store files: `chatStore.ts`, `conversationStore.ts`, `settingsStore.ts`, `uiStore.ts`.
- [x] **1.4** Create the full Rust module tree (`commands/`, `db/`, `inference/`, `orchestrator/`, `tools/`, `files/`, `config/`, `system_prompt/`) with `mod.rs` files. Verify `cargo build` succeeds.
- [x] **1.5** Add all Rust dependencies to `Cargo.toml`: tauri v2, serde, tokio, rusqlite (bundled + vtab), reqwest (json + stream), uuid, chrono, thiserror, log, env_logger, futures, async-stream, async-trait. Verify `cargo build` still succeeds.
- [x] **1.6** Install frontend dependencies: `react-markdown`, `remark-gfm`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-shell`. Verify `npm run dev` still works.

**Checkpoint:** COMPLETE

---

## Phase 2 — Backend Core

- [x] **2.1** Implement `ForgeError` enum in `src-tauri/src/error.rs` with variants. Implement `Serialize` for Tauri IPC. Define `pub type Result<T>`.
- [x] **2.2** Implement DB connection setup in `src-tauri/src/db/connection.rs`. Initialize SQLite at `app_data_dir/forge.db`. Enable WAL mode and foreign keys. Wrap in `Mutex<Connection>`.
- [x] **2.3** Implement migrations in `src-tauri/src/db/migrations.rs`. Create `_migrations` tracking table. Apply migrations: conversations + messages, FTS5, settings table.
- [x] **2.4** Write tests for migrations.
- [x] **2.5** Implement conversation queries in `src-tauri/src/db/conversations.rs`: create, get, list, update title, delete (cascade). Write tests.
- [x] **2.6** Implement message queries in `src-tauri/src/db/messages.rs`: insert, get by conversation, FTS search. Write tests.
- [x] **2.7** Define all Rust data model structs.
- [x] **2.8** Implement `AppSettings` struct with load/save. Includes: `inference_url`, `default_model`, `temperature`, `max_tokens`, `searxng_url`, `search_enabled`, `send_shortcut`, `theme`, `system_prompt_enabled`, `custom_system_prompt`, `title_model`.
- [x] **2.9** Define `ModelProvider` trait with: `list_models`, `chat_completion`, `chat_completion_stream`, `health_check`.
- [x] **2.10** Define inference types: `ChatRequest` (with `extra` flatten field), `ChatMessage`, `ToolCall`, `ToolDefinition`, `ChatResponse`, `StreamDelta`, etc.
- [x] **2.11** Implement `OpenAICompatProvider` with SSE parsing for streaming.
- [ ] **2.12** Write tests for `OpenAICompatProvider` (mock HTTP server).

**Checkpoint:** MOSTLY COMPLETE (missing provider unit tests)

---

## Phase 3 — Frontend Core

- [x] **3.1** Build `App.tsx` layout shell: sidebar + main content area. Theme application via `data-theme`. Drag region for macOS Overlay title bar.
- [x] **3.2** Implement all four Zustand stores with full type definitions and actions.
- [x] **3.3** Implement `src/lib/tauri.ts` with typed `api` object and `events` object (including `onConversationTitleUpdated`).
- [x] **3.4** Define all TypeScript types in `src/lib/types.ts`.
- [x] **3.5** Build `MarkdownRenderer.tsx` using `react-markdown` + `remark-gfm`.
- [x] **3.6** Build `CodeBlock.tsx` with syntax highlighting and copy button.

**Checkpoint:** COMPLETE

---

## Phase 4 — Chat & Streaming (Critical Path)

- [x] **4.1** Implement `AppState` struct in `main.rs`. Initialize with all required state. Register as Tauri managed state.
- [x] **4.2** Implement `send_message` Tauri command with streaming, tool call accumulation, agent loop (up to 5 rounds), and title generation trigger.
- [x] **4.3** Implement `stop_generation` via `CancellationToken`.
- [x] **4.4** Register commands in invoke_handler.
- [x] **4.5** Stream event subscriptions handled in `InputArea.tsx` (not a separate hook — events are subscribed in a `useEffect`).
- [x] **4.6** Build `ChatView.tsx`.
- [x] **4.7** Build `MessageList.tsx` with auto-scroll.
- [x] **4.8** Build `MessageBubble.tsx` with markdown rendering.
- [x] **4.9** Build `InputArea.tsx` with auto-grow textarea, send/stop buttons, keyboard shortcuts.
- [x] **4.10** Build `StreamingIndicator.tsx`.

**Checkpoint:** COMPLETE

---

## Phase 5 — Conversation Persistence

- [x] **5.1** Implement conversation CRUD commands: `create_conversation`, `list_conversations`, `get_messages`, `delete_conversation`, `rename_conversation`, `search_conversations`.
- [x] **5.2** Implement auto-title generation using a dedicated small model (`title_model` setting, default `unsloth/Qwen3-0.6B-GGUF`). Background tokio task, `clean_title()` parser, `conversation:title-updated` event.
- [x] **5.3** Conversation management in `conversationStore.ts` (no separate hook — stores handle it directly).
- [x] **5.4** Build `Sidebar.tsx` with new conversation button, search, conversation list.
- [x] **5.5** Build `ConversationItem.tsx` with title, timestamp, click to switch, rename/delete.
- [x] **5.6** Build `SearchBar.tsx` with FTS search.

**Checkpoint:** COMPLETE

---

## Phase 6 — Tool System

- [x] **6.1** Implement `Tool` trait and `ToolRegistry`.
- [x] **6.2** Implement orchestrator agent loop in `orchestrator/agent.rs` (up to 5 rounds).
- [x] **6.3** Integrate orchestrator into `send_message` — handles both simple responses and tool-use loops.
- [x] **6.4** Implement `WebSearchTool` querying SearXNG JSON API.
- [x] **6.5** Create `docker/docker-compose.yml` for SearXNG.
- [x] **6.6** Register `WebSearchTool` at initialization when search is enabled.
- [x] **6.7** Build `ToolCallDisplay.tsx` with inline tool call/result rendering. Also: `ActiveToolCall.tsx`.

**Checkpoint:** COMPLETE

---

## Phase 7 — File Upload & Processing

- [x] **7.1** Implement `upload_file` Tauri command.
- [x] **7.2** Implement file processor for text/code files and PDFs.
- [x] **7.3** File attach button in `InputArea.tsx` using Tauri file dialog.
- [x] **7.4** Build `FileChip.tsx`.
- [x] **7.5** Wire file content injection into messages.

**Checkpoint:** COMPLETE

---

## Phase 8 — System Prompt

- [x] **8.1** Implement `build_system_prompt` in `system_prompt/builder.rs`. Default personality prompt + tool-specific guidance + **current date/time injection** via `chrono::Local::now()`.
- [x] **8.2** Wire system prompt into `send_message` flow. Respects `system_prompt_enabled` and `custom_system_prompt`. Custom prompts also get timestamp appended.

**Checkpoint:** COMPLETE

---

## Phase 9 — Settings & Configuration

- [x] **9.1** Implement settings commands: `get_settings`, `update_settings`, `list_models`, `health_check`.
- [x] **9.2** Settings store in `settingsStore.ts` with load/update.
- [x] **9.3** Build `SettingsPanel.tsx` modal.
- [x] **9.4** Build `ModelConfig.tsx`: inference URL, test connection, model dropdown, temperature, max tokens.
- [x] **9.5** Build `GeneralConfig.tsx`: theme selector (System/Light/Dark), send shortcut, title model input, SearXNG URL + toggle, system prompt toggle + textarea.
- [x] **9.6** Settings changes persist to DB and update in-memory state.

**Checkpoint:** COMPLETE

---

## Phase 10 — Cross-Platform & LAN

- [ ] **10.1** Audit all file paths for cross-platform safety.
- [ ] **10.2** Add platform-aware keyboard shortcuts.
- [ ] **10.3** Add connection status indicator (green/red dot) with periodic health check polling.
- [ ] **10.4** Improve error messages for connection failures.
- [ ] **10.5** Document Linux build dependencies in README.md.
- [ ] **10.6** Configure Tauri build targets for macOS and Linux.

**Checkpoint:** NOT STARTED

---

## Phase 11 — Polish & Error Handling

- [ ] **11.1** Implement error states for: model server unreachable, stream interrupted, empty conversation, search no results, file upload failure, SearXNG unavailable.
- [ ] **11.2** Add loading states: skeleton placeholders, spinners, pulsing indicators.
- [ ] **11.3** Auto-scroll behavior with "scroll to bottom" button when user scrolls up.
- [ ] **11.4** Conversation list pagination or virtual scrolling for large lists.
- [ ] **11.5** Write remaining Rust tests: orchestrator, system prompt builder, settings, file processor.
- [ ] **11.6** Final Clippy pass: zero warnings.
- [ ] **11.7** Final frontend lint pass: zero warnings.

**Checkpoint:** NOT STARTED

---

## Post-MVP Enhancements (completed outside original spec)

- [x] **E.1** Light/dark/system theme support with CSS variable indirection and `prefers-color-scheme` media queries.
- [x] **E.2** macOS transparent title bar (`Overlay` style) with drag region and traffic light clearance.
- [x] **E.3** Minimum window size constraints (520x400).
- [x] **E.4** Dedicated title generation model support (`title_model` setting).
- [x] **E.5** `<think>` block parsing and `ThinkingBlock.tsx` collapsible display.
- [x] **E.6** `ChatRequest.extra` field with `#[serde(flatten)]` for model-specific parameters.
- [x] **E.7** System prompt timestamp injection (current date/time in every request).
- [x] **E.8** Model profile registry (`model_profile.rs`): data-driven detection of reasoning style and thinking suppression per model family (Qwen3, Qwen3.5, GPT-OSS).
- [x] **E.9** GPT-OSS `reasoning_content` field support with serde alias, streaming reasoning deltas, DB normalization to `<think>` tags.
- [x] **E.10** Reasoning effort UI control (Off/Low/Medium/High) in ModelConfig settings.
- [x] **E.11** Model-profile-aware title generation with per-model thinking suppression.
- [x] **E.12** Agent activity grouping: intermediate tool calls/thinking collapsed into expandable `AgentActivityBlock`.
- [x] **E.13** Inter variable font with OpenType stylistic alternates.
- [x] **E.14** Assistant messages render flat (no bubble); copy button moved below content.

---

## Verification Sequence

After all tasks are complete, run through this manually:

1. `cargo tauri dev` — app opens
2. Click "New conversation" — blank chat appears
3. Type "Hello, what can you do?" and send — streaming response appears
4. Response renders markdown correctly (try asking for code)
5. Sidebar shows the conversation with an auto-generated title
6. Create a second conversation, switch between them — messages persist
7. Search for a word from a previous message — found
8. Attach a `.txt` file and ask about its contents — model reads the file
9. Ask a question that triggers web search (if SearXNG is running) — tool call appears inline
10. Open settings — change temperature, test connection, switch models
11. Stop a generation mid-stream — stops cleanly
12. Delete a conversation — removed from sidebar
13. Close and reopen the app — conversations persist
14. Toggle theme to Light — UI updates correctly
15. Set theme to System — follows OS preference
16. Title bar blends with app background in both light and dark modes
