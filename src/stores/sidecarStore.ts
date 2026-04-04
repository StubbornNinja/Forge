import { create } from 'zustand';
import { api, events } from '../lib/tauri';
import type { SidecarStatusInfo } from '../lib/types';

interface SidecarState {
  status: SidecarStatusInfo;
  binaryExists: boolean;

  checkStatus: () => Promise<void>;
  checkBinary: () => Promise<void>;
  start: (modelPath: string, extraArgs?: string[]) => Promise<void>;
  stop: () => Promise<void>;
  ensureBinary: () => Promise<void>;
  setStatus: (status: SidecarStatusInfo) => void;
}

export const useSidecarStore = create<SidecarState>()((set) => ({
  status: { status: 'stopped' },
  binaryExists: false,

  checkStatus: async () => {
    try {
      const status = await api.sidecarStatus();
      set({ status });
    } catch {
      set({ status: { status: 'stopped' } });
    }
  },

  checkBinary: async () => {
    try {
      const info = await api.sidecarBinaryStatus();
      set({ binaryExists: info.exists });
    } catch {
      set({ binaryExists: false });
    }
  },

  start: async (modelPath: string, extraArgs?: string[]) => {
    set({ status: { status: 'starting' } });
    try {
      await api.sidecarStart(modelPath, extraArgs);
    } catch (err) {
      set({ status: { status: 'error', error: String(err) } });
      throw err;
    }
  },

  stop: async () => {
    try {
      await api.sidecarStop();
      set({ status: { status: 'stopped' } });
    } catch (err) {
      console.error('Failed to stop sidecar:', err);
    }
  },

  ensureBinary: async () => {
    await api.sidecarEnsureBinary();
    set({ binaryExists: true });
  },

  setStatus: (status) => set({ status }),
}));

// Subscribe to sidecar status events
let statusUnlisten: (() => void) | null = null;

export function initSidecarEvents() {
  events.onSidecarStatus((status) => {
    useSidecarStore.getState().setStatus(status);
  }).then((fn) => { statusUnlisten = fn; });
}

export function cleanupSidecarEvents() {
  statusUnlisten?.();
}
