import { useState, useMemo } from 'react';
import type { Message, ToolCall, ToolCallEvent, ToolResultEvent } from '../../lib/types';
import type { AgentActivity } from '../../lib/groupMessages';
import { useSettingsStore } from '../../stores/settingsStore';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { CopyButton } from '../shared/CopyButton';

const TOOL_LABELS: Record<string, string> = {
  web_search: 'searched the web',
  read_file: 'read a file',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

interface AgentActivityBlockProps {
  /** Stored activity from message grouping (when viewing a conversation) */
  activity?: AgentActivity | null;
  /** Live tool calls during streaming */
  activeToolCalls?: ToolCallEvent[];
  /** Live tool results during streaming */
  activeToolResults?: ToolResultEvent[];
  isStreaming: boolean;
  /** Whether this message was sent with thinking disabled */
  thinkingDisabled?: boolean;
}

export function AgentActivityBlock({
  activity,
  activeToolCalls,
  activeToolResults,
  isStreaming,
  thinkingDisabled,
}: AgentActivityBlockProps) {
  // Collapsed by default — user can expand if they want to watch
  const [isExpanded, setIsExpanded] = useState(false);
  // Advanced setting: show thinking even in non-thinking chats (for debugging)
  const showThinkingOverride = useSettingsStore((s) => s.settings?.show_thinking_override);

  // Hide thinking steps if this message was sent with thinking off (unless override is on)
  const hideThinking = thinkingDisabled && !showThinkingOverride;

  const visibleSteps = activity?.steps.filter(
    (step) => !(hideThinking && step.type === 'thinking')
  ) ?? [];
  const hasToolCalls = activity?.allToolCalls.length ?? 0;

  const hasStoredActivity = visibleSteps.length > 0;
  const hasLiveActivity = activeToolCalls && activeToolCalls.length > 0;

  if (!hasStoredActivity && !hasLiveActivity) return null;

  // Build summary text
  const summaryParts: string[] = [];
  if (!hideThinking && activity?.thinking) summaryParts.push('Thought');
  if (hasToolCalls) {
    const uniqueTools = [...new Set(activity!.allToolCalls.map(tc => toolLabel(tc.function.name)))];
    summaryParts.push(...uniqueTools);
  }
  if (hasLiveActivity && !hasStoredActivity) {
    const liveTools = [...new Set(activeToolCalls!.map(tc => toolLabel(tc.tool_name)))];
    if (isStreaming && !activity?.thinking) summaryParts.push('Thinking');
    summaryParts.push(...liveTools);
  }

  const summary = summaryParts.length > 0
    ? summaryParts.join(' + ')
    : 'Agent activity';

  return (
    <div className="mb-2">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors py-1 px-2 rounded-lg hover:bg-surface-tertiary/50"
      >
        {isStreaming && hasLiveActivity ? (
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
          </span>
        ) : (
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        )}
        <span>{isStreaming && hasLiveActivity ? `${summary}...` : summary}</span>
      </button>

      {/* Expanded content — steps rendered in order */}
      {isExpanded && (
        <div className="mt-1 ml-2 pl-3 border-l-2 border-accent/30 space-y-3">
          {/* Stored steps — interleaved thinking and tool calls */}
          {visibleSteps.map((step, idx) => {
            if (step.type === 'thinking') {
              return <ThinkingSection key={`think-${idx}`} content={step.content} />;
            }
            if (step.type === 'tool_call') {
              return (
                <StoredToolCallRow
                  key={step.toolCall.id || `tc-${idx}`}
                  toolCall={step.toolCall}
                  result={step.toolResult}
                />
              );
            }
            return null;
          })}

          {/* Live tool calls during streaming */}
          {hasLiveActivity && activeToolCalls!.map(call => (
            <LiveToolCallRow
              key={call.call_id}
              call={call}
              result={activeToolResults?.find(r => r.call_id === call.call_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingSection({ content }: { content: string }) {
  return (
    <div className="relative group/thinking">
      <div className="text-text-secondary text-sm opacity-80">
        <MarkdownRenderer content={content} />
      </div>
      <CopyButton
        getText={() => content}
        className="absolute top-0 right-0 opacity-0 group-hover/thinking:opacity-100"
      />
    </div>
  );
}

function StoredToolCallRow({ toolCall, result }: { toolCall: ToolCall; result?: Message }) {
  const [expanded, setExpanded] = useState(false);

  const parsedArgs = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2);
    } catch {
      return toolCall.function.arguments;
    }
  }, [toolCall.function.arguments]);

  const isError = result?.content.startsWith('Error');

  return (
    <div className="text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors"
      >
        {isError ? (
          <span className="text-red-400">✕</span>
        ) : result ? (
          <span className="text-green-400">✓</span>
        ) : (
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        <span className="font-mono font-medium text-accent">
          {toolCall.function.name}
        </span>
        {isError && <span className="text-red-400">— error</span>}
      </button>

      {expanded && (
        <div className="mt-1 ml-4 space-y-1">
          <div className="bg-surface-primary rounded p-2 border border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Arguments</div>
            <pre className="text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto">
              {parsedArgs}
            </pre>
          </div>
          {result && (
            <div className="bg-surface-primary rounded p-2 border border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Result</div>
              <div className="text-text-secondary max-h-40 overflow-y-auto">
                <MarkdownRenderer content={result.content} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveToolCallRow({ call, result }: { call: ToolCallEvent; result?: ToolResultEvent }) {
  const label = TOOL_LABELS[call.tool_name] || call.tool_name;
  const query = call.arguments?.query as string | undefined;
  const isDone = !!result;
  const isError = result?.is_error;

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
      {!isDone ? (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
      ) : isError ? (
        <span className="text-red-400">✕</span>
      ) : (
        <span className="text-green-400">✓</span>
      )}
      <span>
        {label}
        {query && <span className="text-text-muted">: &ldquo;{query}&rdquo;</span>}
        {isDone && !isError && <span className="text-text-muted"> — done</span>}
        {isError && <span className="text-red-400"> — error</span>}
      </span>
    </div>
  );
}
