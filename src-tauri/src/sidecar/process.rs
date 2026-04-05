use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use tauri::Emitter;
use tokio::process::{Child, Command};

use crate::{ForgeError, Result};

const HEALTH_POLL_INTERVAL_MS: u64 = 500;
const HEALTH_TIMEOUT_SECS: u64 = 120;
#[allow(dead_code)]
const MAX_RESTART_ATTEMPTS: u32 = 3;
const PORT_RANGE_START: u16 = 39281;
const PORT_RANGE_END: u16 = 39290;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SidecarStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarStatusInfo {
    pub status: SidecarStatus,
    pub loaded_model: Option<String>,
    pub port: Option<u16>,
    pub error: Option<String>,
}

pub struct SidecarManager {
    child: Option<Child>,
    port: u16,
    loaded_model: Option<String>,
    status: SidecarStatus,
    binary_path: PathBuf,
    error_message: Option<String>,
    restart_count: u32,
    last_start_attempt: Option<std::time::Instant>,
}

impl SidecarManager {
    pub fn new(binary_path: PathBuf) -> Self {
        Self {
            child: None,
            port: PORT_RANGE_START,
            loaded_model: None,
            status: SidecarStatus::Stopped,
            binary_path,
            error_message: None,
            restart_count: 0,
            last_start_attempt: None,
        }
    }

    pub fn status_info(&self) -> SidecarStatusInfo {
        SidecarStatusInfo {
            status: self.status.clone(),
            loaded_model: self.loaded_model.clone(),
            port: if self.status == SidecarStatus::Running { Some(self.port) } else { None },
            error: self.error_message.clone(),
        }
    }

    /// Find an available port in the range.
    fn find_available_port() -> Result<u16> {
        for port in PORT_RANGE_START..=PORT_RANGE_END {
            if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
                return Ok(port);
            }
        }
        // Fallback: let OS assign
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| ForgeError::General(format!("No available port: {}", e)))?;
        Ok(listener.local_addr().unwrap().port())
    }

    /// Start llama-server with the given model and optional extra args.
    pub async fn start(
        &mut self,
        app_handle: &tauri::AppHandle,
        model_path: &str,
        extra_args: &[String],
    ) -> Result<()> {
        // Cooldown: don't restart within 30s of last attempt to avoid loops
        if let Some(last) = self.last_start_attempt {
            if last.elapsed() < Duration::from_secs(30) && self.status == SidecarStatus::Error {
                return Err(ForgeError::General(
                    self.error_message.clone().unwrap_or_else(|| "Sidecar failed recently, waiting before retry".to_string())
                ));
            }
        }
        self.last_start_attempt = Some(std::time::Instant::now());

        // Stop any existing process
        if self.child.is_some() {
            self.stop().await?;
        }

        self.status = SidecarStatus::Starting;
        self.error_message = None;
        self.restart_count = 0;
        self.loaded_model = Some(model_path.to_string());

        let _ = app_handle.emit("sidecar:status", self.status_info());

        self.port = Self::find_available_port()?;

        log::info!(
            "Starting llama-server on port {} with model: {}",
            self.port,
            model_path
        );

        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("--model").arg(model_path)
            .arg("--port").arg(self.port.to_string())
            .arg("--host").arg("127.0.0.1")
            .arg("--jinja")
            .arg("--reasoning-format").arg("auto")
            .arg("--ctx-size").arg("8192")
            .arg("--n-gpu-layers").arg("999")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        // Add model-specific extra args
        for arg in extra_args {
            cmd.arg(arg);
        }

        let child = cmd.spawn().map_err(|e| {
            self.status = SidecarStatus::Error;
            self.error_message = Some(format!("Failed to spawn llama-server: {}", e));
            let _ = app_handle.emit("sidecar:status", self.status_info());
            ForgeError::General(format!("Failed to start llama-server: {}", e))
        })?;

        self.child = Some(child);

        // Poll health endpoint until ready
        let health_url = format!("http://127.0.0.1:{}/health", self.port);
        let client = reqwest::Client::new();
        let start_time = std::time::Instant::now();

        loop {
            if start_time.elapsed() > Duration::from_secs(HEALTH_TIMEOUT_SECS) {
                self.status = SidecarStatus::Error;
                self.error_message = Some("llama-server timed out during startup".to_string());
                let _ = app_handle.emit("sidecar:status", self.status_info());
                return Err(ForgeError::General(
                    "llama-server failed to start within timeout".to_string(),
                ));
            }

            // Check if process died
            if let Some(ref mut child) = self.child {
                match child.try_wait() {
                    Ok(Some(exit)) => {
                        // Wait a moment for pipes to flush, then capture stderr
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        let stderr_msg = if let Some(mut stderr) = child.stderr.take() {
                            use tokio::io::AsyncReadExt;
                            let mut buf = vec![0u8; 8192];
                            let mut output = String::new();
                            loop {
                                match stderr.read(&mut buf).await {
                                    Ok(0) => break,
                                    Ok(n) => output.push_str(&String::from_utf8_lossy(&buf[..n])),
                                    Err(_) => break,
                                }
                                if output.len() > 4000 { break; }
                            }
                            output
                        } else {
                            String::new()
                        };
                        log::error!("llama-server exited with: {} stderr: {}", exit, stderr_msg);

                        self.status = SidecarStatus::Error;
                        let msg = if stderr_msg.is_empty() {
                            format!("llama-server exited with: {}", exit)
                        } else {
                            format!("llama-server exited: {}", stderr_msg.lines().last().unwrap_or(&stderr_msg))
                        };
                        self.error_message = Some(msg.clone());
                        self.child = None;
                        let _ = app_handle.emit("sidecar:status", self.status_info());
                        return Err(ForgeError::General(msg));
                    }
                    Ok(None) => {} // Still running
                    Err(e) => {
                        log::warn!("Error checking llama-server process: {}", e);
                    }
                }
            }

            match client.get(&health_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    self.status = SidecarStatus::Running;
                    self.error_message = None;
                    let _ = app_handle.emit("sidecar:status", self.status_info());
                    log::info!("llama-server is healthy on port {}", self.port);
                    return Ok(());
                }
                _ => {
                    tokio::time::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS)).await;
                }
            }
        }
    }

    /// Stop the llama-server process.
    pub async fn stop(&mut self) -> Result<()> {
        self.status = SidecarStatus::Stopping;

        if let Some(mut child) = self.child.take() {
            log::info!("Stopping llama-server");

            // Try graceful shutdown — send kill signal and wait
            let _ = child.kill().await;

            // Wait up to 5 seconds for exit
            match tokio::time::timeout(Duration::from_secs(5), child.wait()).await {
                Ok(_) => {
                    log::info!("llama-server stopped gracefully");
                }
                Err(_) => {
                    log::warn!("llama-server didn't stop gracefully, killing");
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
            }
        }

        self.status = SidecarStatus::Stopped;
        self.loaded_model = None;
        self.error_message = None;
        Ok(())
    }

    /// Get the base URL for the running server.
    pub fn base_url(&self) -> Option<String> {
        if self.status == SidecarStatus::Running {
            Some(format!("http://127.0.0.1:{}", self.port))
        } else {
            None
        }
    }

    /// Check if the server process is still alive.
    pub fn is_alive(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }
}
