use tauri::State;

use crate::db::models::SearchResult;
use crate::{AppState, ForgeError, Result};

#[tauri::command]
pub async fn search_conversations(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    crate::db::messages::search_messages(&db, &query, 20)
}
