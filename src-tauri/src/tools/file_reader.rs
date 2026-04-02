use async_trait::async_trait;
use serde_json::{json, Value};

use super::registry::Tool;
use crate::Result;

pub struct FileReaderTool;

impl FileReaderTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for FileReaderTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "Read the contents of a file from the local filesystem. Supports text files."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The absolute path to the file to read"
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<String> {
        let path = arguments["path"]
            .as_str()
            .ok_or_else(|| crate::ForgeError::Tool("Missing 'path' parameter".to_string()))?;

        let file_path = std::path::Path::new(path);

        if !file_path.exists() {
            return Err(crate::ForgeError::Tool(format!(
                "File not found: {}",
                path
            )));
        }

        let metadata = std::fs::metadata(file_path)?;

        // Limit file size to 1MB
        if metadata.len() > 1_048_576 {
            return Err(crate::ForgeError::Tool(
                "File too large (>1MB). Please provide a smaller file.".to_string(),
            ));
        }

        let content = std::fs::read_to_string(file_path).map_err(|e| {
            crate::ForgeError::Tool(format!("Failed to read file: {}. It may be a binary file.", e))
        })?;

        Ok(content)
    }
}
