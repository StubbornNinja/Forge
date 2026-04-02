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
}

export interface ModelInfo {
  id: string;
  owned_by?: string;
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
