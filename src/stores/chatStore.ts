import { create } from 'zustand';
import type { Message, ToolCallEvent, ToolResultEvent, StructuredError } from '../lib/types';

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  activeConversationId: string | null;
  isDraft: boolean;
  messagesLoading: boolean;
  error: StructuredError | null;
  activeToolCalls: ToolCallEvent[];
  toolResults: ToolResultEvent[];
  prefillInput: string | null;

  addMessage: (msg: Message) => void;
  updateStreamingContent: (content: string) => void;
  appendStreamingContent: (delta: string) => void;
  appendStreamingReasoning: (delta: string) => void;
  finalizeStream: (fullMessage: Message) => void;
  /** Finalize stream by replacing the entire message list (used after tool calls to include intermediates from DB) */
  finalizeStreamWithMessages: (messages: Message[]) => void;
  setStreaming: (streaming: boolean) => void;
  setMessages: (messages: Message[]) => void;
  setActiveConversation: (id: string | null) => void;
  enterDraft: () => void;
  setError: (error: StructuredError | string | null) => void;
  clearError: () => void;
  addToolCall: (call: ToolCallEvent) => void;
  addToolResult: (result: ToolResultEvent) => void;
  setPrefillInput: (text: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  activeConversationId: null,
  isDraft: true,
  messagesLoading: false,
  error: null,
  activeToolCalls: [],
  toolResults: [],
  prefillInput: null,

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateStreamingContent: (content) =>
    set({ streamingContent: content }),

  appendStreamingContent: (delta) =>
    set((state) => ({ streamingContent: state.streamingContent + delta })),

  appendStreamingReasoning: (delta) =>
    set((state) => ({ streamingReasoning: state.streamingReasoning + delta })),

  finalizeStream: (fullMessage) =>
    set((state) => ({
      messages: [...state.messages, fullMessage],
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      activeToolCalls: [],
      toolResults: [],
    })),

  finalizeStreamWithMessages: (messages) =>
    set({
      messages,
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      activeToolCalls: [],
      toolResults: [],
    }),

  setStreaming: (streaming) =>
    set({ isStreaming: streaming, ...(streaming ? { streamingContent: '', streamingReasoning: '', error: null, activeToolCalls: [], toolResults: [] } : {}) }),

  setMessages: (messages) =>
    set({ messages, messagesLoading: false }),

  setActiveConversation: (id) =>
    set({ activeConversationId: id, isDraft: id === null, messages: [], messagesLoading: id !== null, streamingContent: '', streamingReasoning: '', error: null, activeToolCalls: [], toolResults: [] }),

  enterDraft: () =>
    set({ isDraft: true, activeConversationId: null, messages: [], streamingContent: '', streamingReasoning: '', error: null, activeToolCalls: [], toolResults: [] }),

  setError: (error) => {
    if (error === null) {
      set({ error: null, isStreaming: false });
    } else if (typeof error === 'string') {
      set({
        error: { category: 'general', title: 'Error', description: error },
        isStreaming: false,
      });
    } else {
      set({ error, isStreaming: false });
    }
  },

  clearError: () =>
    set({ error: null }),

  addToolCall: (call) =>
    set((state) => ({ activeToolCalls: [...state.activeToolCalls, call] })),

  addToolResult: (result) =>
    set((state) => ({ toolResults: [...state.toolResults, result] })),

  setPrefillInput: (text) =>
    set({ prefillInput: text }),
}));
