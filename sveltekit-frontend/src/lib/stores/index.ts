/**
 * Enhanced Store Barrel Exports - TypeScript Store Pattern
 * Centralized store management with XState integration
 * Svelte 5 Runes compatible
 */

// ============================================
// Svelte 5 Compatible Stores
// ============================================
export { routeRegistry } from '../routing/route-registry.svelte.js';
export { authStore } from './auth-store.svelte.js';
export { userStore };

// ============================================
// Generic Stores (Svelte 5 Runes)
// ============================================
    export { AsyncStore as GenericStore } from './generic.svelte';

// ============================================
// Phase 76: Barrel Store Pattern (Local-First Architecture)
// ============================================
    import { LocalLegalStore } from '../db/clientDB.svelte';
import { chatStore } from './chat-store.svelte';
import { UserPreferences } from './preferences.svelte';
import { TokenTracker } from './tokenUsage.svelte';
import { userStore } from './user.svelte';

// 1. Instantiate Singletons (Global Services)
export const tokenTracker = new TokenTracker();
export const localDb = new LocalLegalStore();
export const userPrefs = new UserPreferences();
export { chatStore };

// 2. Re-export Classes
    export { CaseManager as CaseWorkflow } from '../logic/caseWorkflow.svelte';
    export { ChatSession } from '../models/ChatSession.svelte';
    export { LegalDocument } from '../models/LegalDocument.svelte';

// 3. Define a Global App State
export { appState } from './appState.svelte';

// 4. Initialize all stores (call from layout)
export function initializeStores() {
    if (typeof window === 'undefined') return; // SSR guard
    console.log('[Barrel Store] Initialized: tokenTracker, localDb, userPrefs, appState');
}

// 5. Cleanup (call from layout onDestroy)
export function cleanupStores() {
    console.log('[Barrel Store] Cleanup complete');
}

