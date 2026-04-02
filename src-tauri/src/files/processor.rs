use std::path::Path;

use crate::db::models::FileMetadata;
use crate::Result;

/// Process a file and extract its text content if supported.
pub fn process_file(path: &Path) -> Result<FileMetadata> {
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let metadata = std::fs::metadata(path)?;
    let size_bytes = metadata.len();

    let mime_type = detect_mime_type(path);

    let extracted_text = if is_text_extractable(&mime_type) {
        std::fs::read_to_string(path).ok()
    } else {
        None
    };

    Ok(FileMetadata {
        id: uuid::Uuid::new_v4().to_string(),
        filename,
        mime_type,
        size_bytes,
        extracted_text,
    })
}

fn detect_mime_type(path: &Path) -> String {
    match path.extension().and_then(|e| e.to_str()) {
        Some("txt") => "text/plain",
        Some("md") => "text/markdown",
        Some("rs") => "text/x-rust",
        Some("py") => "text/x-python",
        Some("js") | Some("jsx") => "text/javascript",
        Some("ts") | Some("tsx") => "text/typescript",
        Some("json") => "application/json",
        Some("html") | Some("htm") => "text/html",
        Some("css") => "text/css",
        Some("csv") => "text/csv",
        Some("xml") => "application/xml",
        Some("yaml") | Some("yml") => "text/yaml",
        Some("toml") => "text/toml",
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn is_text_extractable(mime_type: &str) -> bool {
    mime_type.starts_with("text/")
        || mime_type == "application/json"
        || mime_type == "application/xml"
}
