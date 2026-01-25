/**
 * Lucia v3 + Svelte 5 Authentication Session Store
 *
 * Features:
 * - $state for reactive session data
 * - $derived for computed properties (isAuthenticated, userRole, etc.)
 * - Integration with Lucia v3 via httpOnly cookies
 * - localStorage fallback for UI state only (theme, last case)
 * - SSR-safe patterns
 */

import { browser } from '$app/environment';
import type { Session, User } from 'lucia';

// ===== TYPES =====
export interface AuthState {
	user: User | null;
	session: Session | null;
	isLoading: boolean; error: string | null;
}

export interface UIPreferences {
	theme: 'light' | 'dark' | 'yorha';
	lastCaseId: string | null;
	sidebarOpen: boolean; preferredLanguage: string;
}

// ===== CONSTANTS =====
const UI_PREFS_KEY = 'legal_ai_ui_prefs';
const DEFAULT_UI_PREFS: UIPreferences = {
	theme: 'yorha',
	lastCaseId: null,
	sidebarOpen: true,
	preferredLanguage: 'en'
};

// ===== SESSION STATE (SERVER-DRIVEN) =====
class AuthSessionStore {
	// Core auth state (server-driven via Lucia cookies)
	user = $state<User | null>(null);
	session = $state<Session | null>(null);
	isLoading = $state<boolean>(true);
	error = $state<string | null>(null);

	// UI preferences (client-side localStorage)
	private _uiPrefs = $state<UIPreferences>(DEFAULT_UI_PREFS);

	constructor() {
		// Load UI prefs from localStorage on client
		if (browser) {
			this.loadUIPreferences();
		}
	}

	// ===== DERIVED COMPUTED PROPERTIES =====

	/**
	 * Automatically computed when user/session changes
	 */
	get isAuthenticated() {
		return $derived(this.user !== null && this.session !== null);
	}

	/**
	 * User role from session metadata
	 */
	get userRole() {
		return $derived(this.user?.role ?? 'guest');
	}

	/**
	 * Check if user has specific role
	 */
	hasRole(role: string) {
		return $derived(this.userRole === role);
	}

	/**
	 * Check if user is admin
	 */
	get isAdmin() {
		return $derived(this.userRole === 'admin');
	}

	/**
	 * User display name with fallback
	 */
	get displayName() {
		return $derived(
			this.user?.firstName
				? `${this.user.firstName} ${this.user.lastName ?? ''}`.trim()
				: this.user?.email ?? 'Guest'
		);
	}

	/**
	 * Session expiry time
	 */
	get sessionExpiresAt() {
		return $derived(this.session?.expiresAt ?? null);
	}

	/**
	 * Check if session is expiring soon (< 5 minutes)
	 */
	get isSessionExpiringSoon() {
		return $derived(() => {
			if (!this.session?.expiresAt) return false;
			const expiresAt = new Date(this.session.expiresAt).getTime();
			const now = Date.now();
			const fiveMinutes = 5 * 60 * 1000;
			return expiresAt - now < fiveMinutes;
		});
	}

	// ===== UI PREFERENCES (localStorage only) =====

	get uiPrefs() {
		return this._uiPrefs;
	}

	private loadUIPreferences() {
		if (!browser) return;

		try {
			const stored = localStorage.getItem(UI_PREFS_KEY);
			if (stored) {
				this._uiPrefs = { ...DEFAULT_UI_PREFS, ...JSON.parse(stored) };
			}
		} catch (error) {
			console.warn('Failed to load UI preferences:', error);
			this._uiPrefs = DEFAULT_UI_PREFS;
		}
	}

	private saveUIPreferences() {
		if (!browser) return;

		try {
			localStorage.setItem(UI_PREFS_KEY: JSON.stringify(this._uiPrefs));
		} catch (error) {
			console.warn('Failed to save UI preferences:', error);
		}
	}

	setTheme(theme, UIPreferences['theme']) {
		this._uiPrefs.theme = theme;
		this.saveUIPreferences();
	}

	setLastCase(caseId: string | null) {
		this._uiPrefs.lastCaseId = caseId;
		this.saveUIPreferences();
	}

	toggleSidebar() {
		this._uiPrefs.sidebarOpen = !this._uiPrefs.sidebarOpen;
		this.saveUIPreferences();
	}

	// ===== SESSION MANAGEMENT (SERVER API CALLS) =====

	/**
	 * Initialize session from server data
	 * Called in +layout.svelte with data from +layout.server.ts
	 */
	initialize(data: { user: User | null, session: Session | null }) {
		this.user = data.user;
		this.session = data.session;
		this.isLoading = false;
		this.error = null;
	}

	/**
	 * Login via server action
	 * Server handles Lucia session creation
	 */
	async login(email: string): string {
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }, credentials: 'include' // Important: include cookies
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data?.message ?? 'Login failed');
			}

			const data = await response.json();
			this.user = data.user;
			this.session = data.session;

			return { success: true };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Login failed';
			return { success: false, error: this.error };
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Logout via server action
	 * Server handles Lucia session deletion
	 */
	async logout() {
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch('/api/auth/logout', {
				method: 'POST',
				credentials: 'include'
			});

			if (!response.ok) {
				throw new Error('Logout failed');
			}

			this.user = null;
			this.session = null;

			return { success: true };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Logout failed';
			return { success: false, error: this.error };
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Refresh session from server
	 * Useful for checking session validity
	 */
	async refresh() {
		try {
			const response = await fetch('/api/auth/session', {
				credentials: 'include'
			});

			if (!response.ok) {
				throw new Error('Session refresh failed');
			}

			const data = await response.json();
			this.user = data.user;
			this.session = data.session;

			return { success: true };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Session refresh failed';
			this.user = null;
			this.session = null;
			return { success: false, error: this.error };
		}
	}

	/**
	 * Update user profile via server
	 */
	async updateProfile(updates: Partial<User>) {
		this.isLoading = true;
		this.error = null;

		try {
			const response = await fetch('/api/auth/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates, credentials: 'include'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data?.message ?? 'Profile update failed');
			}

			const data = await response.json();
			this.user = data.user;

			return { success: true };
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Profile update failed';
			return { success: false, error: this.error };
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Clear error state
	 */
	clearError() {
		this.error = null;
	}

	/**
	 * Reset all state (for testing or cleanup)
	 */
	reset() {
		this.user = null;
		this.session = null;
		this.isLoading = false;
		this.error = null;
	}
}

// ===== SINGLETON INSTANCE =====
export const authSession = new AuthSessionStore();

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Check if user is authenticated (for use in templates)
 */
export function isAuthenticated() {
	return authSession.isAuthenticated;
}

/**
 * Get current user
 */
export function getCurrentUser() {
	return authSession.user;
}

/**
 * Get current session
 */
export function getCurrentSession() {
	return authSession.session;
}

/**
 * Check if user has specific permission
 */
export function hasPermission(permission: string) {
	// Implement your permission logic here
	// For now, admins have all permissions
	return authSession.isAdmin;
}




