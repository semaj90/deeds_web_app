/**
 * PHASE 107 - Restored Store Barrel
 * Unified entrance for reactive Svelte 5 stores
 */

export { appState } from './appState.svelte.js';
export { authStore } from './auth-store.svelte';
export { userPrefs } from './preferences.svelte.js';
export { tokenTracker } from './tokenUsage.svelte.js';
// export { userStore } from './user.svelte.js';

/**
 * Initialization function for barrel stores
 */
export function initializeStores() {
  console.log('[Barrel Store] Reactive stores initialized');
}

/**
 * Cleanup function for barrel stores
 */
export function cleanupStores() {
  // Logic for cleaning up effects or subscriptions if needed
}
