use tauri::Emitter;
use serde::Serialize;

use crate::inference::types::ChatMessage;
use crate::tools::registry::ToolRegistry;
use crate::Result;

#[derive(Debug, Clone, Serialize)]
pub struct ToolCallEvent {
    pub call_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolResultEvent {
    pub call_id: String,
    pub tool_name: String,
    pub result: String,
    pub is_error: bool,
}

/// Execute tool calls from an assistant response and return the tool result messages.
/// This is the core of the agent loop — after receiving tool calls, execute them
/// and potentially send the results back for another round.
pub async fn execute_tool_calls(
    app: &tauri::AppHandle,
    tool_calls: &[crate::inference::types::ToolCall],
    registry: &ToolRegistry,
) -> Result<Vec<ChatMessage>> {
    let mut tool_messages = Vec::new();

    for call in tool_calls {
        let tool_name = &call.function.name;
        let arguments: serde_json::Value =
            serde_json::from_str(&call.function.arguments).unwrap_or_default();

        // Emit tool call event
        let _ = app.emit(
            "tool:call",
            ToolCallEvent {
                call_id: call.id.clone(),
                tool_name: tool_name.clone(),
                arguments: arguments.clone(),
            },
        );

        let (result, is_error) = match registry.get(tool_name) {
            Some(tool) => match tool.execute(arguments).await {
                Ok(r) => (r, false),
                Err(e) => (format!("Tool error: {}", e), true),
            },
            None => (format!("Unknown tool: {}", tool_name), true),
        };

        // Emit tool result event
        let _ = app.emit(
            "tool:result",
            ToolResultEvent {
                call_id: call.id.clone(),
                tool_name: tool_name.clone(),
                result: result.clone(),
                is_error,
            },
        );

        tool_messages.push(ChatMessage {
            role: "tool".to_string(),
            content: result,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: Some(call.id.clone()),
        });
    }

    Ok(tool_messages)
}
