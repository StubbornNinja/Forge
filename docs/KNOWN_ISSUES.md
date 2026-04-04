# Known Issues — Forge v0.1

## Bug 1: Chain-of-Thought (CoT) block disappears after generation

**Status:** Open
**Severity:** High — core UX feature broken

**Symptoms:**
- Thinking block shows correctly during streaming
- After generation completes and messages reload from DB, the thinking block disappears
- The `show_thinking_override` toggle in advanced settings does NOT bring it back
- This happens with both Qwen 3.5 and Gemma 4

**What this means:**
- The thinking content is likely present in the DB (it shows during streaming)
- After `finalizeStreamWithMessages` reloads from DB, `groupMessages` → `parseThinking` is either:
  - Not finding `<think>` tags in the stored content, OR
  - Creating an `agentActivity` but it's being filtered/hidden incorrectly

**Debugging approach:**
1. Add `console.log` in `groupMessages` (`src/lib/groupMessages.ts`) to inspect:
   - The raw `msg.content` for assistant messages loaded from DB
   - The result of `parseThinking(msg.content)` — does it extract thinking?
   - The resulting `agentActivity` — is it null or does it have steps?
2. Add `console.log` in `AgentActivityBlock` to inspect:
   - `thinkingDisabled` prop value
   - `showThinkingOverride` value
   - `hideThinking` computed value
   - `visibleSteps` length
   - `hasStoredActivity` result
3. Check the SQLite DB directly to verify content has `<think>` tags:
   ```bash
   sqlite3 ~/Library/Application\ Support/com.forge.app/forge.db \
     "SELECT id, substr(content, 1, 200), thinking_disabled FROM messages WHERE role='assistant' ORDER BY rowid DESC LIMIT 5"
   ```

**Key files:**
- `src/lib/groupMessages.ts` — `groupMessages()` function, `parseThinking` usage
- `src/lib/parseThinking.ts` — tag extraction logic
- `src/components/chat/AgentActivityBlock.tsx` — visibility filtering logic
- `src/components/chat/MessageBubble.tsx` — passes `message.thinking_disabled` to activity block
- `src/components/chat/InputArea.tsx` — `onStreamEnd` handler reloads from DB

---

## Bug 2: Model switching doesn't restart llama-server

**Status:** Open
**Severity:** High — blocks multi-model workflow

**Symptoms:**
- User downloads two models (e.g., Qwen 3.5 9B and Gemma 4 26B)
- Selects model A, chats successfully
- Switches to model B via the input bar model picker
- llama-server continues serving model A — does NOT restart with model B

**Root cause:**
- The model picker in `InputArea.tsx` calls `updateSettings({ local_model_id: m.id })` when switching
- `update_settings` in `commands/settings.rs` saves to DB but does NOT restart the sidecar
- `ensure_provider_ready` in `lib.rs` checks `sidecar.base_url()` — if the sidecar is already running, it returns early without checking if the loaded model matches `local_model_id`

**Fix needed:**
- In `ensure_provider_ready` (`src-tauri/src/lib.rs`): compare `sidecar.loaded_model` with the requested model path. If different, stop and restart with the new model.
- OR: add a dedicated `switch_model` IPC command that stops the sidecar, starts it with the new model, and updates the provider URL.
- The `SidecarManager` already tracks `loaded_model` — just need to check it.

**Key files:**
- `src-tauri/src/lib.rs` — `ensure_provider_ready()` function
- `src-tauri/src/sidecar/process.rs` — `SidecarManager`, `loaded_model` field
- `src-tauri/src/commands/settings.rs` — `update_settings` doesn't trigger sidecar restart
- `src/components/chat/InputArea.tsx` — model picker selection handler

---

## Quick Reference: Architecture for Debugging

### Message flow (streaming → stored):
1. `send_message` (chat.rs) → streams via `stream:delta` events → content accumulated in `streamingContent` (frontend)
2. Backend normalizes thinking (`<|channel>` → `<think>`) and saves to DB with `thinking_disabled` flag
3. `stream:end` event fires → frontend calls `api.getMessages()` → reloads all messages from DB
4. `groupMessages` processes messages → `parseThinking` extracts `<think>` blocks → creates `AgentActivity` with ordered steps
5. `AgentActivityBlock` renders steps, filtering based on `message.thinking_disabled` and `show_thinking_override`

### Sidecar flow (model loading):
1. `ensure_provider_ready` checks mode → if local, checks sidecar running → if not, starts it
2. `SidecarManager.start()` spawns `llama-server` subprocess with `--model {path}`
3. Health polling on `/health` endpoint until healthy
4. Provider URL pointed at `http://127.0.0.1:{port}`
5. Model switching: currently NOT handled — sidecar keeps serving whatever model it started with
