import { useState, useRef, useEffect } from 'react';
import { useConversationStore } from '../../stores/conversationStore';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationSummary } from '../../lib/types';

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: () => void;
}

export function ConversationItem({ conversation, isActive, onSelect }: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { renameConversation, deleteConversation } = useConversationStore();
  const { activeConversationId, setActiveConversation } = useChatStore();

  const handleRename = async () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      await renameConversation(conversation.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteConversation(conversation.id);
    if (activeConversationId === conversation.id) {
      setActiveConversation(null);
    }
    setMenuOpen(false);
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-[var(--hover-bg)] text-text-primary'
          : 'text-text-secondary hover:bg-[var(--hover-bg)] hover:text-text-primary'
      }`}
    >
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] px-2 py-0.5 rounded text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="text-[13px] font-medium truncate">{conversation.title}</div>
        )}
      </div>

      {/* "..." menu button — visible on hover */}
      {!isEditing && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className={`p-1 rounded hover:bg-[var(--hover-bg)] text-text-muted hover:text-text-primary transition-opacity ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 glass-heavy border border-[var(--glass-border-light)] rounded-lg shadow-xl py-1 min-w-[120px] z-30">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditTitle(conversation.title);
                  setIsEditing(true);
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-[var(--hover-bg)] hover:text-text-primary transition-colors"
              >
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="w-full text-left px-3 py-1.5 text-[13px] text-red-400 hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
