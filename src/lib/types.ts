export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  token_count?: number;
  model?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  attachments?: Attachment[];
  sort_order?: number;
  parent_message_id?: string;
  thinking_disabled?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  model?: string;
  system_prompt?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallEvent {
  call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent {
  call_id: string;
  tool_name: string;
  result: string;
  is_error: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  extracted_text?: string;
}

export interface StreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: ToolCallDelta[];
  finish_reason?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface AppSettings {
  inference_url: string;
  default_model?: string;
  temperature: number;
  max_tokens: number;
  searxng_url: string;
  search_enabled: boolean;
  send_shortcut: 'Enter' | 'Ctrl+Enter';
  theme: 'system' | 'light' | 'dark';
  system_prompt_enabled: boolean;
  custom_system_prompt?: string;
  title_model?: string;
  reasoning_effort?: string;
  search_backend?: string;
  brave_api_key?: string;
  has_completed_setup?: boolean;
  show_thinking_override?: boolean;
  inference_mode?: string;
  local_model_id?: string;
}

export interface CatalogModel {
  id: string;
  display_name: string;
  family: string;
  hf_repo: string;
  variants: QuantVariant[];
  recommended_ram_gb: number;
  context_length: number;
  supports_tool_use: boolean;
  server_args: string[];
  description: string;
}

export interface QuantVariant {
  quant: string;
  filename: string;
  size_bytes: number;
  recommended: boolean;
}

export interface InstalledModel {
  id: string;
  catalog_id: string;
  filename: string;
  file_path: string;
  size_bytes: number;
  quant: string;
  hf_repo: string;
  downloaded_at: string;
  last_used_at?: string;
}

export interface SidecarStatusInfo {
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  loaded_model?: string;
  port?: number;
  error?: string;
}

export interface SystemInfo {
  total_ram_gb: number;
  available_ram_gb: number;
  gpu_backend: string;
  gpu_vram_mb?: number;
}

export interface ModelDownloadProgress {
  model_id: string;
  downloaded_bytes: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds: number;
}

export interface ModelInfo {
  id: string;
  owned_by?: string;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  update_available: boolean;
}

export interface SearchResult {
  conversation_id: string;
  conversation_title: string;
  message_id: string;
  content_snippet: string;
  rank: number;
}

export interface FileMetadata {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  extracted_text?: string;
}

export interface HfModelResult {
  id: string;
  downloads: number;
  likes: number;
}

export interface HfGgufFile {
  filename: string;
  size_bytes: number;
}

export interface StructuredError {
  category: string;
  title: string;
  description: string;
  action?: {
    label: string;
    action_type: string;
  };
}
