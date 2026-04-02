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

impl serde::Serialize for ForgeError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ForgeError>;
