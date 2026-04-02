import { useEffect, useRef, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { StreamingIndicator } from './StreamingIndicator';
import { groupMessages } from '../../lib/groupMessages';
import { parseThinking } from '../../lib/parseThinking';

export function MessageList() {
  const { messages, isStreaming, streamingContent, streamingReasoning, activeToolCalls, toolResults } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  // Parse streaming content once for efficiency
  const streamingParsed = useMemo(
    () => parseThinking(streamingContent),
    [streamingContent]
  );

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, activeToolCalls, toolResults]);

  return (
    <div
      ref={containerRef}
      className="flex-1 px-4 py-6 space-y-4 max-w-3xl mx-auto w-full"
    >
      {groups.map((group) => (
        <div key={group.id} className="space-y-4">
          {/* User message */}
          {group.userMessage && (
            <MessageBubble
              message={group.userMessage}
            />
          )}

          {/* Assistant response with collapsed agent activity */}
          {group.finalAssistant && (
            <MessageBubble
              message={group.finalAssistant}
              visibleContent={group.visibleContent}
              agentActivity={group.agentActivity}
            />
          )}
        </div>
      ))}

      {/* Streaming assistant response */}
      {isStreaming && (streamingContent || streamingReasoning || activeToolCalls.length > 0) && (
        <MessageBubble
          message={{
            id: '__streaming__',
            conversation_id: '',
            role: 'assistant',
            content: streamingContent,
            created_at: new Date().toISOString(),
            sort_order: messages.length,
          }}
          visibleContent={streamingParsed.content}
          agentActivity={
            (streamingReasoning || streamingParsed.thinking)
              ? {
                  thinking: streamingReasoning || streamingParsed.thinking,
                  toolCalls: [],
                  toolResults: [],
                  intermediateAssistants: [],
                }
              : null
          }
          activeToolCalls={activeToolCalls}
          activeToolResults={toolResults}
          isStreaming
        />
      )}

      {/* Streaming indicator (typing dots) when waiting for first token */}
      {isStreaming && !streamingContent && !streamingReasoning && activeToolCalls.length === 0 && <StreamingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}
