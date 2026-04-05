use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct QuantVariant {
    pub quant: &'static str,
    pub filename: &'static str,
    pub size_bytes: u64,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CatalogEntry {
    pub id: &'static str,
    pub display_name: &'static str,
    pub family: &'static str,
    pub hf_repo: &'static str,
    pub variants: Vec<QuantVariant>,
    pub recommended_ram_gb: u32,
    pub context_length: u32,
    pub supports_tool_use: bool,
    /// Extra args passed to llama-server for this model.
    pub server_args: Vec<String>,
    pub description: &'static str,
}

/// Curated model catalog — models known to work well with Forge.
pub fn get_catalog() -> Vec<CatalogEntry> {
    vec![
        CatalogEntry {
            id: "qwen3.5-9b",
            display_name: "Qwen 3.5 9B",
            family: "qwen3.5",
            hf_repo: "unsloth/Qwen3.5-9B-GGUF",
            variants: vec![
                QuantVariant {
                    quant: "Q4_K_M",
                    filename: "Qwen3.5-9B-Q4_K_M.gguf",
                    size_bytes: 5_680_000_000,
                    recommended: true,
                },
                QuantVariant {
                    quant: "Q5_K_M",
                    filename: "Qwen3.5-9B-Q5_K_M.gguf",
                    size_bytes: 6_580_000_000,
                    recommended: false,
                },
            ],
            recommended_ram_gb: 8,
            context_length: 131072,
            supports_tool_use: true,
            server_args: vec![
                "--jinja".to_string(),
                "--reasoning-format".to_string(),
                "auto".to_string(),
            ],
            description: "Fast, capable reasoning model. Great for coding, analysis, and general chat.",
        },
        CatalogEntry {
            id: "gemma4-e2b",
            display_name: "Gemma 4 E2B",
            family: "gemma4",
            hf_repo: "unsloth/gemma-4-E2B-it-GGUF",
            variants: vec![
                QuantVariant {
                    quant: "Q4_K_M",
                    filename: "gemma-4-E2B-it-Q4_K_M.gguf",
                    size_bytes: 3_110_000_000,
                    recommended: true,
                },
                QuantVariant {
                    quant: "Q8_0",
                    filename: "gemma-4-E2B-it-Q8_0.gguf",
                    size_bytes: 5_050_000_000,
                    recommended: false,
                },
            ],
            recommended_ram_gb: 6,
            context_length: 131072,
            supports_tool_use: true,
            server_args: vec![
                "--jinja".to_string(),
                "--reasoning-format".to_string(),
                "auto".to_string(),
            ],
            description: "Compact model with strong performance for its size. Good for everyday chat and quick tasks.",
        },
        CatalogEntry {
            id: "gemma4-26b-moe",
            display_name: "Gemma 4 26B MoE",
            family: "gemma4",
            hf_repo: "unsloth/gemma-4-26B-A4B-it-GGUF",
            variants: vec![
                QuantVariant {
                    quant: "UD-IQ4_XS",
                    filename: "gemma-4-26B-A4B-it-UD-IQ4_XS.gguf",
                    size_bytes: 13_400_000_000,
                    recommended: false,
                },
                QuantVariant {
                    quant: "UD-Q4_K_M",
                    filename: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
                    size_bytes: 16_900_000_000,
                    recommended: true,
                },
            ],
            recommended_ram_gb: 18,
            context_length: 262144,
            supports_tool_use: true,
            server_args: vec![
                "--jinja".to_string(),
                "--reasoning-format".to_string(),
                "auto".to_string(),
            ],
            description: "Google's frontier-level model with MoE efficiency. Only 3.8B params active at a time.",
        },
        CatalogEntry {
            id: "qwen3-0.6b",
            display_name: "Qwen 3 0.6B (Title Gen)",
            family: "qwen3",
            hf_repo: "unsloth/Qwen3-0.6B-GGUF",
            variants: vec![
                QuantVariant {
                    quant: "Q4_K_M",
                    filename: "Qwen3-0.6B-Q4_K_M.gguf",
                    size_bytes: 430_000_000,
                    recommended: true,
                },
            ],
            recommended_ram_gb: 2,
            context_length: 32768,
            supports_tool_use: false,
            server_args: vec![
                "--jinja".to_string(),
            ],
            description: "Tiny model for generating conversation titles. Downloaded automatically.",
        },
    ]
}

/// Find a catalog entry by ID.
pub fn find_catalog_entry(id: &str) -> Option<CatalogEntry> {
    get_catalog().into_iter().find(|e| e.id == id)
}
