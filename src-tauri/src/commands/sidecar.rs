use tauri::State;

use crate::sidecar::binary::{self, BinaryInfo, UpdateCheckResult};
use crate::sidecar::process::SidecarStatusInfo;
use crate::{AppState, ForgeError, Result};

#[tauri::command]
pub async fn sidecar_ensure_binary(
    app: tauri::AppHandle,
) -> Result<BinaryInfo> {
    binary::ensure_binary(&app).await
}

#[tauri::command]
pub async fn sidecar_binary_status(
    app: tauri::AppHandle,
) -> Result<BinaryInfo> {
    binary::binary_status(&app)
}

#[tauri::command]
pub async fn sidecar_start(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model_path: String,
    extra_args: Option<Vec<String>>,
) -> Result<()> {
    let mut sidecar = state.sidecar.lock().await;
    sidecar.start(&app, &model_path, &extra_args.unwrap_or_default()).await
}

#[tauri::command]
pub async fn sidecar_stop(
    state: State<'_, AppState>,
) -> Result<()> {
    let mut sidecar = state.sidecar.lock().await;
    sidecar.stop().await
}

#[tauri::command]
pub async fn sidecar_status(
    state: State<'_, AppState>,
) -> Result<SidecarStatusInfo> {
    let sidecar = state.sidecar.lock().await;
    Ok(sidecar.status_info())
}

/// Check GitHub for a newer llama.cpp release.
#[tauri::command]
pub async fn sidecar_check_update(
    app: tauri::AppHandle,
) -> Result<UpdateCheckResult> {
    binary::check_for_update(&app).await
}

/// Download and install a specific llama.cpp release, stopping the sidecar first if running.
#[tauri::command]
pub async fn sidecar_update_binary(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tag: String,
) -> Result<BinaryInfo> {
    // Stop sidecar if running — can't replace binary while in use
    {
        let mut sidecar = state.sidecar.lock().await;
        if sidecar.base_url().is_some() {
            log::info!("Stopping sidecar before updating binary");
            sidecar.stop().await?;
        }
    }

    binary::download_release(&app, &tag).await
}

/// Auto-start sidecar if settings indicate local mode with a model configured.
#[tauri::command]
pub async fn sidecar_auto_start(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<()> {
    let should_start = {
        let s = state.settings.read().map_err(|e| ForgeError::General(e.to_string()))?;
        let mode = s.inference_mode.as_deref().unwrap_or("external");
        (mode == "local" || mode == "auto") && s.local_model_id.is_some()
    };
    if should_start {
        log::info!("Auto-starting sidecar for local inference...");
        crate::ensure_provider_ready(&app, &state).await?;
    }
    Ok(())
}
