use crate::config::settings::AppSettings;

const DEFAULT_SYSTEM_PROMPT_BASE: &str = r#"You are Forge, a thoughtful and capable AI assistant running locally on the user's machine. You engage with questions honestly and directly, acknowledging uncertainty when you have it. You avoid empty flattery and sycophancy. You respect the user's intelligence and autonomy.

When you're unsure about something, you say so. When you disagree, you explain why. When asked about your limitations, you're straightforward.

Each user message is prefixed with a timestamp like [5:41 PM]. Use these to track the current time rather than relying solely on the initial system timestamp."#;

const TOOL_PROMPT_WEB_SEARCH: &str = r#"

You have a `web_search` tool available. Use it proactively when the user asks about current events, recent information, or anything you're uncertain about. Don't hesitate to search — it's better to verify than guess."#;

pub fn build_system_prompt(settings: &AppSettings, available_tools: &[String]) -> Option<String> {
    if !settings.system_prompt_enabled {
        return None;
    }

    let timestamp = chrono::Local::now().format("%A, %B %-d, %Y at %-I:%M %p %Z").to_string();
    let time_line = format!("\n\nCurrent date and time: {}", timestamp);

    if let Some(ref custom) = settings.custom_system_prompt {
        if !custom.is_empty() {
            return Some(format!("{}{}", custom, time_line));
        }
    }

    let mut prompt = DEFAULT_SYSTEM_PROMPT_BASE.to_string();

    if available_tools.contains(&"web_search".to_string()) {
        prompt.push_str(TOOL_PROMPT_WEB_SEARCH);
    }

    prompt.push_str(&time_line);

    Some(prompt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_prompt_no_tools() {
        let settings = AppSettings::default();
        let prompt = build_system_prompt(&settings, &[]);
        assert!(prompt.is_some());
        assert!(prompt.as_ref().unwrap().contains("Forge"));
        assert!(!prompt.unwrap().contains("web_search"));
    }

    #[test]
    fn test_default_prompt_with_search() {
        let settings = AppSettings::default();
        let prompt = build_system_prompt(&settings, &["web_search".to_string()]);
        assert!(prompt.as_ref().unwrap().contains("web_search"));
    }

    #[test]
    fn test_custom_prompt() {
        let mut settings = AppSettings::default();
        settings.custom_system_prompt = Some("You are a pirate.".to_string());
        let prompt = build_system_prompt(&settings, &["web_search".to_string()]);
        assert_eq!(prompt.unwrap(), "You are a pirate.");
    }

    #[test]
    fn test_disabled_prompt() {
        let mut settings = AppSettings::default();
        settings.system_prompt_enabled = false;
        let prompt = build_system_prompt(&settings, &[]);
        assert!(prompt.is_none());
    }
}
