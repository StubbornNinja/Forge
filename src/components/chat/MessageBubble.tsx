import type { Message, ToolCallEvent, ToolResultEvent } from '../../lib/types';
import type { AgentActivity } from '../../lib/groupMessages';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { FileChip } from '../shared/FileChip';
import { CopyButton } from '../shared/CopyButton';
import { AgentActivityBlock } from './AgentActivityBlock';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  /** Pre-computed visible content (thinking stripped). Provided by MessageList from grouping. */
  visibleContent?: string;
  /** Grouped agent activity from stored messages */
  agentActivity?: AgentActivity | null;
  /** Live tool calls during streaming */
  activeToolCalls?: ToolCallEvent[];
  /** Live tool results during streaming */
  activeToolResults?: ToolResultEvent[];
}

export function MessageBubble({
  message,
  isStreaming,
  visibleContent,
  agentActivity,
  activeToolCalls,
  activeToolResults,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // Use pre-computed visible content if provided, otherwise use raw content
  const displayContent = visibleContent ?? message.content;

  return (
    <div className={`group/bubble flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={isUser ? 'max-w-[85%]' : 'w-full'}>
        {/* Message content */}
        <div
          className={`relative ${
            isUser
              ? 'rounded-2xl px-4 py-3 bg-accent/20 backdrop-blur-sm border border-accent/10 text-text-primary'
              : 'text-text-primary'
          }`}
        >
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((file) => (
                <FileChip key={file.id} file={file} />
              ))}
            </div>
          )}

          {/* Agent activity (thinking + tool calls + results) */}
          {!isUser && (agentActivity || (activeToolCalls && activeToolCalls.length > 0)) && (
            <AgentActivityBlock
              activity={agentActivity}
              activeToolCalls={activeToolCalls}
              activeToolResults={activeToolResults}
              isStreaming={!!isStreaming}
              thinkingDisabled={message.thinking_disabled}
            />
          )}

          {/* Content */}
          <div className="prose-sm">
            <MarkdownRenderer content={displayContent} />
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-accent/60 animate-pulse ml-0.5" />
            )}
          </div>
        </div>

        {/* Metadata + Copy button — outside and below the bubble */}
        <div className={`mt-1 flex items-center gap-2 ${isUser ? 'justify-end px-1' : ''}`}>
          {!isStreaming && message.model && (
            <span className="text-xs text-text-muted">
              {message.model}
              {message.token_count != null && ` · ${message.token_count} tokens`}
            </span>
          )}
          <CopyButton
            getText={() => displayContent}
            className="opacity-0 group-hover/bubble:opacity-100"
          />
        </div>
      </div>
    </div>
  );
}
