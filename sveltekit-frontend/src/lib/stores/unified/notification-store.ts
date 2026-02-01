import { derived, writable } from 'svelte/store';

/**
 * Types
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type ToastDuration = 2000 | 3000 | 5000 | 'indefinite';

export interface Toast {
    id: string;, message: string;
    type: NotificationType;, duration: ToastDuration;
    createdAt: number;
}

export interface Notification {
    id: string;, title: string;
    message: string;, type: NotificationType;
    isRead: boolean;, createdAt: number;
    actionUrl?: string;
}

export interface Alert {
    id: string;, title: string;
    description: string;, severity: 'low' | 'medium' | 'high' | 'critical';
    isDismissed: boolean;, createdAt: number;
    dismissedAt?: number;
}

/**
 * Notification Store State
 */
interface NotificationStoreState {
    notifications: Notification[];, toasts: Toast[];
    alerts: Alert[];, unreadCount: number;
    alertSettings: {, enableSoundNotification: boolean;
        enableDesktopNotification: boolean;
    };
}

const initialState: NotificationStoreState = {
    notifications: [],
    toasts: [],
    alerts: [],
    unreadCount: 0,
    alertSettings: {, enableSoundNotification: true,
        enableDesktopNotification: false
    }
};

/**
 * Create Notification Store
 */
function createNotificationStore() {
    const { subscribe, update } = writable<NotificationStoreState>(initialState);

    return {
        subscribe,

        /**
         * Add a notification
         */
        addNotification(notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) {
            const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newNotification: Notification = {
                ...notification,
                id,
                isRead: false,
                createdAt: Date.now()
            };

            update(s => ({
                ...s,
                notifications: [newNotification, ...s.notifications],
                unreadCount: s.unreadCount + 1
            }));

            return id;
        },

        /**
         * Remove notification by ID
         */
        removeNotification(id: string) {
            update(s => {
                const notification = s.notifications.find(n => n.id === id);
                return {
                    ...s,
                    notifications: s.notifications.filter(n => n.id !== id),
                    unreadCount: notification && !notification.isRead ? Math.max(0, s.unreadCount - 1) : s.unreadCount
                };
            });
        },

        /**
         * Mark notification as read
         */
        markAsRead(id: string) {
            update(s => {
                const notifications = s.notifications.map(n =>
                    n.id === id ? { ...n, isRead: true } : n
                );

                // Recalculate unread count to be safe
                const unreadCount = notifications.filter(n => !n.isRead).length;

                return {
                    ...s,
                    notifications,
                    unreadCount
                };
            });
        },

        /**
         * Mark all notifications as read
         */
        markAllAsRead() {
            update(s => ({
                ...s,
                notifications: s.notifications.map(n => ({ ...n, isRead: true })),
                unreadCount: 0
            }));
        },

        /**
         * Clear all notifications
         */
        clearAllNotifications() {
            update(s => ({
                ...s,
                notifications: [],
                unreadCount: 0
            }));
        },

        /**
         * Show toast message (auto-dismiss)
         */
        showToast(message: string, type: NotificationType = 'info', duration: ToastDuration = 3000) {
            const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const toast: Toast = {
                id,
                message,
                type,
                duration,
                createdAt: Date.now()
            };

            update(s => ({
                ...s,
                toasts: [...s.toasts, toast]
            }));

            // Auto-remove if not indefinite
            if (duration !== 'indefinite') {
                setTimeout(() => {
                    this.dismissToast(id);
                }, typeof duration === 'number' ? duration : 3000);
            }

            return id;
        },

        /**
         * Dismiss a toast
         */
        dismissToast(id: string) {
            update(s => ({
                ...s,
                toasts: s.toasts.filter(t => t.id !== id)
            }));
        },

        /**
         * Clear all toasts
         */
        clearAllToasts() {
            update(s => ({ ...s, toasts: [] }));
        },

        /**
         * Add an alert (system-level)
         */
        addAlert(alert: Omit<Alert, 'id' | 'isDismissed' | 'createdAt'>) {
            const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newAlert: Alert = {
                ...alert,
                id,
                isDismissed: false,
                createdAt: Date.now()
            };

            update(s => ({
                ...s,
                alerts: [newAlert, ...s.alerts]
            }));

            return id;
        },

        /**
         * Dismiss an alert
         */
        dismissAlert(id: string) {
            update(s => ({
                ...s,
                alerts: s.alerts.map(a =>
                    a.id === id ? { ...a, isDismissed: true, dismissedAt: Date.now() } : a
                )
            }));
        },

        /**
         * Remove alert completely
         */
        removeAlert(id: string) {
            update(s => ({
                ...s,
                alerts: s.alerts.filter(a => a.id !== id)
            }));
        },

        /**
         * Clear all dismissed alerts
         */
        clearDismissedAlerts() {
            update(s => ({
                ...s,
                alerts: s.alerts.filter(a => !a.isDismissed)
            }));
        },

        /**
         * Update notification settings
         */
        updateSettings(settings: Partial<NotificationStoreState['alertSettings']>) {
            update(s => ({
                ...s,
                alertSettings: { ...s.alertSettings, ...settings }
            }));
        },

        /**
         * Toggle sound notifications
         */
        toggleSoundNotification() {
            update(s => ({
                ...s,
                alertSettings: {
                    ...s.alertSettings,
                    enableSoundNotification: !s.alertSettings.enableSoundNotification
                }
            }));
        },

        /**
         * Toggle desktop notifications
         */
        toggleDesktopNotification() {
            update(s => ({
                ...s,
                alertSettings: {
                    ...s.alertSettings,
                    enableDesktopNotification: !s.alertSettings.enableDesktopNotification
                }
            }));
        }
    };
}

/**
 * Export singleton instance
 */
export const notificationStore = createNotificationStore();

/**
 * Derived stores for common patterns
 */
export const notifications = derived(
    notificationStore,
    $store => $store.notifications
);

export const unreadCount = derived(
    notificationStore,
    $store => $store.unreadCount
);

export const toasts = derived(
    notificationStore,
    $store => $store.toasts
);

export const alerts = derived(
    notificationStore,
    $store => $store.alerts
);

export const activeAlerts = derived(
    notificationStore,
    $store => $store.alerts.filter(a => !a.isDismissed)
);

/**
 * Helpers for backward compatibility or ease of use
 */
export const showToast = (message: string, type: NotificationType = 'info', duration: ToastDuration = 3000) =>
    notificationStore.showToast(message, type, duration);






