use thiserror::Error;

#[derive(Error, Debug)]
pub enum ForgeError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Inference error: {0}")]
    Inference(String),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Tool error: {0}")]
    Tool(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("{0}")]
    General(String),
}

/// Structured error info for frontend display.
#[derive(serde::Serialize, Clone, Debug)]
pub struct StructuredError {
    pub category: &'static str,
    pub title: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<ErrorAction>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ErrorAction {
    pub label: String,
    pub action_type: String,
}

impl ForgeError {
    /// Convert to a structured error with category, user-friendly message, and suggested action.
    pub fn to_structured(&self) -> StructuredError {
        match self {
            ForgeError::Network(_) => StructuredError {
                category: "connection_failed",
                title: "Connection Failed".to_string(),
                description: "Can't reach the model server. Make sure LM Studio or your inference server is running.".to_string(),
                action: Some(ErrorAction {
                    label: "Open Settings".to_string(),
                    action_type: "open_settings".to_string(),
                }),
            },
            ForgeError::Inference(msg) if msg.contains("model") || msg.contains("No choices") => StructuredError {
                category: "model_not_found",
                title: "Model Error".to_string(),
                description: format!("The model couldn't generate a response. {}", msg),
                action: Some(ErrorAction {
                    label: "Open Settings".to_string(),
                    action_type: "open_settings".to_string(),
                }),
            },
            ForgeError::Inference(msg) => StructuredError {
                category: "stream_interrupted",
                title: "Generation Failed".to_string(),
                description: msg.clone(),
                action: Some(ErrorAction {
                    label: "Retry".to_string(),
                    action_type: "retry".to_string(),
                }),
            },
            ForgeError::Tool(msg) if msg.to_lowercase().contains("search") => StructuredError {
                category: "search_unavailable",
                title: "Search Unavailable".to_string(),
                description: "Web search failed. Check your search backend configuration.".to_string(),
                action: Some(ErrorAction {
                    label: "Open Settings".to_string(),
                    action_type: "open_settings".to_string(),
                }),
            },
            ForgeError::Tool(msg) if msg.to_lowercase().contains("file") => StructuredError {
                category: "file_upload_failed",
                title: "File Error".to_string(),
                description: msg.clone(),
                action: None,
            },
            _ => StructuredError {
                category: "general",
                title: "Something went wrong".to_string(),
                description: self.to_string(),
                action: None,
            },
        }
    }
}

impl serde::Serialize for ForgeError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_structured().serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, ForgeError>;
