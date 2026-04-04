use rusqlite::Connection;

use crate::Result;

struct Migration {
    version: i32,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "core_tables",
        sql: "
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'New Conversation',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                model TEXT,
                system_prompt TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                token_count INTEGER,
                model TEXT,
                tool_calls TEXT,
                tool_call_id TEXT,
                attachments TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sort_order);
        ",
    },
    Migration {
        version: 2,
        name: "fts5_search",
        sql: "
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                content_rowid='rowid',
                tokenize='porter unicode61'
            );

            CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
            END;

            CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                DELETE FROM messages_fts WHERE rowid = OLD.rowid;
            END;

            CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
                DELETE FROM messages_fts WHERE rowid = OLD.rowid;
                INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
            END;
        ",
    },
    Migration {
        version: 3,
        name: "settings_table",
        sql: "
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        ",
    },
    Migration {
        version: 4,
        name: "branching_parent_id",
        sql: "
            ALTER TABLE messages ADD COLUMN parent_message_id TEXT REFERENCES messages(id);
            CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id);
        ",
    },
    Migration {
        version: 5,
        name: "thinking_disabled_flag",
        sql: "
            ALTER TABLE messages ADD COLUMN thinking_disabled INTEGER NOT NULL DEFAULT 0;
        ",
    },
    Migration {
        version: 6,
        name: "models_table",
        sql: "
            CREATE TABLE IF NOT EXISTS models (
                id TEXT PRIMARY KEY,
                catalog_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                quant TEXT NOT NULL,
                hf_repo TEXT NOT NULL,
                downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
                last_used_at TEXT
            );
        ",
    },
];

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Create migrations tracking table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    for migration in MIGRATIONS {
        let applied: bool = conn
            .prepare("SELECT COUNT(*) FROM _migrations WHERE version = ?1")?
            .query_row([migration.version], |row| {
                let count: i32 = row.get(0)?;
                Ok(count > 0)
            })?;

        if !applied {
            conn.execute_batch(migration.sql)?;
            conn.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                rusqlite::params![migration.version, migration.name],
            )?;
            log::info!("Applied migration {}: {}", migration.version, migration.name);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::initialize_db_in_memory;

    #[test]
    fn test_migrations_create_tables() {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"conversations".to_string()));
        assert!(tables.contains(&"messages".to_string()));
        assert!(tables.contains(&"settings".to_string()));
        assert!(tables.contains(&"_migrations".to_string()));
    }

    #[test]
    fn test_migrations_idempotent() {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap(); // Should not error

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 6);
    }

    #[test]
    fn test_fts_triggers() {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert a conversation
        conn.execute(
            "INSERT INTO conversations (id, title) VALUES ('conv1', 'Test')",
            [],
        )
        .unwrap();

        // Insert a message
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, sort_order) VALUES ('msg1', 'conv1', 'user', 'hello world search test', 0)",
            [],
        )
        .unwrap();

        // FTS should find it
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH 'hello'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Delete the message
        conn.execute("DELETE FROM messages WHERE id = 'msg1'", [])
            .unwrap();

        // FTS should no longer find it
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH 'hello'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
