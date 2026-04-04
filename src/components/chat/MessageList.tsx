import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { StreamingIndicator } from './StreamingIndicator';
import { groupMessages } from '../../lib/groupMessages';
import { parseThinking } from '../../lib/parseThinking';

export function MessageList() {
  const { messages, isStreaming, streamingContent, streamingReasoning, activeToolCalls, toolResults } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  // Parse streaming content once for efficiency
  const streamingParsed = useMemo(
    () => parseThinking(streamingContent),
    [streamingContent]
  );

  // Track scroll position to determine if user has scrolled up
  const handleScroll = useCallback(() => {
    const el = containerRef.current?.closest('[data-scroll-container]');
    if (!el) return;
    const threshold = 100;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsNearBottom(nearBottom);
  }, []);

  // Attach scroll listener to the scroll container
  useEffect(() => {
    const el = containerRef.current?.closest('[data-scroll-container]');
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, activeToolCalls, toolResults, isNearBottom]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsNearBottom(true);
  }, []);

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
                  steps: [{ type: 'thinking' as const, content: streamingReasoning || streamingParsed.thinking || '' }],
                  allToolCalls: [],
                  thinking: streamingReasoning || streamingParsed.thinking,
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

      {/* Scroll-to-bottom button */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed-scroll-btn glass-heavy border border-[var(--glass-border-light)] rounded-full p-2 shadow-lg hover:bg-[var(--hover-bg)] transition-all animate-fadeIn"
          aria-label="Scroll to bottom"
        >
          <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
