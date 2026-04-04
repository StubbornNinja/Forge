import type { Message, ToolCall } from './types';
import { parseThinking } from './parseThinking';

/** A single step in the agent's chain of thought / tool use. */
export type ActivityStep =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall; toolResult?: Message };

export interface AgentActivity {
  /** Ordered steps — thinking and tool calls interleaved as they occurred. */
  steps: ActivityStep[];
  /** Flat reference for summary generation. */
  allToolCalls: ToolCall[];
  /** Keep for backward compat with streaming display. */
  thinking: string | null;
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

function createActivity(): AgentActivity {
  return {
    steps: [],
    allToolCalls: [],
    thinking: null,
    intermediateAssistants: [],
  };
}

function addThinking(activity: AgentActivity, thinking: string | null) {
  if (!thinking) return;
  activity.steps.push({ type: 'thinking', content: thinking });
  // Also accumulate flat thinking for backward compat
  if (activity.thinking) {
    activity.thinking += '\n\n' + thinking;
  } else {
    activity.thinking = thinking;
  }
}

function addToolCalls(activity: AgentActivity, toolCalls: ToolCall[], toolResults: Message[]) {
  for (const tc of toolCalls) {
    const result = toolResults.find(r => r.tool_call_id === tc.id);
    activity.steps.push({ type: 'tool_call', toolCall: tc, toolResult: result });
    activity.allToolCalls.push(tc);
  }
}

/**
 * Groups a flat message array into logical "turns" for rendering.
 *
 * A turn consists of:
 * - An optional user message
 * - Optional agent activity (thinking and tool calls interleaved in order)
 * - A final assistant message with the actual response
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
        const activity = createActivity();
        const { thinking } = parseThinking(msg.content);
        addThinking(activity, thinking);
        activity.intermediateAssistants.push(msg);

        // Collect tool results for this round
        i++;
        const roundResults: Message[] = [];
        while (i < messages.length && messages[i].role === 'tool') {
          roundResults.push(messages[i]);
          i++;
        }
        addToolCalls(activity, msg.tool_calls || [], roundResults);

        let foundFinal = false;

        // Continue collecting additional rounds
        while (i < messages.length) {
          const next = messages[i];

          if (next.role === 'assistant') {
            const nextHasToolCalls = next.tool_calls && next.tool_calls.length > 0;

            if (nextHasToolCalls) {
              // Another round: thinking → tool calls → results
              const { thinking: roundThinking } = parseThinking(next.content);
              addThinking(activity, roundThinking);
              activity.intermediateAssistants.push(next);

              i++;
              const nextResults: Message[] = [];
              while (i < messages.length && messages[i].role === 'tool') {
                nextResults.push(messages[i]);
                i++;
              }
              addToolCalls(activity, next.tool_calls || [], nextResults);
              continue;
            }

            // Final assistant response (no tool calls)
            const { thinking: finalThinking, content: visibleContent } = parseThinking(next.content);
            addThinking(activity, finalThinking);

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
        const activity = thinking ? (() => {
          const a = createActivity();
          addThinking(a, thinking);
          return a;
        })() : null;

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
