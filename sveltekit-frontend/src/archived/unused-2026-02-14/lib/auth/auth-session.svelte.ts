import { browser } from '$app/environment';
import { User } from 'lucia';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * Client-side Auth State using Svelte 5 Runes
 * Handles UI state synchronization and user access
 */
class AuthState {
	// Svelte 5 reactive state
	user = $state<User | null>(null);
	isAuthenticated = $derived(this.user !== null);

	// UI Preferences (synced to localStorage in dev/browser)
	theme = $state<'light' | 'dark'>('dark');
	sidebarOpen = $state(true);
	lastCaseId = $state<string | null>(null);

	constructor() {
		if (browser) {
			this.loadFromStorage();
			this.initEffect();
		}
	}

	// Initialize user state from server data (hydration)
	init(user: User | null) {
		this.user = user;
	}

	// Load non-sensitive UI state from localStorage
	private loadFromStorage() {
		try {
			const saved = localStorage.getItem('deeds_ui_state');
			if (saved) {
				const data = JSON.parse(saved);
				if (data.theme) this.theme = data.theme;
				if (data.sidebarOpen !== undefined) this.sidebarOpen = data.sidebarOpen;
				if (data.lastCaseId) this.lastCaseId = data.lastCaseId;
			}
		} catch (e) {
			console.warn('Failed to load UI state', e);
		}
	}

	// Sync UI state to storage automatically
	private initEffect() {
		$effect(() => {
			const state = {
				theme: this.theme,
				sidebarOpen: this.sidebarOpen,
				lastCaseId: this.lastCaseId
			};
			localStorage.setItem('deeds_ui_state', JSON.stringify(state));
		});
	}

	// Actions
	logout() {
		this.user = null;
		window.location.href = '/logout';
	}
}

// Singleton instance
export const authState = new AuthState();


