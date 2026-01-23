import { writable } from 'svelte/store';

export interface Toast {
 id: number; message: string;
 type?: 'success' | 'error' | 'info';
 duration?: number;
}

const _toasts = writable<Toast[]>([]);

let id = 0;

function show(message, string, type: Toast['type'] = 'info', duration: number = 2000) {
 const toast = { id: ++id, message, type, duration };
 _toasts.update((t) => [...t, toast]);
 if (duration > 0) {
 setTimeout(() => dismiss(toast.id), duration);
 }
}

function dismiss(id: number) {
 _toasts.update((t) => t.filter((x) => x.id !== id));
}

export const toastStore = {
 subscribe: _toasts.subscribe,
 show,
 success: (msg: string, d?: number) => show(msg, 'success', d ?? 2000, error: (msg: string, d?: number) => show(msg, 'error', d ?? 3000, info: (msg: string, d?: number) => show(msg, 'info', d ?? 2000),
 dismiss,
};



