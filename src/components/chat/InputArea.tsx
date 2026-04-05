import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useConversationStore } from '../../stores/conversationStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useModelStore } from '../../stores/modelStore';
import { api, events } from '../../lib/tauri';
import type { Message, StructuredError, ModelInfo } from '../../lib/types';
import { formatQuant } from '../../lib/format';

export function InputArea() {
  const [input, setInput] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeConversationId,
    isStreaming,
    addMessage,
    setStreaming,
    appendStreamingContent,
    updateStreamingContent,
    appendStreamingReasoning,
    finalizeStream,
    finalizeStreamWithMessages,
    setError,
    addToolCall,
    addToolResult,
    prefillInput,
    setPrefillInput,
  } = useChatStore();
  const updateTitle = useConversationStore((s) => s.updateTitle);
  const { settings, updateSettings } = useSettingsStore();

  // Parse Tauri IPC errors into something displayable
  const handleError = (err: unknown) => {
    if (typeof err === 'object' && err !== null && 'category' in err) {
      setError(err as StructuredError);
    } else if (typeof err === 'string') {
      setError(err);
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      setError(JSON.stringify(err));
    }
  };
  const connectionStatus = useConnectionStore((s) => s.status);
  const [serverModels, setServerModels] = useState<ModelInfo[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const inferenceMode = settings?.inference_mode || 'external';
  const installedModels = useModelStore((s) => s.installed);
  const loadInstalled = useModelStore((s) => s.loadInstalled);

  // Fetch models based on mode
  useEffect(() => {
    if (inferenceMode === 'local') {
      loadInstalled();
    } else if (connectionStatus === 'connected') {
      api.listModels().then(setServerModels).catch(() => setServerModels([]));
    }
  }, [connectionStatus, inferenceMode, loadInstalled]);

  // Close model picker on outside click
  useEffect(() => {
    if (!modelPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [modelPickerOpen]);

  // Consume prefill input from suggestion chips
  useEffect(() => {
    if (prefillInput) {
      setInput(prefillInput);
      setPrefillInput(null);
      // Focus and resize
      setTimeout(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
      }, 0);
    }
  }, [prefillInput, setPrefillInput]);

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
        // Always reload all messages from DB for consistency
        // This ensures thinking_disabled flags, normalized content, etc. are correct
        const { activeConversationId: convId } = useChatStore.getState();
        if (convId) {
          api.getMessages(convId).then((allMessages) => {
            finalizeStreamWithMessages(allMessages);
          }).catch(() => {
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
      events.onStreamContentReset(() => {
        updateStreamingContent('');
      })
    );

    unlisteners.push(
      events.onStreamError((err: string | StructuredError) => {
        if (typeof err === 'object' && err !== null && 'category' in err) {
          setError(err as StructuredError);
        } else {
          setError(String(err));
        }
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
  }, [appendStreamingContent, updateStreamingContent, appendStreamingReasoning, finalizeStream, finalizeStreamWithMessages, setError, addToolCall, addToolResult, updateTitle]);

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
        handleError(err);
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
      await api.sendMessage(conversationId, content, undefined, !thinkingEnabled);
    } catch (err) {
      handleError(err);
    }
  }, [input, activeConversationId, isStreaming, thinkingEnabled, addMessage, setStreaming, setError, createConversation, setActiveConversation]);

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

  // Short display name: "google/gemma-4-26b-a4b" → "gemma-4-26b-a4b"
  const shortModelName = (id: string) => id.split('/').pop() || id;

  // Build unified model list and current selection based on mode
  const models = inferenceMode === 'local'
    ? installedModels.map((m) => ({ id: m.id, label: `${m.filename} (${formatQuant(m.quant)})` }))
    : serverModels.map((m) => ({ id: m.id, label: shortModelName(m.id) }));
  const currentModel = inferenceMode === 'local' ? settings?.local_model_id : settings?.default_model;

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
      <div className="max-w-4xl mx-auto glass rounded-2xl border border-[var(--glass-border)]">
        {/* Textarea */}
        <div className="px-4 pt-3 pb-2">
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
            className="w-full resize-none bg-transparent text-text-primary placeholder-text-muted px-0 py-0 focus:outline-none disabled:opacity-50 text-sm leading-relaxed"
            style={{ maxHeight: '200px' }}
          />
        </div>

        {/* Toolbar row — thinking + model on left, send on right */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-1">
            {/* Thinking toggle */}
            {!isStreaming && (
              <button
                onClick={() => setThinkingEnabled(!thinkingEnabled)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-xs ${
                  thinkingEnabled
                    ? 'text-accent hover:bg-accent/10'
                    : 'text-text-muted hover:bg-[var(--hover-bg)]'
                }`}
                title={thinkingEnabled ? 'Thinking mode: ON' : 'Thinking mode: OFF'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                <span>{thinkingEnabled ? 'Thinking' : 'No thinking'}</span>
              </button>
            )}

            {/* Model picker */}
            {!isStreaming && (
              <div className="relative" ref={modelPickerRef}>
                <button
                  onClick={() => setModelPickerOpen(!modelPickerOpen)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--hover-bg)] transition-colors text-xs text-text-muted max-w-[180px]"
                  title={currentModel || 'Select model'}
                >
                  <span className="truncate">{currentModel ? (models.find(m => m.id === currentModel)?.label || shortModelName(currentModel)) : 'Model'}</span>
                  <svg className={`w-2.5 h-2.5 flex-shrink-0 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {modelPickerOpen && (
                  <div className="absolute bottom-full left-0 mb-2 glass-heavy border border-[var(--glass-border-light)] rounded-lg shadow-xl py-1 min-w-[200px] max-w-[300px] max-h-[240px] overflow-y-auto z-30 animate-slideDown">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (inferenceMode === 'local') {
                            updateSettings({ local_model_id: m.id });
                          } else {
                            updateSettings({ default_model: m.id });
                          }
                          setModelPickerOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors truncate ${
                          m.id === currentModel
                            ? 'text-accent bg-accent/10'
                            : 'text-text-secondary hover:bg-[var(--hover-bg)] hover:text-text-primary'
                        }`}
                        title={m.id}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex-shrink-0 p-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white transition-colors"
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
              className="flex-shrink-0 p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send message"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
