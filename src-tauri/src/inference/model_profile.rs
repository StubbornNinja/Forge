/// Data-driven model profile registry.
///
/// Each profile describes how a model family handles reasoning/thinking
/// and what parameters control it. Adding support for a new model is just
/// a matter of adding an entry to `PROFILES`.
/// How the model exposes chain-of-thought reasoning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReasoningStyle {
    /// Model does not produce reasoning output.
    None,
    /// Reasoning appears inside `<think>…</think>` tags in the `content` field.
    InlineThinkTags,
    /// Reasoning appears in a separate `reasoning_content` field on deltas.
    ReasoningContentField,
}

/// How to suppress or control thinking depth.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThinkingSuppression {
    /// No control available (always thinks, or never thinks).
    None,
    /// Qwen3-style: `chat_template_kwargs.enable_thinking` (bool).
    ChatTemplateKwargs,
    /// GPT-OSS / Harmony-style: `reasoning_effort` param ("low"/"medium"/"high").
    ReasoningEffort,
}

#[derive(Debug, Clone)]
pub struct ModelProfile {
    pub name: &'static str,
    pub patterns: &'static [&'static str],
    pub reasoning_style: ReasoningStyle,
    pub thinking_suppression: ThinkingSuppression,
    pub supports_tool_use: bool,
    /// Whether this model understands the `/no_think` system prompt prefix (Qwen-specific).
    pub uses_no_think_prefix: bool,
}

/// Built-in profile registry. Order matters — first match wins.
static PROFILES: &[ModelProfile] = &[
    ModelProfile {
        name: "qwen3",
        // Match "qwen3-" but NOT "qwen3.5"
        patterns: &["qwen3-", "qwen3_", "/qwen3-"],
        reasoning_style: ReasoningStyle::InlineThinkTags,
        thinking_suppression: ThinkingSuppression::ChatTemplateKwargs,
        supports_tool_use: true,
        uses_no_think_prefix: true,
    },
    ModelProfile {
        name: "qwen3.5",
        patterns: &["qwen3.5", "qwen-3.5"],
        reasoning_style: ReasoningStyle::InlineThinkTags,
        thinking_suppression: ThinkingSuppression::ChatTemplateKwargs,
        supports_tool_use: true,
        uses_no_think_prefix: true,
    },
    ModelProfile {
        name: "gemma4",
        patterns: &["gemma-4", "gemma4"],
        reasoning_style: ReasoningStyle::InlineThinkTags,
        thinking_suppression: ThinkingSuppression::ChatTemplateKwargs,
        supports_tool_use: true,
        uses_no_think_prefix: false,
    },
    // Legacy: GPT-OSS / Harmony — kept for backward compatibility
    ModelProfile {
        name: "gpt-oss",
        patterns: &["gpt-oss", "harmony"],
        reasoning_style: ReasoningStyle::ReasoningContentField,
        thinking_suppression: ThinkingSuppression::ReasoningEffort,
        supports_tool_use: false,
        uses_no_think_prefix: false,
    },
];

static DEFAULT_PROFILE: ModelProfile = ModelProfile {
    name: "default",
    patterns: &[],
    reasoning_style: ReasoningStyle::None,
    thinking_suppression: ThinkingSuppression::None,
    supports_tool_use: true,
    uses_no_think_prefix: false,
};

/// Detect the model profile from a model name string (case-insensitive).
pub fn detect_profile(model_name: &str) -> &'static ModelProfile {
    let lower = model_name.to_lowercase();
    for profile in PROFILES {
        for pattern in profile.patterns {
            if lower.contains(pattern) {
                return profile;
            }
        }
    }
    &DEFAULT_PROFILE
}

/// Build the `extra` JSON params for a ChatRequest based on the model profile
/// and the user's reasoning effort setting.
///
/// Returns `None` if no extra params are needed.
pub fn build_extra_params(
    profile: &ModelProfile,
    reasoning_effort: Option<&str>,
) -> Option<serde_json::Value> {
    match profile.thinking_suppression {
        ThinkingSuppression::ReasoningEffort => {
            // GPT-OSS style: pass reasoning_effort directly
            let effort = reasoning_effort.unwrap_or("medium");
            Some(serde_json::json!({ "reasoning_effort": effort }))
        }
        ThinkingSuppression::ChatTemplateKwargs => {
            // Qwen3/3.5/Gemma4: thinking is binary on/off
            let enable = !matches!(reasoning_effort, Some("off"));
            Some(serde_json::json!({
                "chat_template_kwargs": { "enable_thinking": enable }
            }))
        }
        ThinkingSuppression::None => {
            // No suppression mechanism — ignore effort setting
            None
        }
    }
}


/// Whether a model profile should use `/no_think` prefix in the system prompt.
/// Belt-and-suspenders: all InlineThinkTags models get this prefix because local
/// inference servers (LM Studio, llama.cpp) may not support `chat_template_kwargs`.
pub fn needs_no_think_prefix(profile: &ModelProfile) -> bool {
    profile.uses_no_think_prefix
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_qwen3() {
        let p = detect_profile("unsloth/Qwen3-0.6B-GGUF");
        assert_eq!(p.name, "qwen3");
        assert_eq!(p.reasoning_style, ReasoningStyle::InlineThinkTags);
        assert_eq!(p.thinking_suppression, ThinkingSuppression::ChatTemplateKwargs);
    }

    #[test]
    fn test_detect_qwen3_5() {
        let p = detect_profile("Qwen3.5-32B-Instruct");
        assert_eq!(p.name, "qwen3.5");
        assert_eq!(p.reasoning_style, ReasoningStyle::InlineThinkTags);
        assert_eq!(p.thinking_suppression, ThinkingSuppression::ChatTemplateKwargs);
    }

    #[test]
    fn test_detect_gpt_oss() {
        let p = detect_profile("gpt-oss-20b-preview");
        assert_eq!(p.name, "gpt-oss");
        assert_eq!(p.reasoning_style, ReasoningStyle::ReasoningContentField);
        assert_eq!(p.thinking_suppression, ThinkingSuppression::ReasoningEffort);
    }

    #[test]
    fn test_detect_harmony() {
        let p = detect_profile("harmony-7b");
        assert_eq!(p.name, "gpt-oss");
    }

    #[test]
    fn test_detect_unknown() {
        let p = detect_profile("llama-3.1-70b");
        assert_eq!(p.name, "default");
        assert_eq!(p.reasoning_style, ReasoningStyle::None);
    }

    #[test]
    fn test_case_insensitive() {
        let p = detect_profile("QWEN3-0.6B");
        assert_eq!(p.name, "qwen3");
    }

    #[test]
    fn test_build_extra_gpt_oss_default() {
        let p = detect_profile("gpt-oss-20b");
        let extra = build_extra_params(p, None);
        assert_eq!(extra, Some(serde_json::json!({ "reasoning_effort": "medium" })));
    }

    #[test]
    fn test_build_extra_gpt_oss_high() {
        let p = detect_profile("gpt-oss-20b");
        let extra = build_extra_params(p, Some("high"));
        assert_eq!(extra, Some(serde_json::json!({ "reasoning_effort": "high" })));
    }

    #[test]
    fn test_build_extra_qwen3_off() {
        let p = detect_profile("qwen3-8b");
        let extra = build_extra_params(p, Some("off"));
        assert_eq!(extra, Some(serde_json::json!({
            "chat_template_kwargs": { "enable_thinking": false }
        })));
    }

    #[test]
    fn test_build_extra_qwen3_high() {
        let p = detect_profile("qwen3-8b");
        let extra = build_extra_params(p, Some("high"));
        assert_eq!(extra, Some(serde_json::json!({
            "chat_template_kwargs": { "enable_thinking": true }
        })));
    }

    #[test]
    fn test_build_extra_default_model() {
        let p = detect_profile("llama-3");
        let extra = build_extra_params(p, Some("high"));
        assert_eq!(extra, None);
    }


    #[test]
    fn test_detect_gemma4() {
        let p = detect_profile("gemma-4-27b-it");
        assert_eq!(p.name, "gemma4");
        assert_eq!(p.reasoning_style, ReasoningStyle::InlineThinkTags);
        assert_eq!(p.thinking_suppression, ThinkingSuppression::ChatTemplateKwargs);
        assert!(p.supports_tool_use);
    }

    #[test]
    fn test_detect_gemma4_variant() {
        let p = detect_profile("google/gemma4-9b");
        assert_eq!(p.name, "gemma4");
    }

    #[test]
    fn test_build_extra_gemma4_off() {
        let p = detect_profile("gemma-4-27b");
        let extra = build_extra_params(p, Some("off"));
        assert_eq!(extra, Some(serde_json::json!({
            "chat_template_kwargs": { "enable_thinking": false }
        })));
    }

    #[test]
    fn test_needs_no_think_prefix() {
        // All InlineThinkTags models get /no_think as belt-and-suspenders
        let p = detect_profile("qwen3.5-32b");
        assert!(needs_no_think_prefix(p));

        let p = detect_profile("qwen3-8b");
        assert!(needs_no_think_prefix(p));

        // Gemma 4 does NOT use /no_think prefix (Qwen-only convention)
        let p = detect_profile("gemma-4-27b");
        assert!(!needs_no_think_prefix(p));

        // GPT-OSS uses reasoning_content field, not think tags
        let p = detect_profile("gpt-oss-20b");
        assert!(!needs_no_think_prefix(p));

        // Default model doesn't think
        let p = detect_profile("llama-3");
        assert!(!needs_no_think_prefix(p));
    }
}
