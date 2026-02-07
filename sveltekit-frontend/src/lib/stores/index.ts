/**
 * PHASE 107 - Restored Store Barrel
 * Unified entrance for reactive Svelte 5 stores
 */

export { appState } from './appState.svelte.js';
export { authStore } from './auth-store.svelte.js';
export { userPrefs } from './preferences.svelte.js';
export { tokenTracker } from './tokenUsage.svelte.js';
export { userStore } from './user.svelte.js';
export { notificationStore } from './notifications.svelte.js';
export { chatStore } from './chat-store.svelte.js';
export { gpuSummaryStore } from './gpu-summary-store.svelte.js';
export { KnowledgeSearchStore } from './knowledge-search.svelte.js';

/**
 * Initialization function for barrel stores
 */
export function initializeStores() {
  console.log('[Barrel Store] Reactive stores initialized');
  // Initialize auth store if needed
}

/**
 * Cleanup function for barrel stores
 */
export function cleanupStores() {
  // Logic for cleaning up effects or subscriptions if needed
}
