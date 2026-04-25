// Global Authentication Store - Svelte 5 with runes integration
import { writable, derived } from "svelte/store";
import type { User, Session } from "$lib/db";

// User and session state
export const currentUser = writable<User | null>(null);
export const currentSession = writable<Session | null>(null);
export const isLoading = writable<boolean>(false);
export const authError = writable<string | null>(null);

// Derived authentication state
export const isAuthenticated = derived(
  [currentUser, currentSession],
  ([$user, $session]) => {
    if (!$user || !$session) return false;

    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date($session.expiresAt);
    return expiresAt > now;
  },
);

export const userRole = derived(
  [currentUser],
  ([$user]) => $user?.role || "guest",
);

export const userPermissions = derived([userRole], ([$role]) => {
  switch ($role) {
    case "admin":
      return {
        canCreateCases: true,
        canDeleteCases: true,
        canManageUsers: true,
        canViewAllCases: true,
        canAnalyzeEvidence: true,
        canAccessAI: true,
      };
    case "detective":
      return {
        canCreateCases: true,
        canDeleteCases: false,
        canManageUsers: false,
        canViewAllCases: true,
        canAnalyzeEvidence: true,
        canAccessAI: true,
      };
    case "user":
      return {
        canCreateCases: false,
        canDeleteCases: false,
        canManageUsers: false,
        canViewAllCases: false,
        canAnalyzeEvidence: true,
        canAccessAI: false,
      };
    default:
      return {
        canCreateCases: false,
        canDeleteCases: false,
        canManageUsers: false,
        canViewAllCases: false,
        canAnalyzeEvidence: false,
        canAccessAI: false,
      };
  }
});

// Authentication actions
export const authActions = {
  // Login user
  async login(email: string, password: string): Promise<boolean> {
    isLoading.set(true);
    authError.set(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const { user, session } = await response.json();
        currentUser.set(user);
        currentSession.set(session);

        // Also sync with QUIC auth server
        await this.syncWithQuicAuth(user, session);
        return true;
      } else {
        const error = await response.text();
        authError.set(error || "Login failed");
        return false;
      }
    } catch (error) {
      authError.set(error instanceof Error ? error.message : "Login failed");
      return false;
    } finally {
      isLoading.set(false);
    }
  },

  // Register new user
  async register(userData: {
    email: string;
    password: string;
    name: string;
    role?: string;
  }): Promise<boolean> {
    isLoading.set(true);
    authError.set(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        const { user, session } = await response.json();
        currentUser.set(user);
        currentSession.set(session);

        // Sync with QUIC auth server
        await this.syncWithQuicAuth(user, session);
        return true;
      } else {
        const error = await response.text();
        authError.set(error || "Registration failed");
        return false;
      }
    } catch (error) {
      authError.set(
        error instanceof Error ? error.message : "Registration failed",
      );
      return false;
    } finally {
      isLoading.set(false);
    }
  },

  // Logout user
  async logout(): Promise<void> {
    isLoading.set(true);

    try {
      // Call both local and QUIC logout
      await Promise.all([
        fetch("/api/auth/logout", { method: "POST" }),
        this.logoutFromQuicAuth(),
      ]);
    } catch (error) {
      console.warn("Logout error:", error);
    } finally {
      // Clear local state regardless of API response
      currentUser.set(null);
      currentSession.set(null);
      authError.set(null);
      isLoading.set(false);

      // Clear any cached data
      this.clearLocalStorage();
    }
  },

  // Validate current session
  async validateSession(): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/validate");

      if (response.ok) {
        const { user, session } = await response.json();
        currentUser.set(user);
        currentSession.set(session);
        return true;
      } else {
        // Session invalid, clear state
        currentUser.set(null);
        currentSession.set(null);
        return false;
      }
    } catch (error) {
      console.error("Session validation failed:", error);
      currentUser.set(null);
      currentSession.set(null);
      return false;
    }
  },

  // Sync with QUIC authentication server
  async syncWithQuicAuth(user: User, session: Session): Promise<void> {
    try {
      await fetch("/api/auth/sync-quic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, session }),
      });
    } catch (error) {
      console.warn("QUIC auth sync failed:", error);
      // Continue anyway, local auth is working
    }
  },

  // Logout from QUIC auth server
  async logoutFromQuicAuth(): Promise<void> {
    try {
      await fetch("/api/auth/logout-quic", { method: "POST" });
    } catch (error) {
      console.warn("QUIC logout failed:", error);
    }
  },

  // Clear localStorage cache
  clearLocalStorage(): void {
    try {
      localStorage.removeItem("session");
      localStorage.removeItem("auth");
      localStorage.removeItem("legal_ai_session");
      localStorage.removeItem("user");
    } catch (error) {
      console.warn("Failed to clear localStorage:", error);
    }
  },

  // Initialize auth state (call on app start)
  async initializeAuth(): Promise<void> {
    // Try to validate existing session first
    const isValid = await this.validateSession();

    if (!isValid) {
      // Check for persisted session in localStorage as fallback
      try {
        const stored =
          localStorage.getItem("legal_ai_session") ||
          localStorage.getItem("session");
        if (stored) {
          const { user, session } = JSON.parse(stored);

          // Verify this stored session is still valid
          const now = new Date();
          const expiresAt = new Date(session.expiresAt);

          if (expiresAt > now) {
            currentUser.set(user);
            currentSession.set(session);
          } else {
            // Expired, clear it
            this.clearLocalStorage();
          }
        }
      } catch (error) {
        console.warn("Failed to restore session from localStorage:", error);
        this.clearLocalStorage();
      }
    }
  },

  // Update user profile
  async updateProfile(updates: Partial<User>): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        currentUser.set(updatedUser);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Profile update failed:", error);
      return false;
    }
  },
};

// Auto-initialize auth when store is imported
if (typeof window !== "undefined") {
  authActions.initializeAuth();
}
