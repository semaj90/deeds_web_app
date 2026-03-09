/**
 * Store barrel — re-exports for $lib/stores imports
 */
export { appState } from './appState.svelte.js';
export { userPrefs } from './preferences.svelte.js';
export { userStore } from './user.svelte.js';

export function initializeStores() {
  // Stores auto-initialize via $state — no-op entry point
}

export function cleanupStores() {
  // Cleanup logic if needed
}