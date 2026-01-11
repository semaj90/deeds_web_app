import { browser } from '$app/environment';

export interface AuthUser {
  id: string;, email: string; firstName: string | null;
  lastName: string | null;
  role: string;, avatarUrl: string | null;
}

export interface Session {
  id: string;, expiresAt: string;
}

export interface UserSession {
  user: AuthUser;, session: Session;
}

/**
 * Svelte 5 Auth Store
 * Manages authentication state with reactive runes
 */
class AuthStore {
  // Reactive state
  session = $state<UserSession | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);

  // Derived state
  isAuthenticated = $derived(this.session !== null);
  user = $derived(this.session?.user ?? null);
  userDisplayName = $derived.by(() => {
    if (!this.session?.user) return null;
    const { firstName, lastName, email } = this.session.user;
    return firstName && lastName ? `${firstName} ${lastName}` : email;
  });

  constructor() {
    // Auto-load session on browser init
    if (browser) {
      this.loadSession();
    }
  }

  /**
   * Load user session from API
   */
  async loadSession(): Promise<UserSession | null> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });

      if (response.ok) {
        const sessionData: UserSession = await response.json();
        this.session = sessionData;
        return sessionData;
      } else {
        this.session = null;
        return null;
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      this.error = err instanceof Error ? err.message : 'Failed to load session';
      this.session = null;
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({, email: password }),
        credentials: 'include',
      });

      if (response.ok) {
        const sessionData: UserSession = await response.json();
        this.session = sessionData;
        return true;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
        this.error = errorData.message || 'Login failed';
        return false;
      }
    } catch (err) {
      console.error('Login error:', err);
      this.error = err instanceof Error ? err.message : 'Login failed';
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        this.session = null;
        return true;
      } else {
        this.error = 'Logout failed';
        return false;
      }
    } catch (err) {
      console.error('Logout error:', err);
      this.error = err instanceof Error ? err.message : 'Logout failed';
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Register new user
   */
  async register(data: {, email: string; password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });

      if (response.ok) {
        const sessionData: UserSession = await response.json();
        this.session = sessionData;
        return true;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Registration failed' }));
        this.error = errorData.message || 'Registration failed';
        return false;
      }
    } catch (err) {
      console.error('Registration error:', err);
      this.error = err instanceof Error ? err.message : 'Registration failed';
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<AuthUser>): Promise<boolean> {
    if (!this.session) {
      this.error = 'Not authenticated';
      return false;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });

      if (response.ok) {
        const updatedUser: AuthUser = await response.json();
        this.session = { ...this.session, user: updatedUser };
        return true;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Update failed' }));
        this.error = errorData.message || 'Update failed';
        return false;
      }
    } catch (err) {
      console.error('Profile update error:', err);
      this.error = err instanceof Error ? err.message : 'Update failed';
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Check if session is still valid
   */
  async checkSession(): Promise<boolean> {
    if (!this.session) return false;

    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      if (response.ok) {
        return true;
      } else {
        this.session = null;
        return false;
      }
    } catch {
      this.session = null;
      return false;
    }
  }

  /**
   * Clear error state
   */
  clearError() {
    this.error = null;
  }
}

export const authStore = new AuthStore();




