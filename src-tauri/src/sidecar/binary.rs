use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::{ForgeError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryInfo {
    pub path: String,
    pub version: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
}

/// Get the directory where the llama-server binary is stored.
pub fn binary_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    use tauri::Manager;
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| ForgeError::General(format!("Failed to get cache dir: {}", e)))?;
    Ok(cache_dir.join("bin"))
}

/// Get the expected path to the llama-server binary.
pub fn binary_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = binary_dir(app_handle)?;
    let name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    Ok(dir.join(name))
}

/// Check if the binary AND its required libraries exist.
pub fn binary_status(app_handle: &tauri::AppHandle) -> Result<BinaryInfo> {
    let path = binary_path(app_handle)?;
    let dir = binary_dir(app_handle)?;
    // Binary must exist AND libllama must be present (on macOS/Linux)
    let libs_exist = if cfg!(target_os = "macos") {
        dir.join("libllama.dylib").exists()
    } else if cfg!(target_os = "linux") {
        dir.join("libllama.so").exists()
    } else {
        true // Windows links differently
    };
    let exists = path.exists() && libs_exist;
    let version = if exists {
        read_version(&binary_dir(app_handle)?).unwrap_or_else(|| "unknown".to_string())
    } else {
        String::new()
    };
    Ok(BinaryInfo {
        path: path.to_string_lossy().to_string(),
        version,
        exists,
    })
}

/// Platform info for download URL construction.
struct PlatformInfo {
    asset_name: &'static str,
    extension: &'static str,
}

fn platform_info() -> Result<PlatformInfo> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok(PlatformInfo { asset_name: "macos-arm64", extension: "tar.gz" }),
        ("macos", "x86_64") => Ok(PlatformInfo { asset_name: "macos-x64", extension: "tar.gz" }),
        ("linux", "x86_64") => Ok(PlatformInfo { asset_name: "ubuntu-x64", extension: "tar.gz" }),
        ("linux", "aarch64") => Ok(PlatformInfo { asset_name: "ubuntu-arm64", extension: "tar.gz" }),
        ("windows", "x86_64") => Ok(PlatformInfo { asset_name: "win-cpu-x64", extension: "zip" }),
        (os, arch) => Err(ForgeError::General(format!(
            "Unsupported platform: {}-{}",
            os, arch
        ))),
    }
}

/// Ensure llama-server is installed. If missing, fetches the latest release from GitHub.
/// If already installed with any valid version, returns immediately.
pub async fn ensure_binary(app_handle: &tauri::AppHandle) -> Result<BinaryInfo> {
    let status = binary_status(app_handle)?;
    if status.exists && !status.version.is_empty() && status.version != "unknown" {
        log::info!("llama-server {} already installed", status.version);
        return Ok(status);
    }

    // No binary — fetch the latest release tag from GitHub and install it
    log::info!("No llama-server found, fetching latest release from GitHub");
    let latest = fetch_latest_release_tag().await?;
    log::info!("Latest llama.cpp release: {}", latest);
    download_release(app_handle, &latest).await
}

/// Extract llama-server and all required libraries from a tar.gz archive.
/// Uses system `tar` on Unix to properly handle symlinks.
fn extract_from_tarball(archive_path: &Path, output_dir: &Path) -> Result<()> {
    // Use system tar — handles symlinks correctly
    let output = std::process::Command::new("tar")
        .args(["xzf", &archive_path.to_string_lossy(), "-C", &output_dir.to_string_lossy(), "--strip-components=1"])
        .output()
        .map_err(|e| ForgeError::General(format!("Failed to run tar: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ForgeError::General(format!("tar extraction failed: {}", stderr)));
    }

    // Verify llama-server exists
    let server_name = if cfg!(target_os = "windows") { "llama-server.exe" } else { "llama-server" };
    let server_path = output_dir.join(server_name);
    if !server_path.exists() {
        return Err(ForgeError::General("llama-server binary not found after extraction".to_string()));
    }

    // Log what was extracted
    if let Ok(entries) = std::fs::read_dir(output_dir) {
        for entry in entries.flatten() {
            log::info!("Extracted: {:?}", entry.file_name());
        }
    }

    Ok(())
}

/// Extract llama-server and all required libraries from a zip archive.
fn extract_from_zip(zip_path: &Path, output_path: &Path) -> Result<()> {
    let output_dir = output_path.parent()
        .ok_or_else(|| ForgeError::General("Invalid output path".to_string()))?;

    let file = std::fs::File::open(zip_path)
        .map_err(|e| ForgeError::Io(e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| ForgeError::General(format!("Failed to open zip: {}", e)))?;

    let server_name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };

    let mut found_server = false;

    // Extract llama-server binary AND all shared libraries (.dylib, .so, .dll)
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| ForgeError::General(format!("Failed to read zip entry: {}", e)))?;

        let name = entry.name().to_string();

        // Skip directories and macOS metadata
        if entry.is_dir() || name.contains("__MACOSX") {
            continue;
        }

        let filename = Path::new(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        // Extract the server binary
        let should_extract = filename == server_name
            // Extract shared libraries (dylib on macOS, so on Linux, dll on Windows)
            || filename.ends_with(".dylib")
            || filename.ends_with(".so")
            || (filename.ends_with(".dll") && cfg!(target_os = "windows"))
            // Also extract .metal files (Metal shader library for macOS GPU)
            || filename.ends_with(".metal");

        if should_extract {
            let dest = output_dir.join(filename);
            log::info!("Extracting: {} -> {:?}", name, dest);

            let mut outfile = std::fs::File::create(&dest)
                .map_err(|e| ForgeError::Io(e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| ForgeError::Io(e))?;

            // Make executable on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
            }

            if filename == server_name {
                found_server = true;
            }
        }
    }

    if !found_server {
        return Err(ForgeError::General(
            "llama-server binary not found in zip archive".to_string(),
        ));
    }

    Ok(())
}

fn write_version(dir: &Path, version: &str) {
    let version_file = dir.join("llama-server.version.json");
    let _ = std::fs::write(
        &version_file,
        serde_json::json!({ "version": version }).to_string(),
    );
}

fn read_version(dir: &Path) -> Option<String> {
    let version_file = dir.join("llama-server.version.json");
    let content = std::fs::read_to_string(&version_file).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json["version"].as_str().map(|s| s.to_string())
}

/// Fetch the latest llama.cpp release tag from GitHub.
async fn fetch_latest_release_tag() -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("Forge-App")
        .build()
        .map_err(|e| ForgeError::Network(e))?;

    let resp = client
        .get("https://api.github.com/repos/ggml-org/llama.cpp/releases/latest")
        .send()
        .await
        .map_err(|e| ForgeError::Network(e))?;

    if !resp.status().is_success() {
        return Err(ForgeError::General(format!(
            "GitHub API returned HTTP {}",
            resp.status()
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| ForgeError::Network(e))?;

    body["tag_name"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| ForgeError::General("Missing tag_name in GitHub response".to_string()))
}

/// Check GitHub for a newer llama.cpp release and compare with the installed version.
pub async fn check_for_update(app_handle: &tauri::AppHandle) -> Result<UpdateCheckResult> {
    let dir = binary_dir(app_handle)?;
    let current_version = read_version(&dir).unwrap_or_default();
    let latest_version = fetch_latest_release_tag().await?;
    let update_available = !current_version.is_empty() && current_version != latest_version;

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        update_available,
    })
}

/// Download and install a specific llama.cpp release by tag.
pub async fn download_release(app_handle: &tauri::AppHandle, tag: &str) -> Result<BinaryInfo> {
    // Clean up existing install
    let dir = binary_dir(app_handle)?;
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }

    std::fs::create_dir_all(&dir).map_err(|e| ForgeError::Io(e))?;
    let path = binary_path(app_handle)?;

    let platform = platform_info()?;
    let url = format!(
        "https://github.com/ggml-org/llama.cpp/releases/download/{}/llama-{}-bin-{}.{}",
        tag, tag, platform.asset_name, platform.extension
    );

    log::info!("Downloading llama-server {} from: {}", tag, url);

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| ForgeError::Network(e))?;

    if !resp.status().is_success() {
        return Err(ForgeError::General(format!(
            "Failed to download llama-server {}: HTTP {}",
            tag,
            resp.status()
        )));
    }

    let total_bytes = resp.content_length().unwrap_or(0);
    let mut downloaded_bytes: u64 = 0;
    let archive_ext = platform.extension;
    let archive_path = dir.join(format!("llama-server-download.{}", archive_ext));

    {
        use futures::StreamExt;
        use tokio::io::AsyncWriteExt;

        let mut file = tokio::fs::File::create(&archive_path)
            .await
            .map_err(|e| ForgeError::Io(e))?;

        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| ForgeError::Network(e))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| ForgeError::Io(e))?;
            downloaded_bytes += chunk.len() as u64;

            let _ = app_handle.emit(
                "sidecar:download-progress",
                DownloadProgress {
                    downloaded_bytes,
                    total_bytes,
                    phase: "binary".to_string(),
                },
            );
        }
        file.flush().await.map_err(|e| ForgeError::Io(e))?;
    }

    if archive_ext == "tar.gz" {
        extract_from_tarball(&archive_path, &dir)?;
    } else {
        extract_from_zip(&archive_path, &path)?;
    }

    let _ = std::fs::remove_file(&archive_path);

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("xattr")
            .args(["-cr", &dir.to_string_lossy()])
            .output();
    }

    write_version(&dir, tag);

    log::info!("llama-server {} installed at: {:?}", tag, path);
    binary_status(app_handle)
}
