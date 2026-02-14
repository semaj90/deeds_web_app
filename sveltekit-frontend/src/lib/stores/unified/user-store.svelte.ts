/**
 * UserStore — Svelte 5 Runes (Session 27)
 */

import type { UserType as User } from '$lib/data/types';

class UserStore {
  currentUser = $state<User | null>(null);
  isAuthenticated = $state(false);
  isLoading = $state(false);
  sessionToken = $state<string | null>(null);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  displayName = $derived(this.currentUser?.name || this.currentUser?.email || 'Guest');

  async initializeFromSession() {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.sessionToken = data.token;
        this.lastUpdated = Date.now();
      } else {
        this.isAuthenticated = false;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Session init failed';
    } finally {
      this.isLoading = false;
    }
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.sessionToken = data.token;
        this.lastUpdated = Date.now();
        return { success: true };
      } else {
        this.error = data.error ?? 'Login failed';
        return { success: false, error: data.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Login failed';
      this.error = errorMsg;
      return { success: false, error: errorMsg };
    } finally {
      this.isLoading = false;
    }
  }

  async register(email: string, password: string, name?: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.sessionToken = data.token;
        this.lastUpdated = Date.now();
        return { success: true };
      } else {
        this.error = data.error ?? 'Registration failed';
        return { success: false, error: data.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Registration failed';
      this.error = errorMsg;
      return { success: false, error: errorMsg };
    } finally {
      this.isLoading = false;
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      this.currentUser = null;
      this.isAuthenticated = false;
      this.sessionToken = null;
      this.error = null;
      this.lastUpdated = 0;
    }
  }

  async updateProfile(updates: Partial<User>) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        this.currentUser = data.user;
        this.lastUpdated = Date.now();
        return { success: true };
      } else {
        this.error = data.error ?? 'Profile update failed';
        return { success: false, error: data.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Profile update failed';
      this.error = errorMsg;
      return { success: false, error: errorMsg };
    } finally {
      this.isLoading = false;
    }
  }

  async updatePreferences(preferences: Record<string, unknown>) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        if (this.currentUser) {
          this.currentUser = { ...this.currentUser, ...data.preferences };
        }
        this.lastUpdated = Date.now();
        return { success: true };
      } else {
        const data = await response.json();
        this.error = data.error ?? 'Preferences update failed';
        return { success: false, error: data.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Preferences update failed';
      this.error = errorMsg;
      return { success: false, error: errorMsg };
    } finally {
      this.isLoading = false;
    }
  }

  clearError() {
    this.error = null;
  }
}

export const userStore = new UserStore();

export const isAuthenticated = { get value() { return userStore.isAuthenticated; } };
export const currentUser = { get value() { return userStore.currentUser; } };
export const userLoading = { get value() { return userStore.isLoading; } };
export const userError = { get value() { return userStore.error; } };
