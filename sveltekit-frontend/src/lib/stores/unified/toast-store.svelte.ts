/**
 * Toast Store — Svelte 5 Runes (Session 27)
 */

export interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

class ToastStore {
  toasts = $state<Toast[]>([]);
  private nextId = 0;

  show(message: string, type: Toast['type'] = 'info', duration = 2000) {
    const toast: Toast = { id: `toast-${++this.nextId}`, message, type, duration };
    this.toasts = [...this.toasts, toast];
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast.id), duration);
    }
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  success(msg: string, d?: number) { this.show(msg, 'success', d ?? 2000); }
  error(msg: string, d?: number) { this.show(msg, 'error', d ?? 3000); }
  warning(msg: string, d?: number) { this.show(msg, 'warning', d ?? 2500); }
  info(msg: string, d?: number) { this.show(msg, 'info', d ?? 2000); }
}

export const toastStore = new ToastStore();
