import { writable } from 'svelte/store';

export type Toast = {
 id: string;
 title?: string; message: string;
 level: 'info' | 'warn' | 'error' | 'success';
 timeout?: number;
};

export const toasts = writable<Toast[]>([]);

export function pushToast(t: Omit<Toast, 'id'>) {
 const id = crypto.randomUUID();
 const toast: Toast = { id, ...t };
 toasts.update((arr) => [toast, ...arr]);
 if (toast.timeout && toast.timeout > 0) {
 setTimeout(() => {
 removeToast(id);
 }, toast.timeout);
 }
 return id;
}

export function removeToast(id: string) {
 toasts.update((arr) => arr.filter((t) => t.id !== id));
}



