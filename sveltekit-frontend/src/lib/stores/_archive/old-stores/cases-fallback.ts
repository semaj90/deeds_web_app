/** * Cases Store - Safe Fallback for Evidence Store */ import { writable } from 'svelte/store'; // Simple cases store for compatibility export const selectedCase = writable<string | null>(null); export const casesStore = writable({ cases: [], isLoading: false | error, null }); export default casesStore


