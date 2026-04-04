use serde::{Deserialize, Serialize};

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
    pub parent_message_id: Option<String>,
    #[serde(default)]
    pub thinking_disabled: bool,
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
    pub parent_message_id: Option<String>,
    #[serde(default)]
    pub thinking_disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub conversation_id: String,
    pub conversation_title: String,
    pub message_id: String,
    pub content_snippet: String,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub extracted_text: Option<String>,
}
