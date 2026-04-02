import { useEffect, useMemo } from 'react';
import { useConversationStore } from '../../stores/conversationStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { ConversationItem } from './ConversationItem';
import { SearchBar } from './SearchBar';
import { groupConversationsByTime } from '../../lib/groupConversations';

export function Sidebar() {
  const { conversations, loading, loadConversations } =
    useConversationStore();
  const { activeConversationId, setActiveConversation } = useChatStore();
  const { toggleSettings } = useUIStore();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const groups = useMemo(() => groupConversationsByTime(conversations), [conversations]);

  const handleSelect = (id: string) => {
    setActiveConversation(id);
  };

  return (
    <div className="h-full flex flex-col p-2">
      {/* Single floating glass card with search, conversations, and settings */}
      <div className="flex-1 min-h-0 glass rounded-xl overflow-hidden flex flex-col">
        {/* Search — inside the card */}
        <div className="flex-shrink-0 px-2 pt-2 pb-1">
          <SearchBar />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-1.5">
          {loading && conversations.length === 0 ? (
            <div className="text-center text-text-muted py-8 text-sm">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center text-text-muted py-8 text-sm">
              No conversations yet.
              <br />
              Start a new chat!
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="text-[11px] font-medium uppercase text-text-muted px-3 pt-3 pb-1">
                  {group.label}
                </div>
                {group.conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeConversationId}
                    onSelect={() => handleSelect(conv.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Settings — inside the card at the bottom */}
        <div className="flex-shrink-0 border-t border-[var(--glass-border)] px-1.5 py-1">
          <button
            onClick={toggleSettings}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[var(--hover-bg)] text-text-secondary hover:text-text-primary transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
