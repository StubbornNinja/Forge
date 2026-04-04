use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GpuInfo {
    pub backend: String,
    pub vram_mb: Option<u64>,
}

/// Detect available GPU acceleration backend.
pub fn detect_gpu() -> GpuInfo {
    #[cfg(target_os = "macos")]
    {
        // macOS always has Metal on Apple Silicon and recent Intel Macs
        return GpuInfo {
            backend: "metal".to_string(),
            vram_mb: None, // Unified memory — no separate VRAM
        };
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Check for NVIDIA GPU via nvidia-smi
        if let Ok(output) = std::process::Command::new("nvidia-smi")
            .arg("--query-gpu=memory.total")
            .arg("--format=csv,noheader,nounits")
            .output()
        {
            if output.status.success() {
                let vram = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .lines()
                    .next()
                    .and_then(|s| s.trim().parse::<u64>().ok());
                return GpuInfo {
                    backend: "cuda".to_string(),
                    vram_mb: vram,
                };
            }
        }

        // Fallback to CPU
        GpuInfo {
            backend: "cpu".to_string(),
            vram_mb: None,
        }
    }
}
