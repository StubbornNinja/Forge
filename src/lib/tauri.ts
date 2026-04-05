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
  HfModelResult,
  HfGgufFile,
  StructuredError,
  CatalogModel,
  InstalledModel,
  SidecarStatusInfo,
  SystemInfo,
  ModelDownloadProgress,
  UpdateCheckResult,
} from './types';

// Invoke wrappers — one per IPC command
export const api = {
  sendMessage: (conversationId: string, content: string, attachments?: string[], thinkingDisabled?: boolean) =>
    invoke<void>('send_message', { conversationId, content, attachments, thinkingDisabled }),

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

  deleteAllConversations: () =>
    invoke<number>('delete_all_conversations'),

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

  // Sidecar
  sidecarEnsureBinary: () =>
    invoke<{ path: string; version: string; exists: boolean }>('sidecar_ensure_binary'),

  sidecarBinaryStatus: () =>
    invoke<{ path: string; version: string; exists: boolean }>('sidecar_binary_status'),

  sidecarStart: (modelPath: string, extraArgs?: string[]) =>
    invoke<void>('sidecar_start', { modelPath, extraArgs }),

  sidecarStop: () =>
    invoke<void>('sidecar_stop'),

  sidecarStatus: () =>
    invoke<SidecarStatusInfo>('sidecar_status'),

  sidecarAutoStart: () =>
    invoke<void>('sidecar_auto_start'),

  sidecarCheckUpdate: () =>
    invoke<UpdateCheckResult>('sidecar_check_update'),

  sidecarUpdateBinary: (tag: string) =>
    invoke<{ path: string; version: string; exists: boolean }>('sidecar_update_binary', { tag }),

  // Models
  listCatalogModels: () =>
    invoke<CatalogModel[]>('list_catalog_models'),

  listInstalledModels: () =>
    invoke<InstalledModel[]>('list_installed_models'),

  downloadModel: (catalogId: string, quant: string) =>
    invoke<InstalledModel>('download_model', { catalogId, quant }),

  cancelModelDownload: () =>
    invoke<void>('cancel_model_download'),

  deleteModel: (modelId: string) =>
    invoke<void>('delete_model', { modelId }),

  getSystemInfo: () =>
    invoke<SystemInfo>('get_system_info'),

  // HuggingFace
  searchHfModels: (query: string) =>
    invoke<HfModelResult[]>('search_hf_models', { query }),

  listHfFiles: (repoId: string) =>
    invoke<HfGgufFile[]>('list_hf_files', { repoId }),

  downloadHfModel: (hfRepo: string, filename: string) =>
    invoke<InstalledModel>('download_hf_model', { hfRepo, filename }),
};

// Event listeners for streaming
export const events = {
  onStreamDelta: (handler: (delta: StreamDelta) => void): Promise<UnlistenFn> =>
    listen<StreamDelta>('stream:delta', (event) => handler(event.payload)),

  onStreamEnd: (handler: (msg: Message) => void): Promise<UnlistenFn> =>
    listen<Message>('stream:end', (event) => handler(event.payload)),

  onStreamError: (handler: (error: string | StructuredError) => void): Promise<UnlistenFn> =>
    listen<string | StructuredError>('stream:error', (event) => handler(event.payload)),

  onToolCall: (handler: (call: ToolCallEvent) => void): Promise<UnlistenFn> =>
    listen<ToolCallEvent>('tool:call', (event) => handler(event.payload)),

  onToolResult: (handler: (result: ToolResultEvent) => void): Promise<UnlistenFn> =>
    listen<ToolResultEvent>('tool:result', (event) => handler(event.payload)),

  onStreamReasoningDelta: (handler: (content: string) => void): Promise<UnlistenFn> =>
    listen<string>('stream:reasoning_delta', (event) => handler(event.payload)),

  onConversationTitleUpdated: (handler: (data: { id: string; title: string }) => void): Promise<UnlistenFn> =>
    listen<{ id: string; title: string }>('conversation:title-updated', (event) => handler(event.payload)),

  onStreamContentReset: (handler: () => void): Promise<UnlistenFn> =>
    listen<void>('stream:content_reset', () => handler()),

  onSidecarStatus: (handler: (status: SidecarStatusInfo) => void): Promise<UnlistenFn> =>
    listen<SidecarStatusInfo>('sidecar:status', (event) => handler(event.payload)),

  onModelDownloadProgress: (handler: (progress: ModelDownloadProgress) => void): Promise<UnlistenFn> =>
    listen<ModelDownloadProgress>('model:download-progress', (event) => handler(event.payload)),

  onSidecarDownloadProgress: (handler: (progress: { downloaded_bytes: number; total_bytes: number; phase: string }) => void): Promise<UnlistenFn> =>
    listen<{ downloaded_bytes: number; total_bytes: number; phase: string }>('sidecar:download-progress', (event) => handler(event.payload)),
};
