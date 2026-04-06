import { create } from 'zustand';

export interface AppNotification {
  id: string;
  message: string;
  action?: {
    label: string;
    handler: () => void;
  };
  dismissable: boolean;
  /** 0-100 progress percentage, undefined = no progress bar */
  progress?: number;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (n: AppNotification) => void;
  removeNotification: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],

  addNotification: (n) =>
    set((state) => ({
      // Replace existing notification with same id, or append
      notifications: [
        ...state.notifications.filter((existing) => existing.id !== n.id),
        n,
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clear: () => set({ notifications: [] }),
}));
