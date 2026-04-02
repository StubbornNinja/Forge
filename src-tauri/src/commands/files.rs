use tauri::State;

use crate::db::models::FileMetadata;
use crate::{AppState, ForgeError, Result};

#[tauri::command]
pub async fn upload_file(
    _state: State<'_, AppState>,
    path: String,
) -> Result<FileMetadata> {
    use std::path::Path;

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(ForgeError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("File not found: {}", path),
        )));
    }

    let filename = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let metadata = std::fs::metadata(file_path)?;
    let size_bytes = metadata.len();

    // Detect MIME type from extension
    let mime_type = match file_path.extension().and_then(|e| e.to_str()) {
        Some("txt") => "text/plain",
        Some("md") => "text/markdown",
        Some("rs") => "text/x-rust",
        Some("py") => "text/x-python",
        Some("js") | Some("jsx") => "text/javascript",
        Some("ts") | Some("tsx") => "text/typescript",
        Some("json") => "application/json",
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("csv") => "text/csv",
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    };

    // Extract text for supported text files
    let extracted_text = if mime_type.starts_with("text/") || mime_type == "application/json" {
        std::fs::read_to_string(file_path).ok()
    } else {
        None
    };

    Ok(FileMetadata {
        id: uuid::Uuid::new_v4().to_string(),
        filename,
        mime_type: mime_type.to_string(),
        size_bytes,
        extracted_text,
    })
}
