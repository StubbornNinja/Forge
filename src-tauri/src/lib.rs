#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

pub mod commands;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod config;
pub mod db;
pub mod error;
pub mod files;
pub mod inference;
pub mod orchestrator;
pub mod system_prompt;
pub mod tools;

pub use error::{ForgeError, Result};

use std::sync::Mutex;
use std::sync::RwLock;

use config::settings::AppSettings;
use inference::openai_compat::OpenAICompatProvider;
use inference::provider::ModelProvider;
use tauri::Manager;
use tokio_util::sync::CancellationToken;
use tools::registry::ToolRegistry;
use tools::web_search::WebSearchTool;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub provider: Box<dyn ModelProvider>,
    pub settings: RwLock<AppSettings>,
    pub cancel_token: Mutex<CancellationToken>,
    pub tool_registry: tokio::sync::RwLock<ToolRegistry>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize logging
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            let db_path = app_data_dir.join("forge.db");

            let conn = db::connection::initialize_db(&db_path)
                .expect("failed to initialize database");
            db::migrations::run_migrations(&conn)
                .expect("failed to run migrations");

            // Load settings
            let settings = config::settings::load_settings(&conn)
                .unwrap_or_default();

            // Create inference provider
            let provider = Box::new(OpenAICompatProvider::new(settings.inference_url.clone()));

            // Build tool registry based on settings
            let mut tool_registry = ToolRegistry::new();
            if settings.search_enabled && !settings.searxng_url.is_empty() {
                tool_registry.register(Box::new(WebSearchTool::new(settings.searxng_url.clone())));
            }

            // Create app state
            let state = AppState {
                db: Mutex::new(conn),
                provider,
                settings: RwLock::new(settings),
                cancel_token: Mutex::new(CancellationToken::new()),
                tool_registry: tokio::sync::RwLock::new(tool_registry),
            };

            app.manage(state);

            // Position traffic lights via native delegate (no snap on resize)
            #[cfg(target_os = "macos")]
            {
                let main_window = app.get_webview_window("main").unwrap();
                crate::macos::setup_traffic_light_positioner(main_window, 14.0, 40.0);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Chat
            commands::chat::send_message,
            commands::chat::stop_generation,
            // Conversations
            commands::conversations::create_conversation,
            commands::conversations::list_conversations,
            commands::conversations::get_messages,
            commands::conversations::delete_conversation,
            commands::conversations::rename_conversation,
            // Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::list_models,
            commands::settings::health_check,
            // Search
            commands::search::search_conversations,
            // Files
            commands::files::upload_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
