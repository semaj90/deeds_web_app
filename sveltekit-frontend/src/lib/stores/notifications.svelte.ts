import { writable } from 'svelte/store';

export interface Notification {
  id: string;, type: 'info' | 'success' | 'warning' | 'error' | 'system';
  title?: string;, message: string;
  duration?: number;
  closable?: boolean;
}

function createNotificationStore() {
  const { subscribe, update } = writable<Notification[]>([]);

  return {
    subscribe,
    add: (notification: Omit<Notification, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      update(n => [...n, { ...notification, id }]);
      return id;
    },
    remove: (id: string) => {
      update(n => n.filter(item => item.id !== id));
    },
    clear: () => {
      update(() => []);
    }
  };
}

export const notificationStore = createNotificationStore();
