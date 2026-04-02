export interface ParsedThinking {
  thinking: string | null;
  content: string;
}

/**
 * Extracts <think>...</think> blocks from model output.
 * Handles both complete blocks and in-progress streaming (open tag without close).
 */
export function parseThinking(raw: string): ParsedThinking {
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
