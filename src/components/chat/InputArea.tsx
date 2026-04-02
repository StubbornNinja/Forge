import { useState, useRef, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useConversationStore } from '../../stores/conversationStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { api, events } from '../../lib/tauri';
import type { Message } from '../../lib/types';
import { useEffect } from 'react';

export function InputArea() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeConversationId,
    isStreaming,
    addMessage,
    setStreaming,
    appendStreamingContent,
    appendStreamingReasoning,
    finalizeStream,
    finalizeStreamWithMessages,
    setError,
    addToolCall,
    addToolResult,
  } = useChatStore();
  const updateTitle = useConversationStore((s) => s.updateTitle);
  const settings = useSettingsStore((s) => s.settings);

  // Subscribe to stream events
  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];

    unlisteners.push(
      events.onStreamDelta((delta) => {
        if (delta.content) {
          appendStreamingContent(delta.content);
        }
      })
    );

    unlisteners.push(
      events.onStreamEnd((msg: Message) => {
        // If tool calls occurred, reload all messages from DB to get intermediates
        const { activeToolCalls: currentToolCalls, activeConversationId: convId } = useChatStore.getState();
        if (currentToolCalls.length > 0 && convId) {
          api.getMessages(convId).then((allMessages) => {
            finalizeStreamWithMessages(allMessages);
          }).catch(() => {
            // Fallback: just append the final message
            finalizeStream(msg);
          });
        } else {
          finalizeStream(msg);
        }
      })
    );

    unlisteners.push(
      events.onStreamReasoningDelta((content: string) => {
        appendStreamingReasoning(content);
      })
    );

    unlisteners.push(
      events.onStreamError((err: string) => {
        setError(err);
      })
    );

    unlisteners.push(
      events.onToolCall((call) => {
        addToolCall(call);
      })
    );

    unlisteners.push(
      events.onToolResult((result) => {
        addToolResult(result);
      })
    );

    unlisteners.push(
      events.onConversationTitleUpdated(({ id, title }) => {
        updateTitle(id, title);
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, [appendStreamingContent, appendStreamingReasoning, finalizeStream, finalizeStreamWithMessages, setError, addToolCall, addToolResult, updateTitle]);

  const createConversation = useConversationStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const content = input.trim();
    setInput('');

    let conversationId = activeConversationId;

    // Draft mode: create the conversation first
    if (!conversationId) {
      try {
        conversationId = await createConversation();
        setActiveConversation(conversationId);
      } catch (err) {
        setError(String(err));
        return;
      }
    }

    // Optimistically add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    addMessage(userMsg);
    setStreaming(true);

    try {
      await api.sendMessage(conversationId, content);
    } catch (err) {
      setError(String(err));
    }
  }, [input, activeConversationId, isStreaming, addMessage, setStreaming, setError, createConversation, setActiveConversation]);

  const handleStop = async () => {
    try {
      await api.stopGeneration();
      setStreaming(false);
    } catch (err) {
      console.error('Failed to stop generation:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const shortcut = settings?.send_shortcut || 'Enter';

    if (shortcut === 'Enter' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (shortcut === 'Ctrl+Enter' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div className="flex-shrink-0 px-4 pb-3 pt-2">
      <div className="flex items-center gap-2 max-w-4xl mx-auto glass rounded-2xl px-4 py-2.5 border border-[var(--glass-border)]">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming ? 'Generating...' : 'Type a message...'
            }
            disabled={isStreaming}
            rows={1}
            className="w-full resize-none bg-transparent text-text-primary placeholder-text-muted rounded-lg px-0 py-0 focus:outline-none disabled:opacity-50 text-sm leading-relaxed"
            style={{ maxHeight: '200px' }}
          />
        </div>

        {isStreaming ? (
          <button
            onClick={handleStop}
            className="flex-shrink-0 p-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white transition-colors"
            title="Stop generation"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex-shrink-0 p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors shadow-lg shadow-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="text-center mt-1">
        <span className="text-xs text-text-muted">
          {settings?.send_shortcut === 'Ctrl+Enter'
            ? 'Ctrl+Enter to send'
            : 'Enter to send, Shift+Enter for new line'}
        </span>
      </div>
    </div>
  );
}
