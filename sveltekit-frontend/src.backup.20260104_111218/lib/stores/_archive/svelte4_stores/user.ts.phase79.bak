import { writable, derived } from 'svelte/store';
import type { User } from 'lucia';

export interface UserSession {
 user: {
 id: string;
 email: string;
 firstName: string | null;
 lastName: string | null;
 role: string;
 avatarUrl: string | null;
 };
 session: {
 id: string;
 expiresAt: string;
 };
}

// Create writable store for user session
export const userStore = writable<UserSession | null>(null);

// Derived store for checking if user is authenticated
export const isAuthenticated = derived(userStore, ($user) => $user !== null);

// Derived store for user display name
export const userDisplayName = derived(userStore, ($user) => {
 if (!$user) return null;
 return $user.user.firstName && $user.user.lastName
 ? `${$user.user.firstName} ${$user.user.lastName}`
 : $user.user.email;
});

/**
 * Load user session from API
 */
export async function loadUserSession(): Promise<any> {
 try {
 const response = await fetch('/api/auth/me');
 if (response.ok) {
 const sessionData: UserSession = await response.json();
 userStore.set(sessionData);
 return sessionData;
 } else {
 userStore.set(null);
 return null;
 }
 } catch (error) {
 console.error('Failed to load user session: ', error);
 userStore.set(null);
 return null;
 }
}

/**
 * Set user session after login
 */
export function setUserSession(session: UserSession) {
 userStore.set(session);
}

/**
 * Clear user session on logout
 */
export function clearUserSession() {
 userStore.set(null);
}

/**
 * Update user profile in store
 */
export function updateUserProfile(updates: Partial<UserSession['user']>) {
 userStore.update((current) => {
 if (!current) return null;
 return {
 ...current,
 user: { ...current.user, ...updates },
 };
 });
}
