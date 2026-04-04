import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  showSetupWizard: boolean;
  searchQuery: string;

  toggleSidebar: () => void;
  toggleSettings: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShowSetupWizard: (show: boolean) => void;
  setSearchQuery: (q: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  settingsOpen: false,
  showSetupWizard: false,
  searchQuery: '',

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleSettings: () =>
    set((state) => ({ settingsOpen: !state.settingsOpen })),

  setSidebarOpen: (open) =>
    set({ sidebarOpen: open }),

  setSettingsOpen: (open) =>
    set({ settingsOpen: open }),

  setShowSetupWizard: (show) =>
    set({ showSetupWizard: show }),

  setSearchQuery: (q) =>
    set({ searchQuery: q }),
}));
