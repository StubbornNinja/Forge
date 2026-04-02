import { create } from 'zustand';
import { api } from '../lib/tauri';
import type { ConversationSummary } from '../lib/types';

interface ConversationState {
  conversations: ConversationSummary[];
  loading: boolean;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  updateTitle: (id: string, title: string) => void;
}

export const useConversationStore = create<ConversationState>()((set) => ({
  conversations: [],
  loading: false,

  loadConversations: async () => {
    set({ loading: true });
    try {
      const conversations = await api.listConversations(50, 0);
      set({ conversations, loading: false });
    } catch (err) {
      console.error('Failed to load conversations:', err);
      set({ loading: false });
    }
  },

  createConversation: async () => {
    const conv = await api.createConversation();
    set((state) => ({
      conversations: [
        {
          id: conv.id,
          title: conv.title,
          updated_at: conv.updated_at,
          message_count: 0,
          last_message_preview: undefined,
        },
        ...state.conversations,
      ],
    }));
    return conv.id;
  },

  deleteConversation: async (id) => {
    await api.deleteConversation(id);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    }));
  },

  renameConversation: async (id, title) => {
    await api.renameConversation(id, title);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  updateTitle: (id, title) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },
}));
