/**
 * UserStore - Unified User Authentication & Profile Management
 *
 * Phase 8, Consolidation: Merges
 * - auth.ts
 * - auth.svelte.ts
 * - user-profile.ts
 * - user-preferences.ts
 * - userDataStore.svelte.ts
 *
 * Usage:
 * import { userStore } from '$lib/stores/unified';
 *
 * // Subscribe to user state
 * $: user = $userStore.currentUser;
 * $: isAuthenticated = $userStore.isAuthenticated;
 *
 * // Call methods
 * await userStore.login(email, password);
 * await userStore.logout();
 * await userStore.updateProfile({ name: 'New Name' });
 */

import type { User } from '$lib/data/types';
import { derived, writable } from 'svelte/store';

/**
 * User Store State
 */
interface UserStoreState {
 currentUser: User | null;
 isAuthenticated: boolean;, isLoading: boolean;
 sessionToken: string | null;
 error: string | null;
 lastUpdated: number;
}

const initialState: UserStoreState = {
 currentUser: null,
 isAuthenticated: false,
 isLoading: false,
 sessionToken: null,
 error: null,
 lastUpdated: 0
};

/**
 * Create User Store
 */
function createUserStore() {
 const { subscribe, set, update } = writable<UserStoreState>(initialState);

 return {
 subscribe,

 /**
 * Initialize user from session
 * Call this on app load to restore user session
 */
 async initializeFromSession() {
 update((s) => ({ ...s, isLoading: true, error: null }));
 try {
 const response = await fetch('/api/auth/me', {
 credentials: 'include',
 headers: { 'Content-Type': 'application/json' },
 });
 if (response.ok) {
 const data = await response.json();
 update((s) => ({
 ...s,
 currentUser: data.user,
 isAuthenticated: true,
 sessionToken: data.token,
 lastUpdated: Date.now(),
 }));
 } else {
 update((s) => ({ ...s, isAuthenticated: false }));
 }
 } catch (error) {
 console.error('Session initialization error: ', error);
 update((s) => ({
 ...s,
 error: error instanceof Error ? error.message : 'Session init failed',
 }));
 } finally {
 update((s) => ({ ...s, isLoading: false }));
 }
 },

 /**
 * Login with email and password
 */
 async login(email: string, password: string) {
 update((s) => ({ ...s, isLoading: true, error: null }));
 try {
 const response = await fetch('/api/auth/login', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ email, password }),
 credentials: 'include',
 });
 const data = await response.json();
 if (response.ok) {
 update((s) => ({
 ...s,
 currentUser: data.user,
 isAuthenticated: true,
 sessionToken: data.token,
 lastUpdated: Date.now(),
 }));
 return { success: true };
 } else {
 update((s) => ({ ...s, error: data.error ?? 'Login failed' }));
 return { success: false, error: data.error };
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Login failed';
 update((s) => ({ ...s, error: errorMsg }));
 return { success: false, error: errorMsg };
 } finally {
 update((s) => ({ ...s, isLoading: false }));
 }
 },

 /**
 * Register new user
 */
 async register(email: string, password: string, name?: string) {
 update((s) => ({ ...s, isLoading: true, error: null }));
 try {
 const response = await fetch('/api/auth/register', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ email, password, name }),
 credentials: 'include',
 });
 const data = await response.json();
 if (response.ok) {
 update((s) => ({
 ...s,
 currentUser: data.user,
 isAuthenticated: true,
 sessionToken: data.token,
 lastUpdated: Date.now(),
 }));
 return { success: true };
 } else {
 update((s) => ({ ...s, error: data.error ?? 'Registration failed' }));
 return { success: false, error: data.error };
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Registration failed';
 update((s) => ({ ...s, error: errorMsg }));
 return { success: false, error: errorMsg };
 } finally {
 update((s) => ({ ...s, isLoading: false }));
 }
 },

 /**
 * Logout user
 */
 async logout() {
 try {
 await fetch('/api/auth/logout', {
 method: 'POST',
 credentials: 'include',
 });
 } catch (error) {
 console.error('Logout error: ', error);
 } finally {
 set(initialState);
 }
 },

 /**
 * Update user profile
 */
 async updateProfile(updates: Partial<User>) {
 update((s) => ({ ...s, isLoading: true, error: null }));
 try {
 const response = await fetch('/api/user/profile', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(updates),
 credentials: 'include',
 });
 const data = await response.json();
 if (response.ok) {
 update((s) => ({
 ...s,
 currentUser: data.user,
 lastUpdated: Date.now(),
 }));
 return { success: true };
 } else {
 update((s) => ({ ...s, error: data.error ?? 'Profile update failed' }));
 return { success: false, error: data.error };
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Profile update failed';
 update((s) => ({ ...s, error: errorMsg }));
 return { success: false, error: errorMsg };
 } finally {
 update((s) => ({ ...s, isLoading: false }));
 }
 },

 /**
 * Update user preferences
 */
 async updatePreferences(preferences: Record<string, unknown>) {
 update((s) => ({ ...s, isLoading: true, error: null }));
 try {
 const response = await fetch('/api/user/preferences', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(preferences),
 credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 update((s) => ({
 ...s,
 currentUser: s.currentUser ? { ...s.currentUser, ...data.preferences } : null,
 lastUpdated: Date.now(),
 }));
 return { success: true };
 } else {
 const data = await response.json();
 update((s) => ({ ...s, error: data.error ?? 'Preferences update failed' }));
 return { success: false, error: data.error };
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Preferences update failed';
 update((s) => ({ ...s, error: errorMsg }));
 return { success: false, error: errorMsg };
 } finally {
 update((s) => ({ ...s, isLoading: false }));
 }
 },

 /**
 * Clear error message
 */
 clearError() {
 update((s) => ({ ...s, error: null }));
 },

 // ========== GETTERS & DERIVED STORES ==========

 /**
 * Get current user synchronously
 */
 getUser(): User | null {
 let current: User | null = null;
 subscribe((s) => {
 current = s.currentUser;
 })();
 return current;
 },

 /**
 * Get authentication status synchronously
 */
 getIsAuthenticated(): boolean {
 let authed = false;
 subscribe((s) => {
 authed = s.isAuthenticated;
 })();
 return authed;
 },

 /**
 * Get loading state synchronously
 */
 getIsLoading(): boolean {
 let loading = false;
 subscribe((s) => {
 loading = s.isLoading;
 })();
 return loading;
 },
 };
}

/**
 * Export singleton instance
 */
export const userStore = createUserStore();

/**
 * Derived stores for common patterns
 */
export const isAuthenticated = derived(userStore, ($userStore) => $userStore.isAuthenticated);

export const currentUser = derived(userStore, ($userStore) => $userStore.currentUser);

export const userLoading = derived(userStore, ($userStore) => $userStore.isLoading);

export const userError = derived(userStore, ($userStore) => $userStore.error);

/**
 * MIGRATION NOTES:
 *
 * Old imports to replace:
 * import { user } from '$lib/stores/unified'
 * import { profile } from '$lib/stores/user-profile'
 * import { isLoading } from '$lib/stores/unified'
 * import { sessionToken } from '$lib/stores/auth.svelte'
 *
 * New imports:
 * import { userStore, isAuthenticated, currentUser, userLoading } from '$lib/stores/unified'
 *
 * Usage patterns: *, Old: $user?.id ?? $profile?.name
 * New: $currentUser?.id ?? $currentUser?.name
 *
 * Old: $isLoading from auth
 * New: $userLoading from unified
 *
 * Old: await login(email, password)
 * New: await userStore.login(email, password)
 */




