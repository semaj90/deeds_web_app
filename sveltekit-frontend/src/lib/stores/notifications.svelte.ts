export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  title?: string;
  message: string;
  duration?: number;
  closable?: boolean;
}

class NotificationStore {
  notifications = $state<Notification[]>([]);

  get count() {
    return this.notifications.length;
  }

  add(notification: Omit<Notification, 'id'>): string {
    const id = Math.random().toString(36).substring(2, 9);
    this.notifications = [...this.notifications, { ...notification, id }];

    // Auto-dismiss after duration
    if (notification.duration) {
      setTimeout(() => this.remove(id), notification.duration);
    }

    return id;
  }

  remove(id: string) {
    this.notifications = this.notifications.filter(item => item.id !== id);
  }

  clear() {
    this.notifications = [];
  }
}

export const notificationStore = new NotificationStore();
