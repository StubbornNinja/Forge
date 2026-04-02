use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{Conversation, ConversationSummary};
use crate::Result;

pub fn create_conversation(
    conn: &Connection,
    title: Option<&str>,
    model: Option<&str>,
    system_prompt: Option<&str>,
) -> Result<Conversation> {
    let id = Uuid::new_v4().to_string();
    let title = title.unwrap_or("New Conversation");

    conn.execute(
        "INSERT INTO conversations (id, title, model, system_prompt) VALUES (?1, ?2, ?3, ?4)",
        params![id, title, model, system_prompt],
    )?;

    get_conversation(conn, &id)
}

pub fn get_conversation(conn: &Connection, id: &str) -> Result<Conversation> {
    let conv = conn.query_row(
        "SELECT id, title, created_at, updated_at, model, system_prompt FROM conversations WHERE id = ?1",
        params![id],
        |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                model: row.get(4)?,
                system_prompt: row.get(5)?,
            })
        },
    )?;
    Ok(conv)
}

pub fn list_conversations(
    conn: &Connection,
    limit: u32,
    offset: u32,
) -> Result<Vec<ConversationSummary>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.title, c.updated_at,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
                (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY sort_order DESC LIMIT 1) as last_preview
         FROM conversations c
         ORDER BY c.updated_at DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let rows = stmt.query_map(params![limit, offset], |row| {
        let raw_preview: Option<String> = row.get(4)?;
        let preview = raw_preview.map(|s| clean_preview(&s));
        Ok(ConversationSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            updated_at: row.get(2)?,
            message_count: row.get(3)?,
            last_message_preview: preview,
        })
    })?;

    let mut conversations = Vec::new();
    for row in rows {
        conversations.push(row?);
    }
    Ok(conversations)
}

/// Strip <think>...</think> blocks, markdown formatting, and excess whitespace
/// from a message to produce a clean sidebar preview.
fn clean_preview(s: &str) -> String {
    let mut result = s.to_string();

    // Remove <think>...</think> blocks (including incomplete ones at the end)
    while let Some(start) = result.find("<think>") {
        if let Some(end) = result.find("</think>") {
            result = format!("{}{}", &result[..start], &result[end + 8..]);
        } else {
            // Incomplete think block — remove everything from <think> onward
            result = result[..start].to_string();
            break;
        }
    }

    // Remove markdown bold/italic markers
    result = result.replace("**", "").replace("__", "");

    // Collapse whitespace and trim
    result = result.split_whitespace().collect::<Vec<_>>().join(" ");
    result.trim().to_string()
}

pub fn update_conversation_title(conn: &Connection, id: &str, title: &str) -> Result<()> {
    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![title, id],
    )?;
    Ok(())
}

pub fn delete_conversation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn touch_conversation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::initialize_db_in_memory;
    use crate::db::migrations::run_migrations;

    fn setup() -> Connection {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_and_get_conversation() {
        let conn = setup();
        let conv = create_conversation(&conn, Some("Test Chat"), None, None).unwrap();
        assert_eq!(conv.title, "Test Chat");

        let fetched = get_conversation(&conn, &conv.id).unwrap();
        assert_eq!(fetched.id, conv.id);
        assert_eq!(fetched.title, "Test Chat");
    }

    #[test]
    fn test_list_conversations() {
        let conn = setup();
        create_conversation(&conn, Some("First"), None, None).unwrap();
        create_conversation(&conn, Some("Second"), None, None).unwrap();

        let list = list_conversations(&conn, 10, 0).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_update_title() {
        let conn = setup();
        let conv = create_conversation(&conn, Some("Old Title"), None, None).unwrap();
        update_conversation_title(&conn, &conv.id, "New Title").unwrap();

        let fetched = get_conversation(&conn, &conv.id).unwrap();
        assert_eq!(fetched.title, "New Title");
    }

    #[test]
    fn test_delete_conversation() {
        let conn = setup();
        let conv = create_conversation(&conn, Some("To Delete"), None, None).unwrap();
        delete_conversation(&conn, &conv.id).unwrap();

        let result = get_conversation(&conn, &conv.id);
        assert!(result.is_err());
    }
}
