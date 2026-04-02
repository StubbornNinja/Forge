use tauri::State;

use crate::db::models::{Conversation, ConversationSummary, Message};
use crate::{AppState, ForgeError, Result};

#[tauri::command]
pub async fn create_conversation(
    state: State<'_, AppState>,
) -> Result<Conversation> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    crate::db::conversations::create_conversation(&db, None, None, None)
}

#[tauri::command]
pub async fn list_conversations(
    state: State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<ConversationSummary>> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    crate::db::conversations::list_conversations(&db, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<Message>> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    crate::db::messages::get_messages(&db, &conversation_id)
}

#[tauri::command]
pub async fn delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    crate::db::conversations::delete_conversation(&db, &id)
}

#[tauri::command]
pub async fn rename_conversation(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<()> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    crate::db::conversations::update_conversation_title(&db, &id, &title)
}
