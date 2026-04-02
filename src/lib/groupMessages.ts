import type { Message, ToolCall } from './types';
import { parseThinking } from './parseThinking';

export interface AgentActivity {
  thinking: string | null;
  toolCalls: ToolCall[];
  toolResults: Message[];
  intermediateAssistants: Message[];
}

export interface MessageGroup {
  id: string;
  userMessage?: Message;
  agentActivity: AgentActivity | null;
  finalAssistant?: Message;
  /** The visible content of the final assistant message (thinking stripped) */
  visibleContent: string;
}

/**
 * Groups a flat message array into logical "turns" for rendering.
 *
 * A turn consists of:
 * - An optional user message
 * - Optional agent activity (thinking, tool calls, tool results, intermediate assistants)
 * - A final assistant message with the actual response
 *
 * This collapses the verbose sequence of:
 *   user -> assistant(tool_calls) -> tool(result) -> ... -> assistant(final)
 * into a single group that can be rendered compactly.
 */
export function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'user') {
      groups.push({
        id: msg.id,
        userMessage: msg,
        agentActivity: null,
        finalAssistant: undefined,
        visibleContent: '',
      });
      i++;
      continue;
    }

    if (msg.role === 'system') {
      i++;
      continue;
    }

    if (msg.role === 'assistant') {
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

      if (hasToolCalls) {
        // Intermediate assistant message with tool calls.
        // Collect all activity until we find the final assistant response.
        const { thinking } = parseThinking(msg.content);
        const activity: AgentActivity = {
          thinking,
          toolCalls: msg.tool_calls || [],
          toolResults: [],
          intermediateAssistants: [msg],
        };

        i++;
        let foundFinal = false;

        // Collect tool results and additional rounds
        while (i < messages.length) {
          const next = messages[i];

          if (next.role === 'tool') {
            activity.toolResults.push(next);
            i++;
            continue;
          }

          if (next.role === 'assistant') {
            const nextHasToolCalls = next.tool_calls && next.tool_calls.length > 0;

            if (nextHasToolCalls) {
              // Another round of tool calls
              const { thinking: roundThinking } = parseThinking(next.content);
              if (roundThinking && !activity.thinking) {
                activity.thinking = roundThinking;
              }
              activity.toolCalls.push(...(next.tool_calls || []));
              activity.intermediateAssistants.push(next);
              i++;
              continue;
            }

            // Final assistant response (no tool calls)
            const { content: visibleContent } = parseThinking(next.content);
            groups.push({
              id: next.id,
              agentActivity: activity,
              finalAssistant: next,
              visibleContent,
            });
            i++;
            foundFinal = true;
            break;
          }

          // Unexpected role — stop collecting
          break;
        }

        // If we never found a final assistant (e.g. stream was interrupted),
        // emit the last intermediate as the group so it's still visible
        if (!foundFinal) {
          const last = activity.intermediateAssistants[activity.intermediateAssistants.length - 1];
          const { content: visibleContent } = parseThinking(last.content);
          groups.push({
            id: last.id,
            agentActivity: activity,
            finalAssistant: last,
            visibleContent,
          });
        }
      } else {
        // Simple assistant response (no tool calls)
        const { thinking, content: visibleContent } = parseThinking(msg.content);
        const activity = thinking ? {
          thinking,
          toolCalls: [],
          toolResults: [],
          intermediateAssistants: [],
        } : null;

        groups.push({
          id: msg.id,
          agentActivity: activity,
          finalAssistant: msg,
          visibleContent,
        });
        i++;
      }
      continue;
    }

    // Orphan tool message (shouldn't happen, but skip gracefully)
    if (msg.role === 'tool') {
      i++;
      continue;
    }

    i++;
  }

  return groups;
}
