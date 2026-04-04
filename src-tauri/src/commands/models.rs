use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::models::catalog::{self, CatalogEntry};
use crate::models::download;
use crate::models::manager::{self, InstalledModel};
use crate::{AppState, ForgeError, Result};

#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub gpu_backend: String,
    pub gpu_vram_mb: Option<u64>,
}

#[tauri::command]
pub async fn list_catalog_models() -> Result<Vec<CatalogEntry>> {
    Ok(catalog::get_catalog())
}

#[tauri::command]
pub async fn list_installed_models(
    state: State<'_, AppState>,
) -> Result<Vec<InstalledModel>> {
    let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
    manager::list_installed_models(&db)
}

#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    catalog_id: String,
    quant: String,
) -> Result<InstalledModel> {
    let entry = catalog::find_catalog_entry(&catalog_id)
        .ok_or_else(|| ForgeError::General(format!("Unknown catalog model: {}", catalog_id)))?;

    let variant = entry.variants.iter()
        .find(|v| v.quant == quant)
        .ok_or_else(|| ForgeError::General(format!("Unknown quant {} for {}", quant, catalog_id)))?;

    // Create a new cancellation token for this download
    let cancel_token = CancellationToken::new();
    {
        let mut current = state.model_download_cancel.lock()
            .map_err(|e| ForgeError::General(e.to_string()))?;
        *current = cancel_token.clone();
    }

    let model_path = download::download_model(
        &app,
        &catalog_id,
        entry.hf_repo,
        variant.filename,
        &cancel_token,
    ).await?;

    let model_id = format!("{}-{}", catalog_id, quant.to_lowercase());
    let installed = InstalledModel {
        id: model_id,
        catalog_id: catalog_id.to_string(),
        filename: variant.filename.to_string(),
        file_path: model_path.to_string_lossy().to_string(),
        size_bytes: variant.size_bytes as i64,
        quant: quant.to_string(),
        hf_repo: entry.hf_repo.to_string(),
        downloaded_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        last_used_at: None,
    };

    // Save to DB
    {
        let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
        manager::insert_model(&db, &installed)?;
    }

    Ok(installed)
}

#[tauri::command]
pub async fn cancel_model_download(
    state: State<'_, AppState>,
) -> Result<()> {
    let token = state.model_download_cancel.lock()
        .map_err(|e| ForgeError::General(e.to_string()))?;
    token.cancel();
    Ok(())
}

#[tauri::command]
pub async fn delete_model(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<()> {
    let file_path = {
        let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
        let model = manager::get_model(&db, &model_id)?;
        match model {
            Some(m) => m.file_path,
            None => return Err(ForgeError::General(format!("Model not found: {}", model_id))),
        }
    };

    // Delete file
    download::delete_model_file(std::path::Path::new(&file_path))?;

    // Delete DB record
    {
        let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
        manager::delete_model(&db, &model_id)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo> {
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_memory();

    let total_ram_gb = sys.total_memory() as f64 / 1_073_741_824.0;
    let available_ram_gb = sys.available_memory() as f64 / 1_073_741_824.0;

    let gpu = crate::sidecar::gpu::detect_gpu();

    Ok(SystemInfo {
        total_ram_gb,
        available_ram_gb,
        gpu_backend: gpu.backend,
        gpu_vram_mb: gpu.vram_mb,
    })
}
