use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

use crate::{ForgeError, Result};

#[derive(Debug, Clone, Serialize)]
pub struct ModelDownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: u64,
}

/// Get the models directory (creates if needed).
pub fn models_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    use tauri::Manager;
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| ForgeError::General(format!("Failed to get data dir: {}", e)))?;
    let models = data_dir.join("models");
    std::fs::create_dir_all(&models).map_err(|e| ForgeError::Io(e))?;
    Ok(models)
}

/// Download a GGUF model file from Hugging Face.
pub async fn download_model(
    app_handle: &tauri::AppHandle,
    model_id: &str,
    hf_repo: &str,
    filename: &str,
    cancel_token: &CancellationToken,
) -> Result<PathBuf> {
    let dir = models_dir(app_handle)?;
    let output_path = dir.join(filename);
    let part_path = dir.join(format!("{}.part", filename));

    // Check if already downloaded
    if output_path.exists() {
        log::info!("Model already exists: {:?}", output_path);
        return Ok(output_path);
    }

    let url = format!(
        "https://huggingface.co/{}/resolve/main/{}",
        hf_repo, filename
    );
    log::info!("Downloading model from: {}", url);

    let client = reqwest::Client::new();

    // Support resume: check existing .part file
    let existing_bytes = if part_path.exists() {
        std::fs::metadata(&part_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    let mut request = client.get(&url);
    if existing_bytes > 0 {
        log::info!("Resuming download from byte {}", existing_bytes);
        request = request.header("Range", format!("bytes={}-", existing_bytes));
    }

    let resp = request
        .send()
        .await
        .map_err(|e| ForgeError::Network(e))?;

    if !resp.status().is_success() && resp.status().as_u16() != 206 {
        return Err(ForgeError::General(format!(
            "Failed to download model: HTTP {}",
            resp.status()
        )));
    }

    let total_bytes = if resp.status().as_u16() == 206 {
        // Partial content — parse Content-Range header
        resp.headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.rsplit('/').next())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
    } else {
        resp.content_length().unwrap_or(0)
    };

    let mut downloaded_bytes = existing_bytes;
    let start_time = std::time::Instant::now();

    {
        use futures::StreamExt;
        use tokio::io::AsyncWriteExt;

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&part_path)
            .await
            .map_err(|e| ForgeError::Io(e))?;

        let mut stream = resp.bytes_stream();
        let mut last_report = std::time::Instant::now();

        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    log::info!("Model download cancelled");
                    file.flush().await.map_err(|e| ForgeError::Io(e))?;
                    return Err(ForgeError::General("Download cancelled".to_string()));
                }
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(data)) => {
                            file.write_all(&data).await.map_err(|e| ForgeError::Io(e))?;
                            downloaded_bytes += data.len() as u64;

                            // Report progress at most twice per second
                            if last_report.elapsed() > std::time::Duration::from_millis(500) {
                                let elapsed = start_time.elapsed().as_secs_f64();
                                let speed_bps = if elapsed > 0.0 {
                                    ((downloaded_bytes - existing_bytes) as f64 / elapsed) as u64
                                } else {
                                    0
                                };
                                let remaining = total_bytes.saturating_sub(downloaded_bytes);
                                let eta_seconds = if speed_bps > 0 {
                                    remaining / speed_bps
                                } else {
                                    0
                                };

                                let _ = app_handle.emit("model:download-progress", ModelDownloadProgress {
                                    model_id: model_id.to_string(),
                                    downloaded_bytes,
                                    total_bytes,
                                    speed_bps,
                                    eta_seconds,
                                });

                                last_report = std::time::Instant::now();
                            }
                        }
                        Some(Err(e)) => {
                            file.flush().await.map_err(|e| ForgeError::Io(e))?;
                            return Err(ForgeError::Network(e));
                        }
                        None => break,
                    }
                }
            }
        }

        file.flush().await.map_err(|e| ForgeError::Io(e))?;
    }

    // Rename .part to final filename
    std::fs::rename(&part_path, &output_path)
        .map_err(|e| ForgeError::Io(e))?;

    // Final progress event
    let _ = app_handle.emit("model:download-progress", ModelDownloadProgress {
        model_id: model_id.to_string(),
        downloaded_bytes: total_bytes,
        total_bytes,
        speed_bps: 0,
        eta_seconds: 0,
    });

    log::info!("Model downloaded to: {:?}", output_path);
    Ok(output_path)
}

/// Delete a model file.
pub fn delete_model_file(path: &Path) -> Result<()> {
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| ForgeError::Io(e))?;
    }
    // Also remove any .part file
    let part = path.with_extension("gguf.part");
    if part.exists() {
        let _ = std::fs::remove_file(&part);
    }
    Ok(())
}
