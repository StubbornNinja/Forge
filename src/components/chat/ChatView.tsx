import { useEffect, useState, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useConversationStore } from '../../stores/conversationStore';
import { api } from '../../lib/tauri';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { MessageSkeleton } from '../shared/Skeleton';
import { ErrorBanner } from '../shared/ErrorBanner';
import { WelcomeView } from './WelcomeView';

export function ChatView() {
  const { activeConversationId, isDraft, setMessages, messagesLoading, error, enterDraft, setPrefillInput } = useChatStore();
  const { conversations, renameConversation, deleteConversation } = useConversationStore();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      api.getMessages(activeConversationId).then(setMessages).catch(console.error);
    }
  }, [activeConversationId, setMessages]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleRename = async () => {
    if (activeConversationId && renameValue.trim()) {
      await renameConversation(activeConversationId, renameValue.trim());
    }
    setIsRenaming(false);
    setDropdownOpen(false);
  };

  const handleDelete = async () => {
    if (activeConversationId) {
      await deleteConversation(activeConversationId);
      setActiveConversation(null);
    }
    setDropdownOpen(false);
  };

  return (
    <div className="relative h-full flex flex-col">
      {/* Chat title row — no divider, messages fade in below */}
      {activeConversation && (
        <div className="flex-shrink-0 px-4 py-2">
          <div className="relative inline-block" ref={dropdownRef}>
            {isRenaming ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') { setIsRenaming(false); setDropdownOpen(false); }
                }}
                className="bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[var(--hover-bg)] transition-colors text-sm font-medium text-text-primary"
              >
                {activeConversation.title}
                <svg className={`w-3 h-3 text-text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            {/* Dropdown menu */}
            {dropdownOpen && !isRenaming && (
              <div className="absolute top-full left-0 mt-1 glass-heavy border border-[var(--glass-border-light)] rounded-lg shadow-xl py-1 min-w-[140px] z-20">
                <button
                  onClick={() => {
                    setRenameValue(activeConversation.title);
                    setIsRenaming(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-[var(--hover-bg)] hover:text-text-primary transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && <ErrorBanner error={error} />}

      {/* Messages, draft, or welcome state */}
      {activeConversationId ? (
        <>
          <div
            className="flex-1 overflow-y-auto relative"
            data-scroll-container
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 24px, black)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 24px, black)',
            }}
          >
            {messagesLoading ? (
              <div className="px-4 py-6 space-y-4 max-w-3xl mx-auto w-full">
                <MessageSkeleton role="user" />
                <MessageSkeleton role="assistant" />
                <MessageSkeleton role="user" />
              </div>
            ) : (
              <MessageList />
            )}
          </div>
          <InputArea />
        </>
      ) : isDraft ? (
        <>
          <div className="flex-1" />
          <InputArea />
        </>
      ) : (
        <WelcomeView onSuggestion={(text) => {
          enterDraft();
          setPrefillInput(text);
        }} />
      )}
    </div>
  );
}
