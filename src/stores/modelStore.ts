import { create } from 'zustand';
import { api, events } from '../lib/tauri';
import type { CatalogModel, InstalledModel, ModelDownloadProgress } from '../lib/types';

interface ModelState {
  catalog: CatalogModel[];
  installed: InstalledModel[];
  downloading: ModelDownloadProgress | null;
  loading: boolean;

  loadCatalog: () => Promise<void>;
  loadInstalled: () => Promise<void>;
  downloadModel: (catalogId: string, quant: string) => Promise<InstalledModel>;
  cancelDownload: () => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  setDownloadProgress: (progress: ModelDownloadProgress | null) => void;
}

export const useModelStore = create<ModelState>()((set, get) => ({
  catalog: [],
  installed: [],
  downloading: null,
  loading: false,

  loadCatalog: async () => {
    try {
      const catalog = await api.listCatalogModels();
      set({ catalog });
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  },

  loadInstalled: async () => {
    set({ loading: true });
    try {
      const installed = await api.listInstalledModels();
      set({ installed, loading: false });
    } catch (err) {
      console.error('Failed to load installed models:', err);
      set({ loading: false });
    }
  },

  downloadModel: async (catalogId: string, quant: string) => {
    const model = await api.downloadModel(catalogId, quant);
    // Refresh installed list
    await get().loadInstalled();
    set({ downloading: null });
    return model;
  },

  cancelDownload: async () => {
    await api.cancelModelDownload();
    set({ downloading: null });
  },

  deleteModel: async (modelId: string) => {
    await api.deleteModel(modelId);
    await get().loadInstalled();
  },

  setDownloadProgress: (progress) => {
    set({ downloading: progress });
  },
}));

// Subscribe to download progress events
let progressUnlisten: (() => void) | null = null;

export function initModelEvents() {
  events.onModelDownloadProgress((progress) => {
    useModelStore.getState().setDownloadProgress(progress);
  }).then((fn) => { progressUnlisten = fn; });
}

export function cleanupModelEvents() {
  progressUnlisten?.();
}
