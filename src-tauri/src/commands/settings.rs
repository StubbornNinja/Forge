use tauri::State;

use crate::config::settings::AppSettings;
use crate::inference::provider::ModelProvider;
use crate::tools::registry::ToolRegistry;
use crate::tools::web_search::WebSearchTool;
use crate::{build_search_provider, AppState, ForgeError, Result};

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
    let updated_settings = {
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
            if let Some(v) = obj.get("title_model") {
                current.title_model = v.as_str().map(|s| s.to_string());
            }
            if let Some(v) = obj.get("reasoning_effort") {
                current.reasoning_effort = v.as_str().map(|s| s.to_string());
            }
            if let Some(v) = obj.get("search_backend") {
                current.search_backend = v.as_str().map(|s| s.to_string());
            }
            if let Some(v) = obj.get("brave_api_key") {
                current.brave_api_key = v.as_str().map(|s| s.to_string());
            }
            if let Some(v) = obj.get("has_completed_setup").and_then(|v| v.as_bool()) {
                current.has_completed_setup = v;
            }
            if let Some(v) = obj.get("show_thinking_override").and_then(|v| v.as_bool()) {
                current.show_thinking_override = v;
            }
            if let Some(v) = obj.get("inference_mode") {
                current.inference_mode = v.as_str().map(|s| s.to_string());
            }
            if let Some(v) = obj.get("local_model_id") {
                current.local_model_id = v.as_str().map(|s| s.to_string());
            }
        }

        // Save to DB
        let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
        crate::config::settings::save_settings(&db, &current)?;

        current.clone()
    }; // settings write guard and db guard dropped here

    // Rebuild tool registry based on updated settings
    let mut new_registry = ToolRegistry::new();
    if updated_settings.search_enabled {
        let provider = build_search_provider(&updated_settings);
        new_registry.register(Box::new(WebSearchTool::new(provider)));
    }

    let mut registry = state.tool_registry.write().await;
    *registry = new_registry;

    Ok(())
}

#[tauri::command]
pub async fn list_models(
    state: State<'_, AppState>,
) -> Result<Vec<crate::inference::types::ModelInfo>> {
    // In local mode, check if sidecar is running and point provider at it
    let sidecar = state.sidecar.lock().await;
    if let Some(url) = sidecar.base_url() {
        state.provider.set_base_url(&url);
    }
    drop(sidecar);
    state.provider.list_models().await
}

#[tauri::command]
pub async fn health_check(
    state: State<'_, AppState>,
) -> Result<bool> {
    // In local mode, check if sidecar is running and point provider at it
    let sidecar = state.sidecar.lock().await;
    if let Some(url) = sidecar.base_url() {
        state.provider.set_base_url(&url);
    }
    drop(sidecar);
    state.provider.health_check().await
}
