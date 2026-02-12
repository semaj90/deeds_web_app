import { writable } from 'svelte/store';

export const toastStore = writable([]);

export default {
    add: (msg) => toastStore.update(t => [...t, msg]),
    remove: (id) => toastStore.update(t => t.filter(x => x.id !== id))
};
