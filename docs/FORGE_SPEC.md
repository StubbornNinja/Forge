# Forge — Design Specification for Claude Code

**Version:** 2.0
**Date:** 2026-03-13
**Purpose:** Complete, atomic build specification for Claude Code to implement Forge end-to-end.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Deployment Topology](#2-deployment-topology)
3. [Directory Structure](#3-directory-structure)
4. [Phase 1 — Scaffold & Infrastructure](#4-phase-1--scaffold--infrastructure)
5. [Phase 2 — Backend Core (Rust/Tauri)](#5-phase-2--backend-core-rusttauri)
6. [Phase 3 — Frontend Core (React)](#6-phase-3--frontend-core-react)
7. [Phase 4 — Chat & Streaming](#7-phase-4--chat--streaming)
8. [Phase 5 — Conversation Persistence](#8-phase-5--conversation-persistence)
9. [Phase 6 — Tool System](#9-phase-6--tool-system)
10. [Phase 7 — File Upload & Processing](#10-phase-7--file-upload--processing)
11. [Phase 8 — Web Search](#11-phase-8--web-search)
12. [Phase 9 — System Prompt & Alignment](#12-phase-9--system-prompt--alignment)
13. [Phase 10 — Settings & Configuration](#13-phase-10--settings--configuration)
14. [Phase 11 — Cross-Platform & LAN](#14-phase-11--cross-platform--lan)
15. [Phase 12 — Polish & Testing](#15-phase-12--polish--testing)
16. [Data Models](#16-data-models)
17. [Database Schema](#17-database-schema)
18. [IPC Command Reference](#18-ipc-command-reference)
19. [Future Roadmap](#19-future-roadmap)

---

## 1. Project Overview

**Forge** is a local-first AI assistant desktop application. Think ChatGPT/Claude desktop — but running entirely on your own hardware with local model inference, file upload, and web search.

### Core Goals

- **Privacy-first**: All data stays local. No telemetry, no cloud dependency for core functionality.
- **Backend-agnostic inference**: Abstract model providers behind a trait so LM Studio, MLX server, llama.cpp, or any OpenAI-compatible endpoint works interchangeably.
- **Alignment-aware**: The system prompt embodies calibrated honesty, epistemic humility, avoidance of sycophancy, and respect for user autonomy — via a character-based design, not a rules list.
- **Extensible**: Tool registry pattern supports adding new capabilities without modifying core logic.
- **Cross-platform**: Runs on macOS (primary/inference host) and Linux (CachyOS/Arch thin client over LAN).

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Backend language | Rust |
| Frontend framework | React 18+ with TypeScript |
| State management | Zustand |
| Database | SQLite with FTS5 (via rusqlite) |
| Inference | OpenAI-compatible API (LM Studio / MLX server / llama.cpp) |
| Web search | SearXNG (self-hosted, Docker) |
| Styling | Tailwind CSS |
| Build | Vite (frontend), Cargo (backend) |

---

## 2. Deployment Topology

Forge supports two modes:

### Mode A — Standalone (single machine)

```
┌─────────────────────────────────────┐
│          macOS (Apple Silicon)       │
│  ┌──────────┐     ┌──────────────┐  │
│  │  Forge   │────▶│  LM Studio   │  │
│  │  (Tauri) │     │  (localhost)  │  │
│  └──────────┘     └──────────────┘  │
└─────────────────────────────────────┘
```

### Mode B — Split / Thin Client (LAN)

```
┌──────────────────────┐         ┌──────────────────────────┐
│  CachyOS (Linux)     │  LAN   │  macOS (Apple Silicon)   │
│  ┌──────────┐        │◀──────▶│  ┌──────────────┐        │
│  │  Forge   │────────┼────────┼─▶│  LM Studio   │        │
│  │  (Tauri) │        │        │  │  (LAN serve)  │        │
│  └──────────┘        │        │  └──────────────┘        │
└──────────────────────┘         └──────────────────────────┘
```

**LAN setup requirements:**
- LM Studio → Settings → "Serve on Local Network" enabled
- Mac firewall allows inbound on LM Studio's port (default 1234)
- Linux client configured with `http://<mac-ip>:1234` as the inference endpoint

---

## 3. Directory Structure

```
forge/
├── src-tauri/                          # Rust backend (Tauri)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json                # Tauri v2 permission capabilities
│   ├── src/
│   │   ├── main.rs                     # Entry point, app builder
│   │   ├── lib.rs                      # Module declarations
│   │   ├── commands/                   # Tauri IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── chat.rs                 # send_message, stop_generation
│   │   │   ├── conversations.rs        # CRUD for conversations
│   │   │   ├── files.rs                # File upload, processing
│   │   │   ├── search.rs              # Web search
│   │   │   └── settings.rs            # App configuration
│   │   ├── db/                         # Database layer
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs           # Pool/connection management
│   │   │   ├── migrations.rs           # Schema migrations
│   │   │   ├── conversations.rs        # Conversation queries
│   │   │   └── messages.rs             # Message queries
│   │   ├── inference/                  # Model provider abstraction
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs             # ModelProvider trait
│   │   │   ├── openai_compat.rs        # OpenAI-compatible client
│   │   │   └── types.rs               # Request/response types
│   │   ├── orchestrator/               # Agent loop
│   │   │   ├── mod.rs
│   │   │   └── agent.rs               # Orchestrator logic
│   │   ├── tools/                      # Tool registry & implementations
│   │   │   ├── mod.rs
│   │   │   ├── registry.rs            # Tool registry (Box<dyn Tool>)
│   │   │   ├── web_search.rs          # SearXNG integration
│   │   │   └── file_reader.rs         # File content extraction
│   │   ├── files/                      # File processing pipeline
│   │   │   ├── mod.rs
│   │   │   ├── processor.rs           # File type detection & extraction
│   │   │   └── store.rs              # File metadata storage
│   │   ├── config/                     # Configuration management
│   │   │   ├── mod.rs
│   │   │   └── settings.rs           # Settings struct & persistence
│   │   ├── system_prompt/              # System prompt assembly
│   │   │   ├── mod.rs
│   │   │   └── builder.rs            # Character-based prompt builder
│   │   └── error.rs                   # Unified error types
│   └── icons/                          # App icons
│
├── src/                                # React frontend
│   ├── main.tsx                        # React entry point
│   ├── App.tsx                         # Root component, layout
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatView.tsx           # Main chat area
│   │   │   ├── MessageList.tsx        # Scrollable message list
│   │   │   ├── MessageBubble.tsx      # Individual message rendering
│   │   │   ├── InputArea.tsx          # Text input + file attach + send
│   │   │   ├── StreamingIndicator.tsx # Typing/streaming indicator
│   │   │   └── ToolCallDisplay.tsx    # Inline tool call results
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx            # Conversation list sidebar
│   │   │   ├── ConversationItem.tsx   # Single conversation row
│   │   │   └── SearchBar.tsx          # FTS conversation search
│   │   ├── settings/
│   │   │   ├── SettingsPanel.tsx      # Settings modal/panel
│   │   │   ├── ModelConfig.tsx        # Model provider settings
│   │   │   └── GeneralConfig.tsx      # General preferences
│   │   └── shared/
│   │       ├── MarkdownRenderer.tsx   # Markdown + code highlighting
│   │       ├── CodeBlock.tsx          # Syntax-highlighted code blocks
│   │       └── FileChip.tsx           # Attached file badge
│   ├── hooks/
│   │   ├── useChat.ts                 # Chat send/receive/stream logic
│   │   ├── useConversations.ts        # Conversation CRUD
│   │   ├── useSettings.ts            # Settings read/write
│   │   └── useSearch.ts              # Conversation search
│   ├── stores/
│   │   ├── chatStore.ts              # Zustand: active chat state
│   │   ├── conversationStore.ts      # Zustand: conversation list
│   │   ├── settingsStore.ts          # Zustand: app settings
│   │   └── uiStore.ts               # Zustand: UI state (sidebar, modals)
│   ├── lib/
│   │   ├── tauri.ts                  # Tauri invoke/event wrappers
│   │   ├── markdown.ts               # Markdown parsing config
│   │   └── types.ts                  # Shared TypeScript types
│   ├── styles/
│   │   └── globals.css               # Tailwind base + custom tokens
│   └── index.html
│
├── docker/
│   └── docker-compose.yml             # SearXNG service definition
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## 4. Phase 1 — Scaffold & Infrastructure

**Goal:** Bootable Tauri v2 app with React frontend, Tailwind, and Zustand wired up. No functionality yet — just the skeleton.

### Task 1.1 — Initialize Tauri v2 project

```bash
# Prerequisites: Rust toolchain, Node.js 18+
npm create tauri-app@latest forge -- --template react-ts
cd forge
```

**Acceptance criteria:**
- `cargo tauri dev` opens a window with the React dev server
- Hot reload works for both frontend and backend

### Task 1.2 — Configure Tailwind CSS

```bash
npm install -D tailwindcss @tailwindcss/typography postcss autoprefixer
npx tailwindcss init -p
```

**tailwind.config.ts:**
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        border: {
          DEFAULT: 'var(--border)',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config;
```

**globals.css — design tokens (dark-first):**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --surface-primary: #1a1a1a;
  --surface-secondary: #242424;
  --surface-tertiary: #2e2e2e;
  --text-primary: #e5e5e5;
  --text-secondary: #a3a3a3;
  --text-muted: #6b6b6b;
  --accent: #6d9eeb;
  --accent-hover: #8bb4f0;
  --border: #333333;
}
```

### Task 1.3 — Install and configure Zustand

```bash
npm install zustand
```

Create placeholder stores (empty, to be filled in later phases):
- `src/stores/chatStore.ts`
- `src/stores/conversationStore.ts`
- `src/stores/settingsStore.ts`
- `src/stores/uiStore.ts`

Each exports a Zustand store with a minimal initial shape (see [Data Models](#16-data-models) for full types).

### Task 1.4 — Set up Rust module structure

Create all the directories and `mod.rs` files listed in the directory structure above. Each module starts with a placeholder `// TODO: implement` comment. The goal is that the crate compiles cleanly with the module tree declared.

**Acceptance criteria:**
- `cargo build` succeeds with no errors
- All modules are declared and reachable from `lib.rs`
- `cargo tauri dev` still opens the window

### Task 1.5 — Add Rust dependencies to Cargo.toml

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled", "vtab"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
log = "0.4"
env_logger = "0.11"
futures = "0.3"
async-stream = "0.3"
```

**Note to Claude Code:** Pin exact versions at build time. If any version has moved past what's listed, use the latest compatible version and note the change.

---

## 5. Phase 2 — Backend Core (Rust/Tauri)

### Task 2.1 — Unified error type

**File:** `src-tauri/src/error.rs`

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ForgeError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Inference error: {0}")]
    Inference(String),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Tool error: {0}")]
    Tool(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("{0}")]
    General(String),
}

// Required for Tauri IPC — errors must be serializable
impl serde::Serialize for ForgeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ForgeError>;
```

### Task 2.2 — Database connection & migrations

**File:** `src-tauri/src/db/connection.rs`

- Use `rusqlite::Connection` wrapped in `Mutex<Connection>` managed as Tauri state.
- DB file location: use `app.path().app_data_dir()` / `forge.db` (Tauri v2 path API).
- On startup, run migrations.

**File:** `src-tauri/src/db/migrations.rs`

Three migrations, applied in order. Track applied migrations via a `_migrations` table.

```sql
-- Migration 001: Core tables
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    model TEXT,
    system_prompt TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    token_count INTEGER,
    model TEXT,
    tool_calls TEXT,          -- JSON: array of tool call objects
    tool_call_id TEXT,        -- For tool-result messages
    attachments TEXT,         -- JSON: array of attachment metadata
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sort_order);

-- Migration 002: Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = OLD.rowid;
    INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

-- Migration 003: Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

**Acceptance criteria:**
- On first launch, DB is created with all tables
- On subsequent launches, migrations are skipped (idempotent)
- FTS triggers fire correctly (write a test)

### Task 2.3 — Database query layer

**File:** `src-tauri/src/db/conversations.rs`

Implement these functions:
- `create_conversation(conn, title, model, system_prompt) -> Result<Conversation>`
- `get_conversation(conn, id) -> Result<Conversation>`
- `list_conversations(conn, limit, offset) -> Result<Vec<ConversationSummary>>`
- `update_conversation_title(conn, id, title) -> Result<()>`
- `delete_conversation(conn, id) -> Result<()>`

**File:** `src-tauri/src/db/messages.rs`

- `insert_message(conn, msg: NewMessage) -> Result<Message>`
- `get_messages(conn, conversation_id) -> Result<Vec<Message>>`
- `search_messages(conn, query: &str, limit) -> Result<Vec<SearchResult>>`

See [Data Models](#16-data-models) for the struct definitions these map to.

### Task 2.4 — ModelProvider trait & OpenAI-compatible client

**File:** `src-tauri/src/inference/provider.rs`

```rust
use async_trait::async_trait;

#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// List available models from the backend
    async fn list_models(&self) -> crate::Result<Vec<ModelInfo>>;

    /// Send a chat completion request, returning the full response
    async fn chat_completion(&self, request: ChatRequest) -> crate::Result<ChatResponse>;

    /// Send a chat completion request, returning a stream of deltas
    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> crate::Result<Box<dyn futures::Stream<Item = crate::Result<StreamDelta>> + Send + Unpin>>;

    /// Check if the backend is reachable
    async fn health_check(&self) -> crate::Result<bool>;
}
```

**File:** `src-tauri/src/inference/openai_compat.rs`

Implement `OpenAICompatProvider` that satisfies the `ModelProvider` trait:

- Constructor takes `base_url: String` (e.g., `http://localhost:1234` or `http://192.168.1.50:1234`)
- Uses `reqwest` for HTTP
- Endpoints:
  - `GET /v1/models` → `list_models`
  - `POST /v1/chat/completions` → `chat_completion` (with `stream: false`)
  - `POST /v1/chat/completions` → `chat_completion_stream` (with `stream: true`, parse SSE)
- SSE parsing: read `data: {...}` lines, deserialize delta chunks, yield via `async_stream::stream!`
- Handle `[DONE]` sentinel to close the stream
- Health check: `GET /v1/models` returns 200

**File:** `src-tauri/src/inference/types.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,        // "system" | "user" | "assistant" | "tool"
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,   // always "function"
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,   // JSON string
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub def_type: String,    // always "function"
    pub function: FunctionDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value, // JSON Schema
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    pub content: Option<String>,
    pub tool_calls: Option<Vec<ToolCallDelta>>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallDelta {
    pub index: usize,
    pub id: Option<String>,
    pub function: Option<FunctionCallDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCallDelta {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub owned_by: Option<String>,
}
```

**Acceptance criteria:**
- Can instantiate `OpenAICompatProvider` with a base URL
- `health_check` returns true when LM Studio is running
- `list_models` returns the loaded model(s)
- `chat_completion` returns a response for a simple prompt
- `chat_completion_stream` yields deltas that, concatenated, form the full response
- All operations return meaningful errors when the backend is unreachable

### Task 2.5 — Configuration management

**File:** `src-tauri/src/config/settings.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    // Inference
    pub inference_url: String,           // default: "http://localhost:1234"
    pub default_model: Option<String>,
    pub temperature: f32,                // default: 0.7
    pub max_tokens: u32,                 // default: 4096

    // Search
    pub searxng_url: String,             // default: "http://localhost:8080"
    pub search_enabled: bool,            // default: true

    // UI
    pub send_shortcut: String,           // "Enter" or "Ctrl+Enter"
    pub theme: String,                   // "dark" (only dark for now)

    // System prompt
    pub system_prompt_enabled: bool,     // default: true
    pub custom_system_prompt: Option<String>,
}
```

Persistence: read/write to the `settings` table as individual key-value pairs. Provide `load_settings(conn)` and `save_settings(conn, settings)` functions.

---

## 6. Phase 3 — Frontend Core (React)

### Task 3.1 — App layout shell

**File:** `src/App.tsx`

Three-region layout:
```
┌──────────┬──────────────────────────┐
│          │                          │
│ Sidebar  │       Chat View          │
│ (280px)  │                          │
│          │                          │
│          │                          │
│          ├──────────────────────────┤
│          │      Input Area          │
└──────────┴──────────────────────────┘
```

- Sidebar is collapsible (toggle button, or collapse on small viewports)
- Chat view fills remaining space, flex column
- Input area pinned to bottom

### Task 3.2 — Zustand stores (full implementation)

**chatStore.ts:**
```typescript
interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  activeConversationId: string | null;
  error: string | null;

  // Actions
  addMessage: (msg: Message) => void;
  updateStreamingContent: (content: string) => void;
  appendStreamingContent: (delta: string) => void;
  finalizeStream: (fullMessage: Message) => void;
  setStreaming: (streaming: boolean) => void;
  setMessages: (messages: Message[]) => void;
  setActiveConversation: (id: string | null) => void;
  clearError: () => void;
}
```

**conversationStore.ts:**
```typescript
interface ConversationState {
  conversations: ConversationSummary[];
  loading: boolean;

  // Actions
  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
}
```

**settingsStore.ts:**
```typescript
interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}
```

**uiStore.ts:**
```typescript
interface UIState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  searchQuery: string;

  toggleSidebar: () => void;
  toggleSettings: () => void;
  setSearchQuery: (q: string) => void;
}
```

### Task 3.3 — Tauri IPC wrapper

**File:** `src/lib/tauri.ts`

Typed wrappers around `invoke()` and `listen()`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// Invoke wrappers — one per IPC command
export const api = {
  sendMessage: (conversationId: string, content: string, attachments?: string[]) =>
    invoke<void>('send_message', { conversationId, content, attachments }),

  stopGeneration: () =>
    invoke<void>('stop_generation'),

  createConversation: () =>
    invoke<Conversation>('create_conversation'),

  listConversations: (limit?: number, offset?: number) =>
    invoke<ConversationSummary[]>('list_conversations', { limit, offset }),

  getMessages: (conversationId: string) =>
    invoke<Message[]>('get_messages', { conversationId }),

  deleteConversation: (id: string) =>
    invoke<void>('delete_conversation', { id }),

  renameConversation: (id: string, title: string) =>
    invoke<void>('rename_conversation', { id, title }),

  searchConversations: (query: string) =>
    invoke<SearchResult[]>('search_conversations', { query }),

  getSettings: () =>
    invoke<AppSettings>('get_settings'),

  updateSettings: (settings: Partial<AppSettings>) =>
    invoke<void>('update_settings', { settings }),

  listModels: () =>
    invoke<ModelInfo[]>('list_models'),

  healthCheck: () =>
    invoke<boolean>('health_check'),

  uploadFile: (path: string) =>
    invoke<FileMetadata>('upload_file', { path }),
};

// Event listeners for streaming
export const events = {
  onStreamDelta: (handler: (delta: StreamDelta) => void): Promise<UnlistenFn> =>
    listen<StreamDelta>('stream:delta', (event) => handler(event.payload)),

  onStreamEnd: (handler: (msg: Message) => void): Promise<UnlistenFn> =>
    listen<Message>('stream:end', (event) => handler(event.payload)),

  onStreamError: (handler: (error: string) => void): Promise<UnlistenFn> =>
    listen<string>('stream:error', (event) => handler(event.payload)),

  onToolCall: (handler: (call: ToolCallEvent) => void): Promise<UnlistenFn> =>
    listen<ToolCallEvent>('tool:call', (event) => handler(event.payload)),

  onToolResult: (handler: (result: ToolResultEvent) => void): Promise<UnlistenFn> =>
    listen<ToolResultEvent>('tool:result', (event) => handler(event.payload)),
};
```

### Task 3.4 — TypeScript types

**File:** `src/lib/types.ts`

```typescript
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  token_count?: number;
  model?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  model?: string;
  system_prompt?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallEvent {
  call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent {
  call_id: string;
  tool_name: string;
  result: string;
  is_error: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  extracted_text?: string;
}

export interface StreamDelta {
  content?: string;
  tool_calls?: ToolCallDelta[];
  finish_reason?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface AppSettings {
  inference_url: string;
  default_model?: string;
  temperature: number;
  max_tokens: number;
  searxng_url: string;
  search_enabled: boolean;
  send_shortcut: 'Enter' | 'Ctrl+Enter';
  theme: 'dark';
  system_prompt_enabled: boolean;
  custom_system_prompt?: string;
}

export interface ModelInfo {
  id: string;
  owned_by?: string;
}

export interface SearchResult {
  conversation_id: string;
  conversation_title: string;
  message_id: string;
  content_snippet: string;
  rank: number;
}
```

---

## 7. Phase 4 — Chat & Streaming

This is the critical path. After this phase, you can type a message and get a streaming response.

### Task 4.1 — Tauri IPC command: `send_message`

**File:** `src-tauri/src/commands/chat.rs`

```rust
#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    conversation_id: String,
    content: String,
    attachments: Option<Vec<String>>,
) -> Result<(), ForgeError> {
    // 1. Insert user message into DB
    // 2. Load conversation history from DB
    // 3. Build ChatRequest (system prompt + history + new message)
    // 4. Call provider.chat_completion_stream()
    // 5. For each delta:
    //    - Emit "stream:delta" event to frontend
    //    - If delta contains tool_calls, accumulate them
    // 6. On stream end:
    //    - If tool calls present, execute via orchestrator (Phase 6)
    //    - Insert assistant message into DB
    //    - Emit "stream:end" event with the full Message
    // 7. On error: emit "stream:error"
    Ok(())
}
```

**Key detail — cancellation:**
Use a `CancellationToken` (or `tokio::sync::watch`) stored in `AppState` so `stop_generation` can signal the stream loop to break.

```rust
#[tauri::command]
pub async fn stop_generation(
    state: tauri::State<'_, AppState>,
) -> Result<(), ForgeError> {
    state.cancel_token.cancel();
    Ok(())
}
```

### Task 4.2 — AppState struct

**File:** `src-tauri/src/main.rs` (or a dedicated `state.rs`)

```rust
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub provider: Box<dyn ModelProvider>,
    pub settings: RwLock<AppSettings>,
    pub cancel_token: CancellationToken,
    pub tool_registry: ToolRegistry,
}
```

Register as Tauri managed state in the app builder.

### Task 4.3 — Frontend useChat hook

**File:** `src/hooks/useChat.ts`

```typescript
export function useChat() {
  const {
    messages, isStreaming, streamingContent,
    addMessage, appendStreamingContent, finalizeStream,
    setStreaming, setMessages, setActiveConversation,
  } = useChatStore();

  useEffect(() => {
    // Subscribe to stream events
    const unlistenDelta = events.onStreamDelta((delta) => {
      if (delta.content) {
        appendStreamingContent(delta.content);
      }
    });

    const unlistenEnd = events.onStreamEnd((msg) => {
      finalizeStream(msg);
    });

    const unlistenError = events.onStreamError((err) => {
      setStreaming(false);
      // Set error in store
    });

    return () => {
      // Cleanup listeners
      unlistenDelta.then(fn => fn());
      unlistenEnd.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, []);

  const sendMessage = async (content: string, attachments?: string[]) => {
    const conversationId = useChatStore.getState().activeConversationId;
    if (!conversationId || !content.trim()) return;

    // Optimistically add user message to UI
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      attachments: [], // TODO: map from file metadata
    };
    addMessage(userMsg);
    setStreaming(true);

    try {
      await api.sendMessage(conversationId, content, attachments);
    } catch (err) {
      setStreaming(false);
    }
  };

  const stopGeneration = async () => {
    await api.stopGeneration();
    setStreaming(false);
  };

  return { messages, isStreaming, streamingContent, sendMessage, stopGeneration };
}
```

### Task 4.4 — ChatView, MessageList, MessageBubble, InputArea components

**ChatView.tsx** — wires together MessageList, streaming indicator, and InputArea.

**MessageList.tsx:**
- Renders messages from the store
- Auto-scrolls to bottom on new messages / streaming content
- If `isStreaming`, render an in-progress assistant bubble using `streamingContent`

**MessageBubble.tsx:**
- User messages: right-aligned, accent background
- Assistant messages: left-aligned, secondary background
- Content rendered via MarkdownRenderer
- If message has `tool_calls`, render ToolCallDisplay inline

**InputArea.tsx:**
- Multiline textarea (auto-grows, max 200px)
- Send button (or keyboard shortcut based on settings)
- File attach button (triggers native file dialog via Tauri)
- Stop button (visible when streaming)
- Disabled state when streaming (except stop button)

**Acceptance criteria:**
- Type a message, press send → user message appears immediately
- Assistant response streams in token-by-token
- Stop button halts generation
- Messages persist across conversation switches (loaded from DB)

---

## 8. Phase 5 — Conversation Persistence

### Task 5.1 — Conversation CRUD commands

**File:** `src-tauri/src/commands/conversations.rs`

Register these Tauri commands:

```rust
#[tauri::command]
pub async fn create_conversation(state: State<'_, AppState>) -> Result<Conversation, ForgeError>;

#[tauri::command]
pub async fn list_conversations(
    state: State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<ConversationSummary>, ForgeError>;

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<Message>, ForgeError>;

#[tauri::command]
pub async fn delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), ForgeError>;

#[tauri::command]
pub async fn rename_conversation(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<(), ForgeError>;

#[tauri::command]
pub async fn search_conversations(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, ForgeError>;
```

### Task 5.2 — Auto-title generation

After the first assistant response in a conversation, fire a separate (non-streaming) inference call:

```
System: Generate a short (3-6 word) title for this conversation. Respond with ONLY the title.
User: <first user message>
Assistant: <first assistant response>
```

Update the conversation title in the DB and emit an event so the sidebar refreshes.

### Task 5.3 — Sidebar component

**Sidebar.tsx:**
- "New conversation" button at top
- Search input (debounced, triggers FTS search)
- Scrollable conversation list, sorted by `updated_at` desc
- Each item shows title + relative timestamp ("2m ago", "Yesterday", etc.)
- Right-click context menu: Rename, Delete
- Click to switch conversations (loads messages from DB)

### Task 5.4 — useConversations hook

```typescript
export function useConversations() {
  const store = useConversationStore();

  const loadConversations = async () => {
    const convos = await api.listConversations(50, 0);
    store.setConversations(convos);
  };

  const createAndSwitch = async () => {
    const convo = await api.createConversation();
    await loadConversations();
    useChatStore.getState().setActiveConversation(convo.id);
    useChatStore.getState().setMessages([]);
  };

  const switchConversation = async (id: string) => {
    useChatStore.getState().setActiveConversation(id);
    const messages = await api.getMessages(id);
    useChatStore.getState().setMessages(messages);
  };

  // Load on mount
  useEffect(() => { loadConversations(); }, []);

  return { ...store, createAndSwitch, switchConversation, loadConversations };
}
```

---

## 9. Phase 6 — Tool System

### Task 6.1 — Tool trait and registry

**File:** `src-tauri/src/tools/registry.rs`

```rust
use async_trait::async_trait;

#[async_trait]
pub trait Tool: Send + Sync {
    /// Tool name (matches function name in tool_calls)
    fn name(&self) -> &str;

    /// Description for the model
    fn description(&self) -> &str;

    /// JSON Schema for parameters
    fn parameters_schema(&self) -> serde_json::Value;

    /// Execute the tool with given arguments
    async fn execute(&self, arguments: serde_json::Value) -> crate::Result<String>;
}

pub struct ToolRegistry {
    tools: Vec<Box<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self { tools: Vec::new() }
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.push(tool);
    }

    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        self.tools.iter().find(|t| t.name() == name).map(|t| t.as_ref())
    }

    /// Generate tool definitions array for the chat request
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools.iter().map(|t| ToolDefinition {
            def_type: "function".to_string(),
            function: FunctionDefinition {
                name: t.name().to_string(),
                description: t.description().to_string(),
                parameters: t.parameters_schema(),
            },
        }).collect()
    }
}
```

### Task 6.2 — Orchestrator agent loop

**File:** `src-tauri/src/orchestrator/agent.rs`

The orchestrator handles the tool-use loop:

```
1. Send messages to model (with tool definitions)
2. Receive response
3. If response contains tool_calls:
   a. For each tool call:
      - Emit "tool:call" event to frontend
      - Execute tool via registry
      - Emit "tool:result" event to frontend
   b. Append assistant message (with tool_calls) to message history
   c. Append tool result messages to history
   d. Go to step 1 (re-send to model with tool results)
4. If response is plain text (no tool_calls):
   - Return the final response
```

**Max iterations:** 5 tool-call rounds (prevent infinite loops). Configurable.

**Important:** Emit events at each step so the frontend can show tool execution in real-time.

### Task 6.3 — Web search tool (SearXNG)

**File:** `src-tauri/src/tools/web_search.rs`

```rust
pub struct WebSearchTool {
    searxng_url: String,
    client: reqwest::Client,
}

impl WebSearchTool {
    pub fn new(searxng_url: String) -> Self {
        Self {
            searxng_url,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str { "web_search" }

    fn description(&self) -> &str {
        "Search the web for current information. Use when you need up-to-date facts, news, or information beyond your training data."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (default 5, max 10)",
                    "default": 5
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, arguments: serde_json::Value) -> crate::Result<String> {
        let query = arguments["query"].as_str()
            .ok_or_else(|| ForgeError::Tool("Missing 'query' argument".into()))?;
        let num_results = arguments["num_results"].as_u64().unwrap_or(5).min(10);

        let response = self.client
            .get(format!("{}/search", self.searxng_url))
            .query(&[
                ("q", query),
                ("format", "json"),
                ("engines", "google,duckduckgo,brave"),
            ])
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        // Extract and format results
        let results = response["results"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .take(num_results as usize)
                    .map(|r| {
                        format!(
                            "**{}**\n{}\nURL: {}",
                            r["title"].as_str().unwrap_or(""),
                            r["content"].as_str().unwrap_or(""),
                            r["url"].as_str().unwrap_or("")
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n---\n\n")
            })
            .unwrap_or_else(|| "No results found.".to_string());

        Ok(results)
    }
}
```

### Task 6.4 — Docker compose for SearXNG

**File:** `docker/docker-compose.yml`

```yaml
version: '3.8'

services:
  searxng:
    image: searxng/searxng:latest
    container_name: forge-searxng
    ports:
      - "8080:8080"
    volumes:
      - ./searxng:/etc/searxng
    environment:
      - SEARXNG_BASE_URL=http://localhost:8080/
    restart: unless-stopped
```

Include a `docker/searxng/settings.yml` with sensible defaults (JSON output enabled, safe search off, rate limiting configured).

### Task 6.5 — ToolCallDisplay frontend component

**File:** `src/components/chat/ToolCallDisplay.tsx`

Renders inline in the message flow when the assistant invokes tools:

```
┌─────────────────────────────────┐
│ 🔍 web_search                   │
│ Query: "latest rust 2026 news"  │
│ ┌─────────────────────────────┐ │
│ │ Results:                    │ │
│ │ • Rust 1.84 Released...     │ │
│ │ • Async improvements...     │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- Collapsible (show/hide results)
- Shows a spinner while tool is executing
- Shows tool name, arguments summary, and result

---

## 10. Phase 7 — File Upload & Processing

### Task 7.1 — File upload command

**File:** `src-tauri/src/commands/files.rs`

```rust
#[tauri::command]
pub async fn upload_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<FileMetadata, ForgeError> {
    // 1. Copy file to app data dir (forge_files/)
    // 2. Detect MIME type
    // 3. Extract text content based on type
    // 4. Return metadata (id, filename, mime, size, extracted_text preview)
}
```

### Task 7.2 — File processor

**File:** `src-tauri/src/files/processor.rs`

Text extraction by file type:

| Type | Method |
|------|--------|
| `.txt`, `.md`, `.csv`, `.json`, `.yml`, `.toml` | Read as UTF-8 |
| `.pdf` | Use `pdf-extract` crate or shell out to `pdftotext` |
| `.docx` | Shell out to `pandoc` or use a Rust crate |
| `.rs`, `.py`, `.js`, `.ts`, etc. | Read as UTF-8, add language annotation |
| Images (`.png`, `.jpg`) | Store path only (no text extraction yet) |

**Return type:**
```rust
pub struct ProcessedFile {
    pub id: String,
    pub original_path: String,
    pub stored_path: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub extracted_text: Option<String>,
}
```

### Task 7.3 — Frontend file attach flow

In **InputArea.tsx:**
- Click paperclip icon → open Tauri file dialog (`dialog.open()`)
- Call `api.uploadFile(path)` for each selected file
- Show attached files as `FileChip` components below the textarea
- On send, pass attachment IDs along with the message
- Extracted text is injected into the conversation context (user message wraps it)

Format for injecting file content into the prompt:
```
<file name="report.pdf" type="application/pdf">
[extracted text content here]
</file>

[user's actual message]
```

---

## 11. Phase 8 — Web Search

(Covered in Phase 6, Task 6.3 and 6.4. This phase is about wiring it end-to-end.)

### Task 8.1 — Verify SearXNG integration

- `docker compose up -d` from the `docker/` directory
- Search tool registered in the tool registry on app startup
- Model can invoke `web_search` tool and receive results
- Results display in ToolCallDisplay component
- Settings panel has a toggle for search enabled/disabled and URL config

---

## 12. Phase 9 — System Prompt & Alignment

### Task 9.1 — System prompt builder

**File:** `src-tauri/src/system_prompt/builder.rs`

The system prompt uses a **character-based design** rather than a rules list. It describes the assistant's character traits and values, letting behavior emerge naturally.

```rust
pub fn build_system_prompt(
    custom_prompt: Option<&str>,
    tools_available: &[&str],
    current_date: &str,
) -> String {
    if let Some(custom) = custom_prompt {
        return custom.to_string();
    }

    let mut prompt = String::new();

    // Core identity
    prompt.push_str(&format!(
        "You are Forge, a helpful AI assistant running locally. Today is {}.\n\n",
        current_date
    ));

    // Character traits (not rules)
    prompt.push_str(r#"## Who you are

You are thoughtful, direct, and genuinely helpful. You care about giving accurate, useful answers and you're honest about what you know and don't know.

**Calibrated honesty**: You share your actual assessment of things, including uncertainty. If you're not sure about something, you say so clearly rather than hedging vaguely or presenting guesses as facts. You'd rather say "I don't know" than fabricate an answer.

**Epistemic humility**: You recognize the limits of your knowledge. You distinguish between things you're confident about and things you're reasoning about from incomplete information. You update your views when presented with good evidence.

**No sycophancy**: You don't reflexively agree with the user or tell them what they want to hear. If you think they're wrong about something, you say so respectfully. You give your honest opinion when asked, while acknowledging it's an opinion.

**Respect for autonomy**: You provide information and perspectives to help the user make their own decisions. You don't lecture or moralize unnecessarily. You treat the user as a capable adult.

**Conciseness**: You answer at the length the question deserves. Simple questions get short answers. Complex questions get thorough ones. You don't pad responses with filler.
"#);

    // Tool awareness
    if !tools_available.is_empty() {
        prompt.push_str("\n## Available tools\n\n");
        prompt.push_str("You have access to the following tools. Use them when they would genuinely help answer the user's question:\n\n");
        for tool in tools_available {
            prompt.push_str(&format!("- `{}`\n", tool));
        }
        prompt.push_str("\nDon't use tools unnecessarily. If you can answer from your training knowledge, do so.\n");
    }

    prompt
}
```

---

## 13. Phase 10 — Settings & Configuration

### Task 10.1 — Settings IPC commands

**File:** `src-tauri/src/commands/settings.rs`

```rust
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, ForgeError>;

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: serde_json::Value,  // Partial update
) -> Result<(), ForgeError>;

#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<ModelInfo>, ForgeError>;

#[tauri::command]
pub async fn health_check(state: State<'_, AppState>) -> Result<bool, ForgeError>;
```

### Task 10.2 — SettingsPanel component

**File:** `src/components/settings/SettingsPanel.tsx`

Modal or slide-over panel with sections:

**Model Configuration:**
- Inference URL text input (with "Test Connection" button)
- Model dropdown (populated by `list_models`, with refresh button)
- Temperature slider (0.0 – 2.0)
- Max tokens input

**Search Configuration:**
- SearXNG URL text input
- Search enabled toggle

**Interface:**
- Send shortcut toggle (Enter vs Ctrl+Enter)

**System Prompt:**
- Enable/disable toggle
- Custom system prompt textarea (overrides the default character prompt)
- "Reset to default" button

---

## 14. Phase 11 — Cross-Platform & LAN

### Task 11.1 — Platform-aware storage paths

Use Tauri v2's `app.path()` API everywhere. Never hardcode paths.

```rust
// Correct
let data_dir = app.path().app_data_dir().expect("No app data dir");
let db_path = data_dir.join("forge.db");

// Wrong
let db_path = PathBuf::from("/Users/tj/Library/Application Support/forge/forge.db");
```

### Task 11.2 — Linux build dependencies

Document in README:

```bash
# CachyOS / Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module \
  gtk3 librsvg libvips pango

# Build
cargo tauri build
```

### Task 11.3 — Keyboard shortcut mapping

| Action | macOS | Linux |
|--------|-------|-------|
| Send (default) | Enter | Enter |
| Send (alt) | ⌘+Enter | Ctrl+Enter |
| New conversation | ⌘+N | Ctrl+N |
| Search | ⌘+K | Ctrl+K |
| Settings | ⌘+, | Ctrl+, |
| Stop generation | Escape | Escape |
| Toggle sidebar | ⌘+B | Ctrl+B |

Implement via Tauri's global shortcut plugin or frontend `useEffect` keydown listeners. Use `navigator.platform` or Tauri's `os.platform()` to detect.

### Task 11.4 — LAN inference checklist (runtime)

On startup or when settings change:
1. Attempt `health_check()` against the configured inference URL
2. If it fails and URL is localhost, show: "Cannot reach model server at {url}. Is LM Studio running?"
3. If it fails and URL is a LAN address, show: "Cannot reach model server at {url}. Check that LM Studio has 'Serve on Local Network' enabled and the firewall allows connections."
4. Show connection status indicator in the UI (green dot = connected, red = unreachable)

---

## 15. Phase 12 — Polish & Testing

### Task 12.1 — Markdown rendering

**File:** `src/components/shared/MarkdownRenderer.tsx`

Use `react-markdown` with `remark-gfm` and a syntax highlighter (`react-syntax-highlighter` or `shiki`).

Support:
- Headings, bold, italic, strikethrough
- Code blocks with language detection and copy button
- Inline code
- Tables
- Lists (ordered and unordered)
- Links (open in external browser via Tauri shell)
- Blockquotes

### Task 12.2 — Code blocks with copy

**File:** `src/components/shared/CodeBlock.tsx`

- Language label in top-right corner
- Copy button that copies code to clipboard
- Syntax highlighting with a dark theme

### Task 12.3 — Rust tests

Write tests for:
- `db::migrations` — tables are created correctly
- `db::conversations` — CRUD operations
- `db::messages` — insert, query, FTS search
- `inference::openai_compat` — mock HTTP responses, verify parsing
- `tools::registry` — register, lookup, definitions generation
- `system_prompt::builder` — output format correctness

Use `#[cfg(test)]` modules in each file. For DB tests, use in-memory SQLite.

### Task 12.4 — Frontend error states

Handle gracefully:
- Model server unreachable
- Stream interrupted
- Empty conversation
- Search returns no results
- File upload fails
- SearXNG unavailable

Each error should surface a clear, non-technical message to the user.

### Task 12.5 — Loading states

- Conversation list: skeleton placeholders while loading
- Messages: spinner when loading history for a conversation switch
- Streaming: pulsing dot indicator
- Settings: loading indicator when testing connection

---

## 16. Data Models

### Rust Structs

```rust
// -- Conversation --
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub message_count: i64,
    pub last_message_preview: Option<String>,
}

// -- Message --
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub token_count: Option<i64>,
    pub model: Option<String>,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_call_id: Option<String>,
    pub attachments: Option<serde_json::Value>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMessage {
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub token_count: Option<i64>,
    pub model: Option<String>,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_call_id: Option<String>,
    pub attachments: Option<serde_json::Value>,
}

// -- Search --
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub conversation_id: String,
    pub conversation_title: String,
    pub message_id: String,
    pub content_snippet: String,
    pub rank: f64,
}

// -- Files --
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub extracted_text: Option<String>,
}
```

---

## 17. Database Schema

(Defined in full in Task 2.2. Reproduced here for reference.)

### Tables

1. **conversations** — id, title, created_at, updated_at, model, system_prompt
2. **messages** — id, conversation_id (FK), role, content, created_at, token_count, model, tool_calls (JSON), tool_call_id, attachments (JSON), sort_order
3. **messages_fts** — FTS5 virtual table on messages.content
4. **settings** — key-value store for app configuration

### Indexes

- `idx_messages_conversation` on `messages(conversation_id, sort_order)`

### Triggers

- `messages_ai` — after insert on messages → insert into FTS
- `messages_ad` — after delete on messages → delete from FTS
- `messages_au` — after update of content on messages → re-index FTS

---

## 18. IPC Command Reference

| Command | Direction | Payload | Returns |
|---------|-----------|---------|---------|
| `send_message` | FE → BE | `{ conversationId, content, attachments? }` | `void` (streams via events) |
| `stop_generation` | FE → BE | none | `void` |
| `create_conversation` | FE → BE | none | `Conversation` |
| `list_conversations` | FE → BE | `{ limit?, offset? }` | `ConversationSummary[]` |
| `get_messages` | FE → BE | `{ conversationId }` | `Message[]` |
| `delete_conversation` | FE → BE | `{ id }` | `void` |
| `rename_conversation` | FE → BE | `{ id, title }` | `void` |
| `search_conversations` | FE → BE | `{ query }` | `SearchResult[]` |
| `get_settings` | FE → BE | none | `AppSettings` |
| `update_settings` | FE → BE | `{ settings: Partial<AppSettings> }` | `void` |
| `list_models` | FE → BE | none | `ModelInfo[]` |
| `health_check` | FE → BE | none | `bool` |
| `upload_file` | FE → BE | `{ path }` | `FileMetadata` |

### Events (Backend → Frontend)

| Event | Payload | Description |
|-------|---------|-------------|
| `stream:delta` | `StreamDelta` | Streaming token chunk |
| `stream:end` | `Message` | Completed assistant message |
| `stream:error` | `string` | Error during generation |
| `tool:call` | `ToolCallEvent` | Tool execution started |
| `tool:result` | `ToolResultEvent` | Tool execution completed |

---

## 19. Future Roadmap

These are documented but **not in scope** for the initial build. Claude Code should not implement these.

- **RAG pipeline** — Embed uploaded documents into a vector store for retrieval
- **Memory system** — Summarize conversation history into a persistent memory block injected into context
- **Multiple provider support** — UI to configure and switch between multiple backends
- **Conversation branching** — Fork conversations at any message to explore alternatives
- **Plugin system** — Load tools from external files/directories at runtime
- **Export** — Export conversations as Markdown or JSON
- **Voice input** — Local whisper integration for speech-to-text
- **Image generation** — Local stable diffusion integration
- **Themes** — Light mode, custom color schemes

---

## Notes for Claude Code

### Build order matters

Follow the phases sequentially. Each phase depends on the prior one. Within a phase, tasks can generally be done in order.

### Testing approach

- Write tests as you go, not at the end
- Use in-memory SQLite for DB tests
- Mock the inference provider for chat/orchestrator tests
- Frontend: focus on ensuring components render without errors; skip E2E tests

### When in doubt

- **Error handling:** Always propagate errors with context. Never silently swallow.
- **Serialization:** Use `serde_json::Value` for flexible JSON fields (tool_calls, attachments). Don't over-model internal JSON.
- **Naming:** Use snake_case in Rust, camelCase in TypeScript. Tauri's command system auto-converts between them.
- **Tauri v2 specifics:** Use `tauri::State<'_>` for managed state. Commands are `async fn` with `#[tauri::command]`. Register commands in the builder with `.invoke_handler(tauri::generate_handler![...])`.

### What NOT to do

- Don't add authentication or user accounts
- Don't add cloud sync or telemetry
- Don't add a light theme yet
- Don't implement RAG or memory system
- Don't try to support non-OpenAI-compatible APIs
- Don't add real-time collaboration features
