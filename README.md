# Forge

A local-first AI assistant for macOS. Runs large language models on your own hardware — no cloud, no accounts, no telemetry.

Forge connects to local inference servers (LM Studio, llama.cpp, MLX) via the OpenAI-compatible API, or bundles its own llama.cpp server for a zero-config experience.

## Features

- Chat with streaming responses and tool use (web search, file reader)
- Conversation history with full-text search
- Built-in llama.cpp server with one-click model downloads
- Model-aware reasoning support (Qwen3/3.5, GPT-OSS)
- Adjustable reasoning effort (Off / Low / Medium / High)
- Light, dark, and system themes
- macOS-native look with overlay title bar

## Installation

### Download

Grab the latest `.dmg` from [Releases](https://github.com/StubbornNinja/Forge/releases).

Requires **Apple Silicon** (M1/M2/M3/M4).

### Install

1. Open the `.dmg` and drag **Forge** to your Applications folder
2. Open **Terminal** and run:
   ```bash
   xattr -cr /Applications/Forge.app
   ```
   This removes the macOS quarantine flag (required because the app isn't code-signed yet).
3. Launch Forge from Applications — it will open normally from now on

### First run

On first launch, Forge walks you through setup:

- **Local mode** (recommended): Forge downloads and runs a bundled llama.cpp server. Pick a model from the built-in catalog and it handles the rest.
- **External mode**: Point Forge at an existing inference server (LM Studio, Ollama, etc.) by entering its URL (default: `http://localhost:1234`).

### Auto-updates

Forge checks for updates on startup. When a new version is available, a notification appears in the sidebar — click **Update** to download and install automatically.

## Building from source

Requires [Rust](https://rustup.rs/) and [Node.js](https://nodejs.org/) (v20+).

```bash
# Install dependencies
npm install

# Run in development mode
cargo tauri dev

# Build a release .dmg
cargo tauri build
```

## License

All rights reserved.
