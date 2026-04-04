use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledModel {
    pub id: String,
    pub catalog_id: String,
    pub filename: String,
    pub file_path: String,
    pub size_bytes: i64,
    pub quant: String,
    pub hf_repo: String,
    pub downloaded_at: String,
    pub last_used_at: Option<String>,
}

/// Insert a newly downloaded model into the database.
pub fn insert_model(conn: &Connection, model: &InstalledModel) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO models (id, catalog_id, filename, file_path, size_bytes, quant, hf_repo, downloaded_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            model.id,
            model.catalog_id,
            model.filename,
            model.file_path,
            model.size_bytes,
            model.quant,
            model.hf_repo,
            model.downloaded_at,
            model.last_used_at,
        ],
    )?;
    Ok(())
}

/// List all installed models.
pub fn list_installed_models(conn: &Connection) -> Result<Vec<InstalledModel>> {
    let mut stmt = conn.prepare(
        "SELECT id, catalog_id, filename, file_path, size_bytes, quant, hf_repo, downloaded_at, last_used_at
         FROM models ORDER BY downloaded_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(InstalledModel {
            id: row.get(0)?,
            catalog_id: row.get(1)?,
            filename: row.get(2)?,
            file_path: row.get(3)?,
            size_bytes: row.get(4)?,
            quant: row.get(5)?,
            hf_repo: row.get(6)?,
            downloaded_at: row.get(7)?,
            last_used_at: row.get(8)?,
        })
    })?;

    let mut models = Vec::new();
    for row in rows {
        models.push(row?);
    }
    Ok(models)
}

/// Delete a model record from the database.
pub fn delete_model(conn: &Connection, model_id: &str) -> Result<()> {
    conn.execute("DELETE FROM models WHERE id = ?1", params![model_id])?;
    Ok(())
}

/// Update last_used_at timestamp.
pub fn touch_model(conn: &Connection, model_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE models SET last_used_at = datetime('now') WHERE id = ?1",
        params![model_id],
    )?;
    Ok(())
}

/// Get a model by ID.
pub fn get_model(conn: &Connection, model_id: &str) -> Result<Option<InstalledModel>> {
    let mut stmt = conn.prepare(
        "SELECT id, catalog_id, filename, file_path, size_bytes, quant, hf_repo, downloaded_at, last_used_at
         FROM models WHERE id = ?1",
    )?;

    let mut rows = stmt.query_map(params![model_id], |row| {
        Ok(InstalledModel {
            id: row.get(0)?,
            catalog_id: row.get(1)?,
            filename: row.get(2)?,
            file_path: row.get(3)?,
            size_bytes: row.get(4)?,
            quant: row.get(5)?,
            hf_repo: row.get(6)?,
            downloaded_at: row.get(7)?,
            last_used_at: row.get(8)?,
        })
    })?;

    match rows.next() {
        Some(Ok(model)) => Ok(Some(model)),
        Some(Err(e)) => Err(e.into()),
        None => Ok(None),
    }
}
