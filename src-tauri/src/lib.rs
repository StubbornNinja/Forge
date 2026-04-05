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
pub mod models;
pub mod orchestrator;
pub mod sidecar;
pub mod system_prompt;
pub mod tools;

pub use error::{ForgeError, Result};

use std::sync::Mutex;
use std::sync::RwLock;

use config::settings::AppSettings;
use inference::openai_compat::OpenAICompatProvider;
use tauri::Manager;
use tokio_util::sync::CancellationToken;
use tools::registry::ToolRegistry;
use tools::web_search::WebSearchTool;
use tools::search::{SearchProvider, duckduckgo::DuckDuckGoProvider, brave::BraveSearchProvider, searxng::SearxngProvider};

/// Build the appropriate search provider based on user settings.
pub fn build_search_provider(settings: &AppSettings) -> Box<dyn SearchProvider> {
    let backend = settings.search_backend.as_deref().unwrap_or("auto");

    match backend {
        "searxng" => Box::new(SearxngProvider::new(settings.searxng_url.clone())),
        "brave" => {
            if let Some(ref key) = settings.brave_api_key {
                Box::new(BraveSearchProvider::new(key.clone()))
            } else {
                Box::new(DuckDuckGoProvider::new())
            }
        }
        "duckduckgo" => Box::new(DuckDuckGoProvider::new()),
        // "auto" or anything else
        _ => {
            // Auto: SearXNG if configured with non-default URL, then Brave if key, then DDG
            if !settings.searxng_url.is_empty() && settings.searxng_url != "http://localhost:8080" {
                Box::new(SearxngProvider::new(settings.searxng_url.clone()))
            } else if let Some(ref key) = settings.brave_api_key {
                if !key.is_empty() {
                    Box::new(BraveSearchProvider::new(key.clone()))
                } else {
                    Box::new(DuckDuckGoProvider::new())
                }
            } else {
                Box::new(DuckDuckGoProvider::new())
            }
        }
    }
}

/// Ensure the inference provider is ready for the current mode.
/// In local mode: start sidecar if not running, point provider at it.
/// In external mode: point provider at the configured URL.
pub async fn ensure_provider_ready(
    app_handle: &tauri::AppHandle,
    state: &AppState,
) -> Result<()> {
    let settings = state.settings.read()
        .map_err(|e| ForgeError::General(e.to_string()))?
        .clone();

    let mode = settings.inference_mode.as_deref().unwrap_or("external");

    match mode {
        "local" | "auto" => {
            // Check if we have a local model configured
            if let Some(ref model_id) = settings.local_model_id {
                let mut sidecar = state.sidecar.lock().await;

                // Look up model from DB first — we need the file path for comparison
                let installed_model = {
                    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
                    models::manager::get_model(&db, model_id)?
                };

                if let Some(model) = installed_model {
                    let path = model.file_path.clone();

                    // Already running with the correct model?
                    if let Some(url) = sidecar.base_url() {
                        if sidecar.status_info().loaded_model.as_deref() == Some(path.as_str()) {
                            state.provider.set_base_url(&url);
                            return Ok(());
                        }
                        // Different model selected — stop current sidecar
                        log::info!("Model changed, restarting sidecar");
                        sidecar.stop().await?;
                    }

                    // Get server args from catalog using the model's catalog_id
                    let extra_args = models::catalog::find_catalog_entry(&model.catalog_id)
                        .map(|e| e.server_args)
                        .unwrap_or_default();

                    // Ensure binary exists
                    sidecar::binary::ensure_binary(app_handle).await?;

                    // Update binary path in case it was lazily resolved
                    let binary_path = sidecar::binary::binary_path(app_handle)?;
                    *sidecar = sidecar::process::SidecarManager::new(binary_path);

                    sidecar.start(app_handle, &path, &extra_args).await?;

                    if let Some(url) = sidecar.base_url() {
                        state.provider.set_base_url(&url);
                    }
                } else {
                    // No model found — fall back to external
                    state.provider.set_base_url(&settings.inference_url);
                }
            } else if mode == "auto" {
                // No local model — fall back to external
                state.provider.set_base_url(&settings.inference_url);
            }
        }
        _ => {
            // External mode — use configured URL
            state.provider.set_base_url(&settings.inference_url);
        }
    }

    Ok(())
}

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub provider: OpenAICompatProvider,
    pub settings: RwLock<AppSettings>,
    pub cancel_token: Mutex<CancellationToken>,
    pub tool_registry: tokio::sync::RwLock<ToolRegistry>,
    pub sidecar: tokio::sync::Mutex<sidecar::process::SidecarManager>,
    pub model_download_cancel: Mutex<CancellationToken>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            let provider = OpenAICompatProvider::new(settings.inference_url.clone());

            // Build tool registry based on settings
            let mut tool_registry = ToolRegistry::new();
            if settings.search_enabled {
                let provider = build_search_provider(&settings);
                tool_registry.register(Box::new(WebSearchTool::new(provider)));
            }

            // Initialize sidecar manager (binary path resolved lazily)
            let sidecar_binary = sidecar::binary::binary_path(app.handle())
                .unwrap_or_default();
            let sidecar_mgr = sidecar::process::SidecarManager::new(sidecar_binary);

            // Create app state
            let state = AppState {
                db: Mutex::new(conn),
                provider,
                settings: RwLock::new(settings),
                cancel_token: Mutex::new(CancellationToken::new()),
                tool_registry: tokio::sync::RwLock::new(tool_registry),
                sidecar: tokio::sync::Mutex::new(sidecar_mgr),
                model_download_cancel: Mutex::new(CancellationToken::new()),
            };

            app.manage(state);

            // Position traffic lights via native delegate (no snap on resize)
            #[cfg(target_os = "macos")]
            {
                let main_window = app.get_webview_window("main").unwrap();
                let ns_win = main_window.ns_window().expect("NS window") as cocoa::base::id;
                crate::macos::set_window_background_color(ns_win);
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
            commands::conversations::delete_all_conversations,
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
            // Sidecar
            commands::sidecar::sidecar_ensure_binary,
            commands::sidecar::sidecar_binary_status,
            commands::sidecar::sidecar_start,
            commands::sidecar::sidecar_stop,
            commands::sidecar::sidecar_status,
            commands::sidecar::sidecar_auto_start,
            commands::sidecar::sidecar_check_update,
            commands::sidecar::sidecar_update_binary,
            // Models
            commands::models::list_catalog_models,
            commands::models::list_installed_models,
            commands::models::download_model,
            commands::models::cancel_model_download,
            commands::models::delete_model,
            commands::models::get_system_info,
            commands::models::search_hf_models,
            commands::models::list_hf_files,
            commands::models::download_hf_model,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // Sidecar uses kill_on_drop(true) — child process is killed
            // automatically when the SidecarManager is dropped on exit.
        });
}
