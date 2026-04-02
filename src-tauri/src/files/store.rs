use crate::db::models::FileMetadata;

/// In-memory store for file metadata within a session.
pub struct FileStore {
    files: Vec<FileMetadata>,
}

impl FileStore {
    pub fn new() -> Self {
        Self { files: Vec::new() }
    }

    pub fn add(&mut self, file: FileMetadata) {
        self.files.push(file);
    }

    pub fn get(&self, id: &str) -> Option<&FileMetadata> {
        self.files.iter().find(|f| f.id == id)
    }

    pub fn list(&self) -> &[FileMetadata] {
        &self.files
    }
}

impl Default for FileStore {
    fn default() -> Self {
        Self::new()
    }
}
