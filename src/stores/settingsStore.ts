import { create } from 'zustand';
import { api } from '../lib/tauri';
import type { AppSettings } from '../lib/types';

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: null,
  loading: false,

  loadSettings: async () => {
    set({ loading: true });
    try {
      const settings = await api.getSettings();
      set({ settings, loading: false });
    } catch (err) {
      console.error('Failed to load settings:', err);
      set({ loading: false });
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    if (!current) return;

    const updated = { ...current, ...partial };
    await api.updateSettings(partial);
    set({ settings: updated });
  },
}));

// Auto-load settings on store creation so theme applies immediately
useSettingsStore.getState().loadSettings();
