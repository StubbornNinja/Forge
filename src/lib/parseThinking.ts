export interface ParsedThinking {
  thinking: string | null;
  content: string;
}

/**
 * Extracts thinking blocks from model output.
 * Supports:
 *   - Qwen3/3.5: <think>...</think>
 *   - Gemma 4: <|channel>thought...<|channel> (thinking first, then response after second tag)
 * Handles both complete blocks and in-progress streaming.
 */
export function parseThinking(raw: string): ParsedThinking {
  // --- Gemma 4 format: <|channel>thought...<|channel>response ---
  // Handle all tag variants: <|channel>, <channel|>, etc.
  const channelTagPattern = /<\|channel>|<channel\|>/g;
  if (channelTagPattern.test(raw)) {
    // Normalize all variants to a single form, then split
    const normalized = raw.replace(/<channel\|>/g, '<|channel>');
    const parts = normalized.split('<|channel>');
    // parts[0] = before first tag (usually empty)
    // parts[1] = thinking content (after "thought" marker)
    // parts[2] = response content
    if (parts.length >= 3) {
      // Complete: both tags present
      const thinkingRaw = parts[1].replace(/^thought\s*/, '').trim();
      const content = parts.slice(2).join('').trim();
      return {
        thinking: thinkingRaw || null,
        content,
      };
    }
    if (parts.length === 2) {
      // Streaming: only first tag, thinking in progress
      const thinkingRaw = parts[1].replace(/^thought\s*/, '').trim();
      return {
        thinking: thinkingRaw || null,
        content: parts[0].trim(),
      };
    }
  }

  // --- Qwen format: <think>...</think> ---
  if (!raw.includes('<think>')) {
    return { thinking: null, content: raw };
  }

  // Complete thinking block: <think>...</think>
  const completeMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  if (completeMatch) {
    const thinking = completeMatch[1].trim();
    const content = raw.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    return {
      thinking: thinking || null,
      content,
    };
  }

  // In-progress streaming: <think>... (no closing tag yet)
  const openMatch = raw.match(/<think>([\s\S]*)$/);
  if (openMatch) {
    const thinking = openMatch[1].trim();
    const content = raw.substring(0, raw.indexOf('<think>')).trim();
    return {
      thinking: thinking || null,
      content,
    };
  }

  return { thinking: null, content: raw };
}
