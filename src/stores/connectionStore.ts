import { create } from 'zustand';
import { api } from '../lib/tauri';
import { useChatStore } from './chatStore';

type ConnectionStatus = 'connected' | 'checking' | 'disconnected' | 'unknown';

interface ConnectionState {
  status: ConnectionStatus;
  lastChecked: number | null;
  modelCount: number;

  checkConnection: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  status: 'unknown',
  lastChecked: null,
  modelCount: 0,

  checkConnection: async () => {
    set({ status: 'checking' });
    try {
      const healthy = await api.healthCheck();
      if (healthy) {
        const models = await api.listModels();
        set({ status: 'connected', lastChecked: Date.now(), modelCount: models.length });
      } else {
        set({ status: 'disconnected', lastChecked: Date.now(), modelCount: 0 });
      }
    } catch {
      set({ status: 'disconnected', lastChecked: Date.now(), modelCount: 0 });
    }
  },

  startPolling: () => {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      // Skip polling during active streaming
      if (useChatStore.getState().isStreaming) return;
      get().checkConnection();
    }, 30_000);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));
