use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub inference_url: String,
    pub default_model: Option<String>,
    pub temperature: f32,
    pub max_tokens: u32,
    pub searxng_url: String,
    pub search_enabled: bool,
    pub send_shortcut: String,
    pub theme: String,
    pub system_prompt_enabled: bool,
    pub custom_system_prompt: Option<String>,
    pub title_model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub search_backend: Option<String>,
    pub brave_api_key: Option<String>,
    #[serde(default)]
    pub has_completed_setup: bool,
    #[serde(default)]
    pub show_thinking_override: bool,
    /// "local" | "external" | "auto"
    pub inference_mode: Option<String>,
    /// ID of the installed local model to use
    pub local_model_id: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            inference_url: "http://localhost:1234".to_string(),
            default_model: None,
            temperature: 0.7,
            max_tokens: 4096,
            searxng_url: "http://localhost:8080".to_string(),
            search_enabled: true,
            send_shortcut: "Enter".to_string(),
            theme: "system".to_string(),
            system_prompt_enabled: true,
            custom_system_prompt: None,
            title_model: None,
            reasoning_effort: None,
            search_backend: None,
            brave_api_key: None,
            has_completed_setup: false,
            show_thinking_override: false,
            inference_mode: None,
            local_model_id: None,
        }
    }
}

pub fn load_settings(conn: &Connection) -> Result<AppSettings> {
    let mut settings = AppSettings::default();

    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (key, value) = row?;
        match key.as_str() {
            "inference_url" => settings.inference_url = value,
            "default_model" => settings.default_model = if value.is_empty() { None } else { Some(value) },
            "temperature" => settings.temperature = value.parse().unwrap_or(0.7),
            "max_tokens" => settings.max_tokens = value.parse().unwrap_or(4096),
            "searxng_url" => settings.searxng_url = value,
            "search_enabled" => settings.search_enabled = value == "true",
            "send_shortcut" => settings.send_shortcut = value,
            "theme" => settings.theme = value,
            "system_prompt_enabled" => settings.system_prompt_enabled = value == "true",
            "custom_system_prompt" => settings.custom_system_prompt = if value.is_empty() { None } else { Some(value) },
            "title_model" => settings.title_model = if value.is_empty() { None } else { Some(value) },
            "reasoning_effort" => settings.reasoning_effort = if value.is_empty() { None } else { Some(value) },
            "search_backend" => settings.search_backend = if value.is_empty() { None } else { Some(value) },
            "brave_api_key" => settings.brave_api_key = if value.is_empty() { None } else { Some(value) },
            "has_completed_setup" => settings.has_completed_setup = value == "true",
            "show_thinking_override" => settings.show_thinking_override = value == "true",
            "inference_mode" => settings.inference_mode = if value.is_empty() { None } else { Some(value) },
            "local_model_id" => settings.local_model_id = if value.is_empty() { None } else { Some(value) },
            _ => {}
        }
    }

    Ok(settings)
}

pub fn save_settings(conn: &Connection, settings: &AppSettings) -> Result<()> {
    let pairs: Vec<(&str, String)> = vec![
        ("inference_url", settings.inference_url.clone()),
        ("default_model", settings.default_model.clone().unwrap_or_default()),
        ("temperature", settings.temperature.to_string()),
        ("max_tokens", settings.max_tokens.to_string()),
        ("searxng_url", settings.searxng_url.clone()),
        ("search_enabled", settings.search_enabled.to_string()),
        ("send_shortcut", settings.send_shortcut.clone()),
        ("theme", settings.theme.clone()),
        ("system_prompt_enabled", settings.system_prompt_enabled.to_string()),
        ("custom_system_prompt", settings.custom_system_prompt.clone().unwrap_or_default()),
        ("title_model", settings.title_model.clone().unwrap_or_default()),
        ("reasoning_effort", settings.reasoning_effort.clone().unwrap_or_default()),
        ("search_backend", settings.search_backend.clone().unwrap_or_default()),
        ("brave_api_key", settings.brave_api_key.clone().unwrap_or_default()),
        ("has_completed_setup", settings.has_completed_setup.to_string()),
        ("show_thinking_override", settings.show_thinking_override.to_string()),
        ("inference_mode", settings.inference_mode.clone().unwrap_or_default()),
        ("local_model_id", settings.local_model_id.clone().unwrap_or_default()),
    ];

    for (key, value) in pairs {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::initialize_db_in_memory;
    use crate::db::migrations::run_migrations;

    #[test]
    fn test_load_defaults() {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let settings = load_settings(&conn).unwrap();
        assert_eq!(settings.inference_url, "http://localhost:1234");
        assert_eq!(settings.temperature, 0.7);
        assert_eq!(settings.max_tokens, 4096);
    }

    #[test]
    fn test_save_and_load() {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let mut settings = AppSettings::default();
        settings.inference_url = "http://192.168.1.50:1234".to_string();
        settings.temperature = 0.9;
        settings.default_model = Some("llama-3".to_string());

        save_settings(&conn, &settings).unwrap();

        let loaded = load_settings(&conn).unwrap();
        assert_eq!(loaded.inference_url, "http://192.168.1.50:1234");
        assert_eq!(loaded.temperature, 0.9);
        assert_eq!(loaded.default_model, Some("llama-3".to_string()));
    }
}
