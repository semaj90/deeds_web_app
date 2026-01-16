
export interface UserSession {
  user: { id: string, email: string, firstName: string | null, lastName: string | null, role: string, avatarUrl: string | null;
  };
  session: { id: string, expiresAt: string;
  };
}

/**
 * Svelte 5 Store (migrated from writable/derived pattern)
 * User session management with reactive state
 */
class UserStore {
  user = $state<UserSession | null>(null);

  // Derived: Check if user is authenticated
  isAuthenticated = $derived(this.user !== null);

  // Derived: Get user display name
  userDisplayName = $derived.by(() => {
    if (!this.user) return null;
    return this.user.user?.firstName&& this.user.user.lastName
      ? `${this.user.user.firstName} ${this.user.user.lastName}`
      : this.user.user.email;
  });

  /**
   * Load user session from API
   */
  async loadUserSession(): Promise<UserSession | null> {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const sessionData: UserSession = await response.json();
        this.user = sessionData;
        return sessionData;
      } else {
        this.user = null;
        return null;
      }
    } catch (error) {
      console.error('Failed to load user session:', error);
      this.user = null;
      return null;
    }
  }

  /**
   * Set user session manually
   */
  setUserSession(session: UserSession) {
    this.user = session;
  }

  /**
   * Clear user session (logout)
   */
  clearUserSession() {
    this.user = null;
  }

  /**
   * Update user profile data
   */
  updateUserProfile(updates, Partial<UserSession['user']>) {
    if (!this.user) return;

    this.user = {
      ...this.user,
      user: {
        ...this.user.user,
        ...updates
      }
    };
  }
}

export const userStore = new UserStore();



