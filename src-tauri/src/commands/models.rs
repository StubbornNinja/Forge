use serde::{Deserialize, Serialize};
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::models::catalog::{self, CatalogEntry};
use crate::models::download;
use crate::models::manager::{self, InstalledModel};
use crate::{AppState, ForgeError, Result};

/// A HuggingFace model search result.
#[derive(Debug, Clone, Serialize)]
pub struct HfModelResult {
    pub id: String,
    pub downloads: u64,
    pub likes: u64,
}

/// A GGUF file in a HuggingFace repo.
#[derive(Debug, Clone, Serialize)]
pub struct HfGgufFile {
    pub filename: String,
    pub size_bytes: u64,
}

/// Raw response item from HF models API.
#[derive(Debug, Deserialize)]
struct HfModelApiItem {
    #[serde(rename = "modelId", alias = "id")]
    id: String,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    likes: u64,
}

/// Raw response item from HF tree API.
#[derive(Debug, Deserialize)]
struct HfTreeItem {
    #[serde(rename = "type")]
    item_type: String,
    path: String,
    #[serde(default)]
    size: u64,
    lfs: Option<HfLfs>,
}

#[derive(Debug, Deserialize)]
struct HfLfs {
    size: u64,
}

#[derive(Serialize)]
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

/// Search HuggingFace for GGUF models.
#[tauri::command]
pub async fn search_hf_models(query: String) -> Result<Vec<HfModelResult>> {
    let url = format!(
        "https://huggingface.co/api/models?search={}&library=gguf&sort=downloads&direction=-1&limit=20",
        urlencoding(&query)
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(ForgeError::Network)?;

    if !resp.status().is_success() {
        return Err(ForgeError::General(format!(
            "HuggingFace API error: HTTP {}",
            resp.status()
        )));
    }

    let items: Vec<HfModelApiItem> = resp
        .json()
        .await
        .map_err(ForgeError::Network)?;

    Ok(items
        .into_iter()
        .map(|item| HfModelResult {
            id: item.id,
            downloads: item.downloads,
            likes: item.likes,
        })
        .collect())
}

/// List GGUF files in a HuggingFace repo.
#[tauri::command]
pub async fn list_hf_files(repo_id: String) -> Result<Vec<HfGgufFile>> {
    let url = format!(
        "https://huggingface.co/api/models/{}/tree/main",
        repo_id
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(ForgeError::Network)?;

    if !resp.status().is_success() {
        return Err(ForgeError::General(format!(
            "HuggingFace API error: HTTP {}",
            resp.status()
        )));
    }

    let items: Vec<HfTreeItem> = resp
        .json()
        .await
        .map_err(ForgeError::Network)?;

    Ok(items
        .into_iter()
        .filter(|item| item.item_type == "file" && item.path.ends_with(".gguf"))
        .map(|item| {
            let size = item.lfs.map(|l| l.size).unwrap_or(item.size);
            HfGgufFile {
                filename: item.path,
                size_bytes: size,
            }
        })
        .collect())
}

/// Download an arbitrary GGUF model from HuggingFace.
#[tauri::command]
pub async fn download_hf_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    hf_repo: String,
    filename: String,
) -> Result<InstalledModel> {
    // Derive a catalog-style ID from the repo name
    let catalog_id = hf_repo
        .rsplit('/')
        .next()
        .unwrap_or(&hf_repo)
        .to_lowercase()
        .replace("-gguf", "")
        .replace("_gguf", "");

    // Extract quant from filename (e.g., "Model-Q4_K_M.gguf" → "Q4_K_M")
    let quant = filename
        .trim_end_matches(".gguf")
        .rsplit('-')
        .next()
        .unwrap_or("unknown")
        .to_string();

    let cancel_token = CancellationToken::new();
    {
        let mut current = state.model_download_cancel.lock()
            .map_err(|e| ForgeError::General(e.to_string()))?;
        *current = cancel_token.clone();
    }

    let model_path = download::download_model(
        &app,
        &catalog_id,
        &hf_repo,
        &filename,
        &cancel_token,
    ).await?;

    let size_bytes = std::fs::metadata(&model_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let model_id = format!("{}-{}", catalog_id, quant.to_lowercase());
    let installed = InstalledModel {
        id: model_id,
        catalog_id,
        filename: filename.clone(),
        file_path: model_path.to_string_lossy().to_string(),
        size_bytes,
        quant,
        hf_repo,
        downloaded_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        last_used_at: None,
    };

    {
        let db = state.db.lock().map_err(|e| ForgeError::General(e.to_string()))?;
        manager::insert_model(&db, &installed)?;
    }

    Ok(installed)
}

/// Simple URL encoding for query parameters.
fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => "+".to_string(),
            c if c.is_ascii_alphanumeric() || "-_.~".contains(c) => c.to_string(),
            c => format!("%{:02X}", c as u32),
        })
        .collect()
}
