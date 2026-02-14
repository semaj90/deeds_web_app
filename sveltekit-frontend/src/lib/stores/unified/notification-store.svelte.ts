/**
 * Notification Store — Svelte 5 Runes (Session 27)
 */

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type ToastDuration = 2000 | 3000 | 5000 | 'indefinite';

export interface Toast {
  id: string;
  message: string;
  type: NotificationType;
  duration: ToastDuration;
  createdAt: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: number;
  actionUrl?: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isDismissed: boolean;
  createdAt: number;
  dismissedAt?: number;
}

class NotificationStore {
  notifications = $state<Notification[]>([]);
  toasts = $state<Toast[]>([]);
  alerts = $state<Alert[]>([]);
  alertSettings = $state({
    enableSoundNotification: true,
    enableDesktopNotification: false
  });

  unreadCount = $derived(this.notifications.filter(n => !n.isRead).length);
  activeAlerts = $derived(this.alerts.filter(a => !a.isDismissed));

  private genId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  addNotification(notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) {
    const id = this.genId('notif');
    this.notifications = [{
      ...notification, id, isRead: false, createdAt: Date.now()
    }, ...this.notifications];
    return id;
  }

  removeNotification(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  markAsRead(id: string) {
    this.notifications = this.notifications.map(n =>
      n.id === id ? { ...n, isRead: true } : n
    );
  }

  markAllAsRead() {
    this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
  }

  clearAllNotifications() {
    this.notifications = [];
  }

  showToast(message: string, type: NotificationType = 'info', duration: ToastDuration = 3000) {
    const id = this.genId('toast');
    const toast: Toast = { id, message, type, duration, createdAt: Date.now() };
    this.toasts = [...this.toasts, toast];
    if (duration !== 'indefinite') {
      setTimeout(() => this.dismissToast(id), typeof duration === 'number' ? duration : 3000);
    }
    return id;
  }

  dismissToast(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  clearAllToasts() {
    this.toasts = [];
  }

  addAlert(alert: Omit<Alert, 'id' | 'isDismissed' | 'createdAt'>) {
    const id = this.genId('alert');
    this.alerts = [{
      ...alert, id, isDismissed: false, createdAt: Date.now()
    }, ...this.alerts];
    return id;
  }

  dismissAlert(id: string) {
    this.alerts = this.alerts.map(a =>
      a.id === id ? { ...a, isDismissed: true, dismissedAt: Date.now() } : a
    );
  }

  removeAlert(id: string) {
    this.alerts = this.alerts.filter(a => a.id !== id);
  }

  clearDismissedAlerts() {
    this.alerts = this.alerts.filter(a => !a.isDismissed);
  }

  updateSettings(settings: Partial<typeof this.alertSettings>) {
    this.alertSettings = { ...this.alertSettings, ...settings };
  }

  toggleSoundNotification() {
    this.alertSettings = {
      ...this.alertSettings,
      enableSoundNotification: !this.alertSettings.enableSoundNotification
    };
  }

  toggleDesktopNotification() {
    this.alertSettings = {
      ...this.alertSettings,
      enableDesktopNotification: !this.alertSettings.enableDesktopNotification
    };
  }
}

export const notificationStore = new NotificationStore();

export const showToast = (message: string, type: NotificationType = 'info', duration: ToastDuration = 3000) =>
  notificationStore.showToast(message, type, duration);

export const removeAlert = (id: string) => notificationStore.removeAlert(id);
