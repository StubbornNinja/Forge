use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{Message, NewMessage, SearchResult};
use crate::Result;

pub fn insert_message(conn: &Connection, msg: &NewMessage) -> Result<Message> {
    let id = Uuid::new_v4().to_string();

    // Get next sort_order for this conversation
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM messages WHERE conversation_id = ?1",
            params![msg.conversation_id],
            |row| row.get(0),
        )?;

    let tool_calls_json = msg.tool_calls.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
    let attachments_json = msg.attachments.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());

    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, token_count, model, tool_calls, tool_call_id, attachments, sort_order, parent_message_id, thinking_disabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            id,
            msg.conversation_id,
            msg.role,
            msg.content,
            msg.token_count,
            msg.model,
            tool_calls_json,
            msg.tool_call_id,
            attachments_json,
            next_order,
            msg.parent_message_id,
            msg.thinking_disabled as i32,
        ],
    )?;

    // Touch the conversation's updated_at
    conn.execute(
        "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?1",
        params![msg.conversation_id],
    )?;

    Ok(Message {
        id,
        conversation_id: msg.conversation_id.clone(),
        role: msg.role.clone(),
        content: msg.content.clone(),
        created_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        token_count: msg.token_count,
        model: msg.model.clone(),
        tool_calls: msg.tool_calls.clone(),
        tool_call_id: msg.tool_call_id.clone(),
        attachments: msg.attachments.clone(),
        sort_order: next_order,
        parent_message_id: msg.parent_message_id.clone(),
        thinking_disabled: msg.thinking_disabled,
    })
}

pub fn get_messages(conn: &Connection, conversation_id: &str) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, created_at, token_count, model, tool_calls, tool_call_id, attachments, sort_order, parent_message_id, thinking_disabled
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY sort_order ASC",
    )?;

    let rows = stmt.query_map(params![conversation_id], |row| {
        let tool_calls_str: Option<String> = row.get(7)?;
        let attachments_str: Option<String> = row.get(9)?;
        let thinking_disabled_int: i32 = row.get::<_, Option<i32>>(12)?.unwrap_or(0);

        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            token_count: row.get(5)?,
            model: row.get(6)?,
            tool_calls: tool_calls_str.and_then(|s| serde_json::from_str(&s).ok()),
            tool_call_id: row.get(8)?,
            attachments: attachments_str.and_then(|s| serde_json::from_str(&s).ok()),
            sort_order: row.get(10)?,
            parent_message_id: row.get(11)?,
            thinking_disabled: thinking_disabled_int != 0,
        })
    })?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row?);
    }
    Ok(messages)
}

pub fn search_messages(conn: &Connection, query: &str, limit: u32) -> Result<Vec<SearchResult>> {
    let mut stmt = conn.prepare(
        "SELECT m.conversation_id, c.title, m.id, snippet(messages_fts, 0, '<b>', '</b>', '...', 32) as snippet, rank
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         JOIN conversations c ON c.id = m.conversation_id
         WHERE messages_fts MATCH ?1
         ORDER BY rank
         LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![query, limit], |row| {
        Ok(SearchResult {
            conversation_id: row.get(0)?,
            conversation_title: row.get(1)?,
            message_id: row.get(2)?,
            content_snippet: row.get(3)?,
            rank: row.get(4)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::initialize_db_in_memory;
    use crate::db::conversations::create_conversation;
    use crate::db::migrations::run_migrations;

    fn setup() -> Connection {
        let conn = initialize_db_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_insert_and_get_messages() {
        let conn = setup();
        let conv = create_conversation(&conn, Some("Test"), None, None).unwrap();

        let msg1 = insert_message(
            &conn,
            &NewMessage {
                conversation_id: conv.id.clone(),
                role: "user".to_string(),
                content: "Hello!".to_string(),
                token_count: None,
                model: None,
                tool_calls: None,
                tool_call_id: None,
                attachments: None,
                parent_message_id: None,
                thinking_disabled: false,
            },
        )
        .unwrap();
        assert_eq!(msg1.sort_order, 0);

        let msg2 = insert_message(
            &conn,
            &NewMessage {
                conversation_id: conv.id.clone(),
                role: "assistant".to_string(),
                content: "Hi there!".to_string(),
                token_count: Some(5),
                model: Some("test-model".to_string()),
                tool_calls: None,
                tool_call_id: None,
                attachments: None,
                parent_message_id: None,
                thinking_disabled: false,
            },
        )
        .unwrap();
        assert_eq!(msg2.sort_order, 1);

        let messages = get_messages(&conn, &conv.id).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn test_search_messages() {
        let conn = setup();
        let conv = create_conversation(&conn, Some("Search Test"), None, None).unwrap();

        insert_message(
            &conn,
            &NewMessage {
                conversation_id: conv.id.clone(),
                role: "user".to_string(),
                content: "Tell me about quantum computing".to_string(),
                token_count: None,
                model: None,
                tool_calls: None,
                tool_call_id: None,
                attachments: None,
                parent_message_id: None,
                thinking_disabled: false,
            },
        )
        .unwrap();

        let results = search_messages(&conn, "quantum", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].conversation_title, "Search Test");
    }

    #[test]
    fn test_cascade_delete() {
        let conn = setup();
        let conv = create_conversation(&conn, Some("To Delete"), None, None).unwrap();

        insert_message(
            &conn,
            &NewMessage {
                conversation_id: conv.id.clone(),
                role: "user".to_string(),
                content: "Will be deleted".to_string(),
                token_count: None,
                model: None,
                tool_calls: None,
                tool_call_id: None,
                attachments: None,
                parent_message_id: None,
                thinking_disabled: false,
            },
        )
        .unwrap();

        crate::db::conversations::delete_conversation(&conn, &conv.id).unwrap();

        let messages = get_messages(&conn, &conv.id).unwrap();
        assert!(messages.is_empty());
    }
}
