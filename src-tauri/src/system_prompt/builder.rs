use crate::config::settings::AppSettings;
use crate::inference::model_profile::ModelProfile;

const DEFAULT_SYSTEM_PROMPT_BASE: &str = r#"You are Forge, a thoughtful and capable AI assistant running locally on the user's machine. You engage with questions honestly and directly, acknowledging uncertainty when you have it. You avoid empty flattery and sycophancy. You respect the user's intelligence and autonomy.

When you're unsure about something, you say so. When you disagree, you explain why. When asked about your limitations, you're straightforward.

Each user message is prefixed with a timestamp like [5:41 PM]. Use these to track the current time rather than relying solely on the initial system timestamp."#;

const TOOL_PROMPT_WEB_SEARCH: &str = r#"

You have a `web_search` tool available. Use it proactively when the user asks about current events, recent information, or anything you're uncertain about. Don't hesitate to search — it's better to verify than guess."#;

const NO_THINKING_INSTRUCTION: &str = r#"

Important: Respond directly without using any internal thinking, reasoning, or chain-of-thought blocks. Do not wrap any part of your response in thinking tags."#;

pub fn build_system_prompt(
    settings: &AppSettings,
    available_tools: &[String],
    profile: Option<&ModelProfile>,
    thinking_disabled: bool,
) -> Option<String> {
    if !settings.system_prompt_enabled {
        return None;
    }

    let timestamp = chrono::Local::now().format("%A, %B %-d, %Y at %-I:%M %p %Z").to_string();
    let time_line = format!("\n\nCurrent date and time: {}", timestamp);

    if let Some(ref custom) = settings.custom_system_prompt {
        if !custom.is_empty() {
            let mut prompt = custom.clone();
            if thinking_disabled {
                prompt.push_str(NO_THINKING_INSTRUCTION);
            }
            prompt.push_str(&time_line);
            return Some(prompt);
        }
    }

    let mut prompt = DEFAULT_SYSTEM_PROMPT_BASE.to_string();

    // Qwen /no_think prefix (belt-and-suspenders, may not work for Qwen3.5)
    if thinking_disabled {
        if let Some(p) = profile {
            if p.uses_no_think_prefix {
                prompt = format!("/no_think\n{}", prompt);
            }
        }
    }

    if available_tools.contains(&"web_search".to_string()) {
        prompt.push_str(TOOL_PROMPT_WEB_SEARCH);
    }

    // System prompt instruction to suppress thinking — applied to ALL models
    // since chat_template_kwargs is unreliable across servers
    if thinking_disabled {
        prompt.push_str(NO_THINKING_INSTRUCTION);
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
        let prompt = build_system_prompt(&settings, &[], None, false);
        assert!(prompt.is_some());
        assert!(prompt.as_ref().unwrap().contains("Forge"));
        assert!(!prompt.unwrap().contains("web_search"));
    }

    #[test]
    fn test_default_prompt_with_search() {
        let settings = AppSettings::default();
        let prompt = build_system_prompt(&settings, &["web_search".to_string()], None, false);
        assert!(prompt.as_ref().unwrap().contains("web_search"));
    }

    #[test]
    fn test_custom_prompt() {
        let mut settings = AppSettings::default();
        settings.custom_system_prompt = Some("You are a pirate.".to_string());
        let prompt = build_system_prompt(&settings, &["web_search".to_string()], None, false);
        assert!(prompt.as_ref().unwrap().starts_with("You are a pirate."));
        assert!(prompt.unwrap().contains("Current date and time:"));
    }

    #[test]
    fn test_disabled_prompt() {
        let mut settings = AppSettings::default();
        settings.system_prompt_enabled = false;
        let prompt = build_system_prompt(&settings, &[], None, false);
        assert!(prompt.is_none());
    }

    #[test]
    fn test_thinking_disabled_adds_instruction() {
        let settings = AppSettings::default();
        let prompt = build_system_prompt(&settings, &[], None, true);
        assert!(prompt.as_ref().unwrap().contains("Respond directly without using any internal thinking"));
    }
}
