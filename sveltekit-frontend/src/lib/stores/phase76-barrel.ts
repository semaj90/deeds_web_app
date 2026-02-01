/**
 * Phase 76: Barrel Store Pattern - Minimal Working Version
 * Clean barrel export focusing on Phase 76 stores
 */

// ============================================
// Phase 76: Barrel Store Pattern (Local-First Architecture)
// ============================================
import { LocalLegalStore } from '../db/clientDB.svelte';
import { UserPreferences } from './preferences.svelte';
import { TokenTracker } from './tokenUsage.svelte';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// 1. Instantiate Singletons (Global Services)
export const tokenTracker = new TokenTracker();
export const localDb = new LocalLegalStore();
export const userPrefs = new UserPreferences();

// 2. Re-export Classes (if they exist)
export { CaseManager as CaseWorkflow } from '../logic/caseWorkflow.svelte';
export { ChatSession } from '../models/ChatSession.svelte';
export { LegalDocument } from '../models/LegalDocument.svelte';

// 3. Define a Global App State
export { appState } from './appState.svelte';

// 4. Initialize all stores (call from layout)
export function initializeStores() {
    if (typeof window === 'undefined') return; // SSR guard

    // Stores auto-initialize on construction
    // LocalDB init happens in constructor
    console.log('[Barrel Store] Initialized: tokenTracker, localDb, userPrefs, appState');
}

// 5. Cleanup (call from layout onDestroy)
export function cleanupStores() {
    // Cleanup if needed
    console.log('[Barrel Store] Cleanup complete');
}


