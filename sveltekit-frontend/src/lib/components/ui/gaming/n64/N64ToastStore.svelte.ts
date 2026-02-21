/**
 * N64 Toast Store — Svelte 5 runes
 * Rewritten Session 63
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration?: number;
}

class N64ToastStore {
	toasts = $state<Toast[]>([]);

	add(message: string, type: ToastType = 'info', duration = 3000): string {
		const id = crypto.randomUUID();
		this.toasts = [...this.toasts, { id, message, type, duration }];

		if (duration > 0) {
			setTimeout(() => this.remove(id), duration);
		}
		return id;
	}

	remove(id: string): void {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toastStore = new N64ToastStore();
export default toastStore;
