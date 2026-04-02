use tauri::State;

use crate::config::settings::AppSettings;
use crate::tools::registry::ToolRegistry;
use crate::tools::web_search::WebSearchTool;
use crate::{AppState, ForgeError, Result};

#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<AppSettings> {
    let settings = state.settings.read().map_err(|e| ForgeError::General(e.to_string()))?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: serde_json::Value,
) -> Result<()> {
    // Update settings and extract what we need for tool registry rebuild
    let (search_enabled, searxng_url) = {
        let mut current = state.settings.write().map_err(|e| ForgeError::General(e.to_string()))?;

        // Merge partial update
        if let Some(obj) = settings.as_object() {
            if let Some(v) = obj.get("inference_url").and_then(|v| v.as_str()) {
                current.inference_url = v.to_string();
            }
            if let Some(v) = obj.get("default_model") {
                current.default_model = v.as_str().map(|s| s.to_string());
            }
            if let Some(v) = obj.get("temperature").and_then(|v| v.as_f64()) {
                current.temperature = v as f32;
            }
            if let Some(v) = obj.get("max_tokens").and_then(|v| v.as_u64()) {
                current.max_tokens = v as u32;
            }
            if let Some(v) = obj.get("searxng_url").and_then(|v| v.as_str()) {
                current.searxng_url = v.to_string();
            }
            if let Some(v) = obj.get("search_enabled").and_then(|v| v.as_bool()) {
                current.search_enabled = v;
            }
            if let Some(v) = obj.get("send_shortcut").and_then(|v| v.as_str()) {
                current.send_shortcut = v.to_string();
            }
            if let Some(v) = obj.get("theme").and_then(|v| v.as_str()) {
                current.theme = v.to_string();
            }
            if let Some(v) = obj.get("system_prompt_enabled").and_then(|v| v.as_bool()) {
                current.system_prompt_enabled = v;
            }
            if let Some(v) = obj.get("custom_system_prompt") {
                current.custom_system_prompt = v.as_str().map(|s| s.to_string());
            }
        }

        // Save to DB
        let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
        crate::config::settings::save_settings(&db, &current)?;

        (current.search_enabled, current.searxng_url.clone())
    }; // settings write guard and db guard dropped here

    // Rebuild tool registry based on updated settings
    let mut new_registry = ToolRegistry::new();
    if search_enabled && !searxng_url.is_empty() {
        new_registry.register(Box::new(WebSearchTool::new(searxng_url)));
    }

    let mut registry = state.tool_registry.write().await;
    *registry = new_registry;

    Ok(())
}

#[tauri::command]
pub async fn list_models(
    state: State<'_, AppState>,
) -> Result<Vec<crate::inference::types::ModelInfo>> {
    state.provider.list_models().await
}

#[tauri::command]
pub async fn health_check(
    state: State<'_, AppState>,
) -> Result<bool> {
    state.provider.health_check().await
}
