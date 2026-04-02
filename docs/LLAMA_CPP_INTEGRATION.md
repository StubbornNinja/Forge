# llama.cpp Integration Notes

Research notes for embedding llama.cpp directly into Forge.

## Reasoning / Thinking Support

### How reasoning effort works

llama.cpp uses **Jinja chat templates** to handle reasoning per model. The `reasoning_effort` parameter must be passed via `chat_template_kwargs` in the API request body — not as a top-level parameter (top-level is silently ignored).

### API request format

```json
{
  "model": "gpt-oss-20b",
  "messages": [...],
  "chat_template_kwargs": { "reasoning_effort": "high" }
}
```

For Qwen3/3.5:
```json
{
  "chat_template_kwargs": { "enable_thinking": false }
}
```

### CLI flags

```bash
llama-server --model gpt-oss-20b.gguf \
  --jinja \
  --reasoning-format auto \
  --chat-template-kwargs '{"reasoning_effort": "high"}'
```

Key flags:
- `--jinja` — required for `chat_template_kwargs` to work
- `--reasoning-format auto` — parses reasoning output from model (alternatives: `none`, `deepseek`)
- `--chat-template-kwargs '...'` — JSON passed to the Jinja template
- `--thinking-forced-open` — forces reasoning models to always output thinking

### Reasoning output format

- GPT-OSS: reasoning appears in `choices.delta.reasoning` (streaming) / `choices.message.reasoning` (non-streaming)
- Qwen3/3.5: reasoning appears inside `<think>...</think>` tags in `content`
- `--reasoning-format auto` lets llama.cpp auto-detect which format the model uses

### Valid reasoning_effort values

- `"low"`, `"medium"`, `"high"` — for GPT-OSS models
- For Qwen: use `enable_thinking: true/false` instead

## Implications for Forge's Model Profile System

Both Qwen and GPT-OSS use `chat_template_kwargs` in llama.cpp, just with different keys. This means the `ThinkingSuppression::ReasoningEffort` variant in `model_profile.rs` could be unified with `ChatTemplateKwargs` — both would produce `chat_template_kwargs` JSON, just with different inner keys.

Current Forge approach (for LM Studio compatibility):
- Qwen → `{ "chat_template_kwargs": { "enable_thinking": bool } }`
- GPT-OSS → `{ "reasoning_effort": "low" | "medium" | "high" }` (top-level, ignored by LM Studio)

Future llama.cpp-native approach:
- Qwen → `{ "chat_template_kwargs": { "enable_thinking": bool } }`
- GPT-OSS → `{ "chat_template_kwargs": { "reasoning_effort": "low" | "medium" | "high" } }`

## Known Issues & Caveats

- Each model's Jinja template defines what params it accepts — there's no universal standard
- Some models ignore `chat_template_kwargs` entirely (e.g., MiniMax M2.5 as of early 2026)
- GPT-OSS has known Jinja template bugs: double JSON escaping in tool calls, multi-turn failures when messages contain both content and thinking fields
- `--reasoning-budget 0` is unreliable on some models
- No universal `--nothink` flag exists — models that are trained to think produce garbage if forced not to

## References

- [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [Reasoning effort experiments](https://github.com/ggml-org/llama.cpp/discussions/12339)
- [Running gpt-oss guide](https://github.com/ggml-org/llama.cpp/discussions/15396)
- [Setting reasoning effort for GPT-OSS](https://github.com/ggml-org/llama.cpp/discussions/15142)
- [Why no --nothink flag](https://github.com/ggml-org/llama.cpp/discussions/18424)
- [LM Studio reasoning_effort issue](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1250)
