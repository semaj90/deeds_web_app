import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

export const toastStore = writable<Toast[]>([]);

export default {
    add: (message: string, type: ToastType = 'info', duration = 3000) => {
        const id = crypto.randomUUID();
        const toast = { id, message, type, duration };
        toastStore.update(t => [...t, toast]);

        if (duration > 0) {
            setTimeout(() => {
                toastStore.update(t => t.filter(x => x.id !== id));
            }, duration);
        }
        return id;
    },
    remove: (id: string) => toastStore.update(t => t.filter(x => x.id !== id)),
    subscribe: toastStore.subscribe
};
