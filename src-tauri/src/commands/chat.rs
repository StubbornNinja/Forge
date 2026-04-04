use futures::StreamExt;
use tauri::{Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::db::models::NewMessage;
use crate::inference::model_profile::{self, ReasoningStyle};
use crate::inference::provider::ModelProvider;
use crate::inference::types::{ChatMessage, ChatRequest, StreamDelta, ToolCall};
use crate::orchestrator::agent::execute_tool_calls;
use crate::system_prompt::builder::build_system_prompt;
use crate::{AppState, ForgeError, Result};

const MAX_TOOL_ROUNDS: usize = 5;

/// Accumulate streaming tool call deltas into complete ToolCall objects.
fn accumulate_tool_call_delta(
    tool_calls: &mut Vec<ToolCall>,
    deltas: &[crate::inference::types::ToolCallDelta],
) {
    for delta in deltas {
        let idx = delta.index as usize;

        // Expand the vec if needed
        if idx >= tool_calls.len() {
            tool_calls.resize_with(idx + 1, || ToolCall {
                id: String::new(),
                call_type: "function".to_string(),
                function: crate::inference::types::FunctionCall {
                    name: String::new(),
                    arguments: String::new(),
                },
            });
        }

        let tc = &mut tool_calls[idx];
        if let Some(ref id) = delta.id {
            tc.id = id.clone();
        }
        if let Some(ref func) = delta.function {
            if let Some(ref name) = func.name {
                tc.function.name = name.clone();
            }
            if let Some(ref args) = func.arguments {
                tc.function.arguments.push_str(args);
            }
        }
    }
}

#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
    _attachments: Option<Vec<String>>,
    thinking_disabled: Option<bool>,
) -> Result<()> {
    let thinking_off = thinking_disabled.unwrap_or(false);

    // 0. Ensure inference provider is ready (start sidecar if local mode)
    crate::ensure_provider_ready(&app, &state).await?;

    // 1. Insert user message into DB
    {
        let db = state
            .db
            .lock()
            .map_err(|e| ForgeError::General(e.to_string()))?;
        crate::db::messages::insert_message(
            &db,
            &NewMessage {
                conversation_id: conversation_id.clone(),
                role: "user".to_string(),
                content: content.clone(),
                token_count: None,
                model: None,
                tool_calls: None,
                tool_call_id: None,
                attachments: None,
                parent_message_id: None,
                thinking_disabled: thinking_off,
            },
        )?;
    }

    // 2. Load conversation history
    let messages = {
        let db = state
            .db
            .lock()
            .map_err(|e| ForgeError::General(e.to_string()))?;
        crate::db::messages::get_messages(&db, &conversation_id)?
    };

    // 3. Build request context
    let settings = state
        .settings
        .read()
        .map_err(|e| ForgeError::General(e.to_string()))?
        .clone();
    let model = settings
        .default_model
        .clone()
        .unwrap_or_else(|| "default".to_string());

    // Get tool definitions
    let tool_defs = {
        let registry = state.tool_registry.read().await;
        if registry.is_empty() {
            None
        } else {
            Some(registry.definitions())
        }
    };

    // Get tool names for system prompt
    let tool_names: Vec<String> = {
        let registry = state.tool_registry.read().await;
        registry
            .definitions()
            .iter()
            .map(|d| d.function.name.clone())
            .collect()
    };

    // Detect model profile for reasoning/thinking behavior (needed for system prompt)
    let profile = model_profile::detect_profile(&model);

    let mut chat_messages: Vec<ChatMessage> = Vec::new();

    // System prompt — use the per-request thinking_off flag
    if let Some(sys_prompt) = build_system_prompt(&settings, &tool_names, Some(profile), thinking_off) {
        chat_messages.push(ChatMessage {
            role: "system".to_string(),
            content: sys_prompt,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // History — include tool_calls from stored messages
    // Prepend timestamps to user messages so the model can track time progression
    // Strip <think> blocks from assistant messages to save context window
    for msg in &messages {
        let content = if msg.role == "user" {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&msg.created_at) {
                let local = dt.with_timezone(&chrono::Local);
                let ts = local.format("%-I:%M %p").to_string();
                format!("[{}] {}", ts, msg.content)
            } else {
                msg.content.clone()
            }
        } else if msg.role == "assistant" {
            strip_think_tags(&msg.content)
        } else {
            msg.content.clone()
        };
        chat_messages.push(ChatMessage {
            role: msg.role.clone(),
            content,
            reasoning_content: None,
            tool_calls: msg
                .tool_calls
                .as_ref()
                .and_then(|v| serde_json::from_value(v.clone()).ok()),
            tool_call_id: msg.tool_call_id.clone(),
        });
    }

    // 4. Create a new cancellation token
    let cancel_token = CancellationToken::new();
    {
        let mut current = state
            .cancel_token
            .lock()
            .map_err(|e| ForgeError::General(e.to_string()))?;
        *current = cancel_token.clone();
    }

    // 5. First pass: stream the response
    let provider = &state.provider;
    let mut full_content = String::new();
    let mut reasoning_buffer = String::new();
    let mut accumulated_tool_calls: Vec<ToolCall> = Vec::new();
    let mut cancelled = false;
    let mut stream_usage: Option<crate::inference::types::Usage> = None;

    // Check if this is the first message (for title generation later)
    let is_first_message = messages.len() == 1; // only the user message we just inserted
    let user_content_for_title = if is_first_message {
        Some(content.clone())
    } else {
        None
    };

    let reasoning_effort: Option<&str> = if thinking_off { Some("off") } else { None };
    let extra = model_profile::build_extra_params(profile, reasoning_effort);

    let request = ChatRequest {
        model: model.clone(),
        messages: chat_messages.clone(),
        temperature: Some(settings.temperature),
        max_tokens: Some(settings.max_tokens),
        tools: tool_defs.clone(),
        stream: Some(true),
        stream_options: None,
        extra,
    };

    match provider.chat_completion_stream(request).await {
        Ok(stream) => {
            let mut stream = std::pin::pin!(stream);

            loop {
                tokio::select! {
                    _ = cancel_token.cancelled() => {
                        log::info!("Generation cancelled by user");
                        cancelled = true;
                        break;
                    }
                    chunk = stream.next() => {
                        match chunk {
                            Some(Ok(delta)) => {
                                if let Some(ref content_delta) = delta.content {
                                    full_content.push_str(content_delta);
                                }
                                if let Some(ref reasoning_delta) = delta.reasoning_content {
                                    reasoning_buffer.push_str(reasoning_delta);
                                    let _ = app.emit("stream:reasoning_delta", reasoning_delta.as_str());
                                }
                                if let Some(ref tc_deltas) = delta.tool_calls {
                                    accumulate_tool_call_delta(&mut accumulated_tool_calls, tc_deltas);
                                }
                                if delta.usage.is_some() {
                                    stream_usage = delta.usage.clone();
                                }
                                let _ = app.emit("stream:delta", &delta);
                            }
                            Some(Err(e)) => {
                                let _ = app.emit("stream:error", e.to_structured());
                                return Ok(());
                            }
                            None => break,
                        }
                    }
                }
            }
        }
        Err(e) => {
            let _ = app.emit("stream:error", e.to_structured());
            return Ok(());
        }
    }

    // Merge reasoning_content into content as <think> tags for DB normalization.
    // Always merge when reasoning_buffer is non-empty — llama.cpp's --reasoning-format auto
    // routes thinking to reasoning_content regardless of model type, so InlineThinkTags models
    // (Qwen) also need this merge when served by the embedded sidecar.
    if !reasoning_buffer.is_empty() {
        full_content = format!("<think>{}</think>{}", reasoning_buffer, full_content);
    }

    // Normalize Gemma 4 thinking format: <|channel>thought...<|channel>response → <think>...</think>response
    if full_content.contains("<|channel>") || full_content.contains("<channel|>") {
        full_content = normalize_gemma_thinking(&full_content);
    }

    let usage_tokens = stream_usage.map(|u| u.completion_tokens as i64);

    if cancelled {
        if !full_content.is_empty() {
            let assistant_msg = {
                let db = state
                    .db
                    .lock()
                    .map_err(|e| ForgeError::General(e.to_string()))?;
                crate::db::messages::insert_message(
                    &db,
                    &NewMessage {
                        conversation_id: conversation_id.clone(),
                        role: "assistant".to_string(),
                        content: full_content,
                        token_count: usage_tokens,
                        model: Some(model),
                        tool_calls: None,
                        tool_call_id: None,
                        attachments: None,
                        parent_message_id: None,
                    thinking_disabled: thinking_off,
                    },
                )?
            };
            let _ = app.emit("stream:end", &assistant_msg);
        }
        return Ok(());
    }

    // 6. Check if the stream produced tool calls
    let has_tool_calls = !accumulated_tool_calls.is_empty()
        && accumulated_tool_calls
            .iter()
            .any(|tc| !tc.function.name.is_empty());

    if !has_tool_calls {
        // Simple response — save and emit
        let assistant_msg = {
            let db = state
                .db
                .lock()
                .map_err(|e| ForgeError::General(e.to_string()))?;
            crate::db::messages::insert_message(
                &db,
                &NewMessage {
                    conversation_id: conversation_id.clone(),
                    role: "assistant".to_string(),
                    content: full_content,
                    token_count: usage_tokens,
                    model: Some(model.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                    attachments: None,
                    parent_message_id: None,
                    thinking_disabled: thinking_off,
                },
            )?
        };
        let _ = app.emit("stream:end", &assistant_msg);

        // Generate title for new conversations
        if let Some(user_msg) = user_content_for_title {
            spawn_title_generation(
                app.clone(),
                model,
                conversation_id,
                user_msg,
            );
        }

        return Ok(());
    }

    // 7. Agent loop — tool calls detected
    // Save assistant message with tool calls
    let tool_calls_json = serde_json::to_value(&accumulated_tool_calls).ok();
    {
        let db = state
            .db
            .lock()
            .map_err(|e| ForgeError::General(e.to_string()))?;
        crate::db::messages::insert_message(
            &db,
            &NewMessage {
                conversation_id: conversation_id.clone(),
                role: "assistant".to_string(),
                content: full_content.clone(),
                token_count: usage_tokens,
                model: Some(model.clone()),
                tool_calls: tool_calls_json,
                tool_call_id: None,
                attachments: None,
                parent_message_id: None,
                thinking_disabled: thinking_off,
            },
        )?;
    }

    chat_messages.push(ChatMessage {
        role: "assistant".to_string(),
        content: full_content,
        reasoning_content: None,
        tool_calls: Some(accumulated_tool_calls.clone()),
        tool_call_id: None,
    });

    // Execute tools
    {
        let registry = state.tool_registry.read().await;
        let tool_results = execute_tool_calls(&app, &accumulated_tool_calls, &registry).await?;

        // Save tool results to DB and chat history
        for tool_msg in &tool_results {
            let db = state
                .db
                .lock()
                .map_err(|e| ForgeError::General(e.to_string()))?;
            crate::db::messages::insert_message(
                &db,
                &NewMessage {
                    conversation_id: conversation_id.clone(),
                    role: "tool".to_string(),
                    content: tool_msg.content.clone(),
                    token_count: None,
                    model: None,
                    tool_calls: None,
                    tool_call_id: tool_msg.tool_call_id.clone(),
                    attachments: None,
                    parent_message_id: None,
                    thinking_disabled: false,
                },
            )?;
        }
        chat_messages.extend(tool_results);
    }

    // Continue loop for additional tool rounds (streaming)
    for _round in 1..MAX_TOOL_ROUNDS {
        if cancel_token.is_cancelled() {
            break;
        }

        // Reset frontend streaming content before each new round
        let _ = app.emit("stream:content_reset", ());

        let request = ChatRequest {
            model: model.clone(),
            messages: chat_messages.clone(),
            temperature: Some(settings.temperature),
            max_tokens: Some(settings.max_tokens),
            tools: tool_defs.clone(),
            stream: Some(true),
            stream_options: None,
            extra: model_profile::build_extra_params(profile, reasoning_effort),
        };

        let mut round_content = String::new();
        let mut round_reasoning = String::new();
        let mut round_tool_calls: Vec<ToolCall> = Vec::new();
        let mut round_usage: Option<crate::inference::types::Usage> = None;
        let mut round_cancelled = false;

        match provider.chat_completion_stream(request).await {
            Ok(round_stream) => {
                let mut round_stream = std::pin::pin!(round_stream);

                loop {
                    tokio::select! {
                        _ = cancel_token.cancelled() => {
                            round_cancelled = true;
                            break;
                        }
                        chunk = round_stream.next() => {
                            match chunk {
                                Some(Ok(delta)) => {
                                    if let Some(ref content_delta) = delta.content {
                                        round_content.push_str(content_delta);
                                    }
                                    if let Some(ref reasoning_delta) = delta.reasoning_content {
                                        round_reasoning.push_str(reasoning_delta);
                                        let _ = app.emit("stream:reasoning_delta", reasoning_delta.as_str());
                                    }
                                    if let Some(ref tc_deltas) = delta.tool_calls {
                                        accumulate_tool_call_delta(&mut round_tool_calls, tc_deltas);
                                    }
                                    if delta.usage.is_some() {
                                        round_usage = delta.usage.clone();
                                    }
                                    let _ = app.emit("stream:delta", &delta);
                                }
                                Some(Err(e)) => {
                                    let _ = app.emit("stream:error", e.to_structured());
                                    return Ok(());
                                }
                                None => break,
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("stream:error", e.to_structured());
                return Ok(());
            }
        }

        if round_cancelled {
            break;
        }

        // Normalize thinking
        if !round_reasoning.is_empty() && profile.reasoning_style == ReasoningStyle::ReasoningContentField {
            round_content = format!("<think>{}</think>{}", round_reasoning, round_content);
        }
        if round_content.contains("<|channel>") || round_content.contains("<channel|>") {
            round_content = normalize_gemma_thinking(&round_content);
        }

        let round_tokens = round_usage.map(|u| u.completion_tokens as i64);

        let has_more_tool_calls = !round_tool_calls.is_empty()
            && round_tool_calls.iter().any(|tc| !tc.function.name.is_empty());

        if has_more_tool_calls {
            // Save intermediate assistant message with tool calls
            let tc_json = serde_json::to_value(&round_tool_calls).ok();
            {
                let db = state
                    .db
                    .lock()
                    .map_err(|e| ForgeError::General(e.to_string()))?;
                crate::db::messages::insert_message(
                    &db,
                    &NewMessage {
                        conversation_id: conversation_id.clone(),
                        role: "assistant".to_string(),
                        content: round_content.clone(),
                        token_count: round_tokens,
                        model: Some(model.clone()),
                        tool_calls: tc_json,
                        tool_call_id: None,
                        attachments: None,
                        parent_message_id: None,
                    thinking_disabled: thinking_off,
                    },
                )?;
            }

            chat_messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: round_content,
                reasoning_content: None,
                tool_calls: Some(round_tool_calls),
                tool_call_id: None,
            });

            // Execute tools
            let registry = state.tool_registry.read().await;
            let tool_results = execute_tool_calls(&app, chat_messages.last().unwrap().tool_calls.as_ref().unwrap(), &registry).await?;

            for tool_msg in &tool_results {
                let db = state
                    .db
                    .lock()
                    .map_err(|e| ForgeError::General(e.to_string()))?;
                crate::db::messages::insert_message(
                    &db,
                    &NewMessage {
                        conversation_id: conversation_id.clone(),
                        role: "tool".to_string(),
                        content: tool_msg.content.clone(),
                        token_count: None,
                        model: None,
                        tool_calls: None,
                        tool_call_id: tool_msg.tool_call_id.clone(),
                        attachments: None,
                        parent_message_id: None,
                    thinking_disabled: thinking_off,
                    },
                )?;
            }
            chat_messages.extend(tool_results);
            continue;
        }

        // Final text response — save and emit
        let assistant_msg = {
            let db = state
                .db
                .lock()
                .map_err(|e| ForgeError::General(e.to_string()))?;
            crate::db::messages::insert_message(
                &db,
                &NewMessage {
                    conversation_id: conversation_id.clone(),
                    role: "assistant".to_string(),
                    content: round_content,
                    token_count: round_tokens,
                    model: Some(model.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                    attachments: None,
                    parent_message_id: None,
                    thinking_disabled: thinking_off,
                },
            )?
        };

        let _ = app.emit("stream:end", &assistant_msg);

        // Generate title for new conversations
        if let Some(user_msg) = user_content_for_title {
            spawn_title_generation(
                app.clone(),
                model,
                conversation_id,
                user_msg,
            );
        }

        return Ok(());
    }

    // Exhausted all rounds
    let _ = app.emit(
        "stream:error",
        ForgeError::Inference("Reached maximum tool call rounds".to_string()).to_structured(),
    );
    Ok(())
}

/// Strip `<think>...</think>` blocks from content for sending back in conversation history.
fn strip_think_tags(content: &str) -> String {
    let mut result = content.to_string();
    while let Some(start) = result.find("<think>") {
        if let Some(end) = result.find("</think>") {
            result = format!("{}{}", &result[..start], &result[end + 8..]);
        } else {
            // Incomplete think block — remove from <think> onward
            result = result[..start].to_string();
            break;
        }
    }
    result.trim().to_string()
}

/// Normalize Gemma 4 thinking format to standard <think> tags.
/// Handles all known channel tag variants:
///   `<|channel>thought ...<|channel>response`
///   `<|channel>thought ...<channel|>response`
/// Output: `<think>...</think>response`
fn normalize_gemma_thinking(content: &str) -> String {
    // First, normalize all channel tag variants to a single canonical form
    let normalized = content
        .replace("<channel|>", "<|channel>")
        .replace("<|channel |>", "<|channel>")
        .replace("< |channel>", "<|channel>");

    let parts: Vec<&str> = normalized.split("<|channel>").collect();
    if parts.len() >= 3 {
        let thinking = parts[1].trim_start_matches("thought").trim();
        let response: String = parts[2..].join("");
        if thinking.is_empty() {
            response.trim().to_string()
        } else {
            format!("<think>{}</think>{}", thinking, response.trim())
        }
    } else if parts.len() == 2 {
        let thinking = parts[1].trim_start_matches("thought").trim();
        if thinking.is_empty() {
            parts[0].to_string()
        } else {
            format!("<think>{}</think>{}", thinking, parts[0].trim())
        }
    } else {
        content.to_string()
    }
}

/// Extract a clean title from potentially verbose model output.
/// Strategy: strip <think> blocks, then take the LAST short line as the title,
/// since thinking models dump reasoning first and the actual answer comes last.
fn clean_title(raw: &str) -> String {
    let mut text = raw.to_string();

    // Normalize Gemma 4 format first
    if text.contains("<|channel>") {
        text = normalize_gemma_thinking(&text);
    }

    // Strip <think>...</think> blocks (complete)
    while let Some(start) = text.find("<think>") {
        if let Some(end) = text.find("</think>") {
            text = format!("{}{}", &text[..start], &text[end + 8..]);
        } else {
            // Incomplete think block — remove everything from <think> onward
            text = text[..start].to_string();
            break;
        }
    }

    let text = text.trim();
    if text.is_empty() {
        return String::new();
    }

    // Work backwards from the last line — the actual title is at the end
    for line in text.lines().rev() {
        let cleaned = strip_line(line);
        if !cleaned.is_empty() && cleaned.len() >= 2 && cleaned.len() <= 80 {
            let mut title = cleaned;
            if title.len() > 60 {
                title = format!("{}...", &title[..57]);
            }
            return title;
        }
    }

    String::new()
}

/// Strip markdown formatting, quotes, numbered prefixes, and punctuation from a line.
fn strip_line(line: &str) -> String {
    let mut s = line.trim().to_string();
    if s.is_empty() {
        return s;
    }

    // Strip leading # markers
    s = s.trim_start_matches('#').trim().to_string();

    // Strip leading numbered list markers (e.g. "1. ", "2. ")
    if s.starts_with(|c: char| c.is_ascii_digit()) {
        let rest = s.trim_start_matches(|c: char| c.is_ascii_digit());
        if let Some(rest) = rest.strip_prefix('.') {
            s = rest.trim().to_string();
        }
    }

    // Strip leading bullet markers
    s = s.trim_start_matches(['-', '*', '•']).trim().to_string();

    // Strip bold/italic wrappers
    s = s.replace("**", "");
    s = s.replace('*', "");
    s = s.replace('_', " ");
    s = s.trim().to_string();

    // Strip surrounding quotes
    if s.len() >= 2 {
        let first = s.chars().next().unwrap();
        let last = s.chars().last().unwrap();
        if (first == '"' && last == '"')
            || (first == '\'' && last == '\'')
            || (first == '\u{201c}' && last == '\u{201d}')
        {
            s = s[1..s.len() - 1].trim().to_string();
        }
    }

    // Strip trailing punctuation and colons
    s = s.trim_end_matches(['.', '!', ':']).trim().to_string();

    // Strip "Title: " prefix if present
    if let Some(rest) = s.strip_prefix("Title:") {
        s = rest.trim().to_string();
    } else if let Some(rest) = s.strip_prefix("title:") {
        s = rest.trim().to_string();
    }

    s
}

/// Default model for title generation — a tiny, fast model that won't overthink.
const DEFAULT_TITLE_MODEL: &str = "unsloth/Qwen3-0.6B-GGUF";

/// Generate a short conversation title from the first user message.
/// Spawned as a background task so it doesn't block the chat response.
fn spawn_title_generation(
    app: tauri::AppHandle,
    _model: String,
    conversation_id: String,
    user_message: String,
) {
    tokio::spawn(async move {
        use tauri::Manager;

        let state = app.state::<AppState>();

        // Read the title model from settings, falling back to the default small model
        let title_model = {
            let settings = state.settings.read().ok();
            settings
                .and_then(|s| s.title_model.clone())
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| DEFAULT_TITLE_MODEL.to_string())
        };

        // Truncate long user messages to avoid blowing up the title prompt
        let truncated_msg = if user_message.len() > 200 {
            format!("{}...", &user_message[..200])
        } else {
            user_message
        };

        // Detect title model profile — always disable thinking for title gen
        let title_profile = model_profile::detect_profile(&title_model);
        let title_extra = model_profile::build_extra_params(title_profile, Some("off"));

        // Build system prompt: /no_think for Qwen + universal instruction for all models
        let mut system_content = String::new();
        if model_profile::needs_no_think_prefix(title_profile) {
            system_content.push_str("/no_think\n");
        }
        system_content.push_str("You generate short titles. Respond with ONLY the title, nothing else. Do not use any thinking or reasoning blocks.");

        let request = ChatRequest {
            model: title_model,
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_content,
                    reasoning_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: format!("Write a 3-6 word title for this message. Output ONLY the title, no explanation:\n\n{}", truncated_msg),
                    reasoning_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            temperature: Some(0.3),
            max_tokens: Some(30),
            tools: None,
            stream: Some(false),
            stream_options: None,
            extra: title_extra,
        };

        match state.provider.chat_completion(request).await {
            Ok(response) => {
                if let Some(choice) = response.choices.first() {
                    let raw = choice.message.content.trim().to_string();

                    // Extract title from potentially verbose/thinking output
                    let title = clean_title(&raw);

                    if !title.is_empty() {
                        // Save to DB
                        if let Ok(db) = state.db.lock() {
                            let _ = crate::db::conversations::update_conversation_title(
                                &db,
                                &conversation_id,
                                &title,
                            );
                        }
                        // Notify frontend
                        let _ = app.emit(
                            "conversation:title-updated",
                            serde_json::json!({
                                "id": conversation_id,
                                "title": title,
                            }),
                        );
                    }
                }
            }
            Err(e) => {
                log::warn!("Title generation failed: {}", e);
            }
        }
    });
}

#[tauri::command]
pub async fn stop_generation(state: State<'_, AppState>) -> Result<()> {
    let token = state
        .cancel_token
        .lock()
        .map_err(|e| ForgeError::General(e.to_string()))?;
    token.cancel();
    Ok(())
}
