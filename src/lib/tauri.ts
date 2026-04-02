import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Conversation,
  ConversationSummary,
  Message,
  StreamDelta,
  ToolCallEvent,
  ToolResultEvent,
  AppSettings,
  ModelInfo,
  SearchResult,
  FileMetadata,
} from './types';

// Invoke wrappers — one per IPC command
export const api = {
  sendMessage: (conversationId: string, content: string, attachments?: string[]) =>
    invoke<void>('send_message', { conversationId, content, attachments }),

  stopGeneration: () =>
    invoke<void>('stop_generation'),

  createConversation: () =>
    invoke<Conversation>('create_conversation'),

  listConversations: (limit?: number, offset?: number) =>
    invoke<ConversationSummary[]>('list_conversations', { limit, offset }),

  getMessages: (conversationId: string) =>
    invoke<Message[]>('get_messages', { conversationId }),

  deleteConversation: (id: string) =>
    invoke<void>('delete_conversation', { id }),

  renameConversation: (id: string, title: string) =>
    invoke<void>('rename_conversation', { id, title }),

  searchConversations: (query: string) =>
    invoke<SearchResult[]>('search_conversations', { query }),

  getSettings: () =>
    invoke<AppSettings>('get_settings'),

  updateSettings: (settings: Partial<AppSettings>) =>
    invoke<void>('update_settings', { settings }),

  listModels: () =>
    invoke<ModelInfo[]>('list_models'),

  healthCheck: () =>
    invoke<boolean>('health_check'),

  uploadFile: (path: string) =>
    invoke<FileMetadata>('upload_file', { path }),
};

// Event listeners for streaming
export const events = {
  onStreamDelta: (handler: (delta: StreamDelta) => void): Promise<UnlistenFn> =>
    listen<StreamDelta>('stream:delta', (event) => handler(event.payload)),

  onStreamEnd: (handler: (msg: Message) => void): Promise<UnlistenFn> =>
    listen<Message>('stream:end', (event) => handler(event.payload)),

  onStreamError: (handler: (error: string) => void): Promise<UnlistenFn> =>
    listen<string>('stream:error', (event) => handler(event.payload)),

  onToolCall: (handler: (call: ToolCallEvent) => void): Promise<UnlistenFn> =>
    listen<ToolCallEvent>('tool:call', (event) => handler(event.payload)),

  onToolResult: (handler: (result: ToolResultEvent) => void): Promise<UnlistenFn> =>
    listen<ToolResultEvent>('tool:result', (event) => handler(event.payload)),

  onStreamReasoningDelta: (handler: (content: string) => void): Promise<UnlistenFn> =>
    listen<string>('stream:reasoning_delta', (event) => handler(event.payload)),

  onConversationTitleUpdated: (handler: (data: { id: string; title: string }) => void): Promise<UnlistenFn> =>
    listen<{ id: string; title: string }>('conversation:title-updated', (event) => handler(event.payload)),
};
