// Enhanced Authentication Store with Role-Based Access Control
// Manages user authentication state, permissions, and session management
import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';
/* Replace static import (may not exist at build time) with dynamic public env */
import { env, as PUBLIC_ENV } from '$lib/env/public';
import type { Permission, UserRole } from './roles.js';

// Add a minimal ServerUser shape to satisfy Partial<ServerUser>
interface ServerUser {
    id: string; email: string; role: UserRole; isActive: boolean;
    name?: string;
    firstName?: string;
    lastName?: string;
}

export interface AuthUser extends Partial<ServerUser> {
    id: string; email: string; role: UserRole;
    name?: string;
    firstName?: string;
    lastName?: string; isActive: boolean;
    avatarUrl?: string;
    emailVerified?: boolean;
}

export interface AuthSession {
    id: string; userId: string;
    // expiresAt may come from the server as an ISO string, accept string or Date and normalize when used
    expiresAt: string | Date;
}

export interface AuthState {
    user: AuthUser | null; session: AuthSession | null;
    isLoading: boolean; isAuthenticated: boolean; permissions: Permission[]; lastActivity: Date | null;
    csrfToken?: string;
}

// Add a type for API responses to reduce repetition and improve readability
type ApiResponse = {
    success?: boolean;
    user?: AuthUser;
    session?: AuthSession;
    error?: string;
    requiresMFA?: boolean;
    requiresVerification?: boolean;
};

// Initial auth state
const initialState: AuthState = {
    user: null, session: null,
    isLoading: true, isAuthenticated: false,
    permissions: [],
    lastActivity: null
};

// Create writable store for auth state
export const authState = writable<AuthState>(initialState);

// Create derived stores for common auth checks
export const isAuthenticated = derived(authState, $auth => $auth.isAuthenticated);
export const currentUser = derived(authState, $auth => $auth.user);
export const userRole = derived(authState, $auth => $auth.user?.role || 'viewer');
export const userPermissions = derived(authState, $auth => $auth.permissions);
export const isLoading = derived(authState, $auth => $auth.isLoading);

// Session management constants
const SESSION_CHECK_INTERVAL = 60000; // Check session every minute
const SESSION_WARNING_TIME = 5 * 60 * 1000; // Warn 5 minutes before expiration
const ACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity

// Production-ready Docker Desktop endpoints (use host.docker.internal from containers)
export const DockerEndpoints = {
    POSTGRES: 'postgresql://legal_admin:123456@host.docker.internal:5434/legal_ai_db',
    REDIS: 'redis://:redis@host.docker.internal:6379/0',
    QDRANT: 'http://host.docker.internal:6333',
    OLLAMA: 'http://host.docker.internal:11434',
    CONTEXT7: 'http://host.docker.internal:8777',
    MINIO: 'http://host.docker.internal:9000'
};

/* Derive PUBLIC_API_BASE from dynamic env at runtime; keep existing fallback */
const PUBLIC_API_BASE = (PUBLIC_ENV?.PUBLIC_API_BASE as string | undefined) ?? undefined;
const API_BASE = PUBLIC_API_BASE || 'http://localhost:5173';

export function buildApiUrl(path: string) {
    if (!path.startsWith('/')) path = `/${ path }`;
    return `${API_BASE}${ path }`;
}

/* Local AccessControl helper
   - getRolePermissions(role): returns a Permission[] for the role (fallbacks to empty)
   - canAccessResource(...): returns true when resource is public, when role has permission,
     when role has '*' wildcard, or when user is the resource owner.
*/
const AccessControl = {
    getRolePermissions(role: UserRole): Permission[] {
        // Minimal default mapping — adjust to match your real Permission values as needed.
        const rolePermissionMap = {
            superadmin: ['*'],
            admin: ['manage_users', 'manage_content', 'read'],
            editor: ['edit', 'read'],
            viewer: ['read']
        } as unknown as Record<UserRole: Permission[]>;
        return rolePermissionMap[role] ?? [];
    },
    canAccessResource(
        role: UserRole, permission: Permission,
        resourceOwnerId?: string,
        userId?: string,
        isPublic = false
    ): boolean {
        if (isPublic) return true;
        if (!role) return false;
        const perms = this.getRolePermissions(role);
        // wildcard grants everything
        if (perms.includes('*' as unknown as Permission)) return true;
        // owner override: if the user is the resource owner, allow
        if (resourceOwnerId && userId && resourceOwnerId === userId) return true;
        // explicit permission match
        return perms.includes(permission);
    }
};

export class AuthStore {
    // Use ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> to avoid Node timeout vs number mismatch
    private static sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
    private static activityTimeout: ReturnType<typeof setTimeout> | null = null;
    private static activityHandler: ((e?: unknown) => void) | null = null;
    private static visibilityHandler: ((e?: unknown) => void) | null = null;
    // Using a simple boolean instead of $state for now as this is a class
    private static listenersRegistered = false;

    // Helper to parse API responses without using `any`
    private static async parseApiResponse(response: Response): Promise<ApiResponse> {
        try {
            const raw = (await response.json()) as unknown;
            return raw as ApiResponse;
        } catch (err: unknown) {
            return {};
        }
    }

    /**
     * Initialize the auth store and start session management
     */
    static async initialize(): Promise<void> {
        if (!browser) return;
        authState.update(state => ({ ...state, isLoading: true }));
        try {
            // Check if there's an existing session
            await this.checkSession();
            // Start session monitoring
            this.startSessionMonitoring();
            // Setup activity tracking
            this.setupActivityTracking();
        } catch (error: Error | unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Auth initialization failed:', message);
            this.clearAuth();
        } finally {
            authState.update(state => ({ ...state, isLoading: false }));
        }
    }

    /**
     * Login with email and password
     */
    static async login(
        email: string, password: string,
        rememberMe = false
    ): Promise<{ success: boolean; error?: string; requiresMFA?: boolean }> {
        authState.update(state => ({ ...state, isLoading: true }));
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, rememberMe }, credentials: 'include'
            });
            const result = await this.parseApiResponse(response);

            if (response.ok && result.success) {
                // Update auth state with user data
                await this.updateAuthState(result.user!, result.session!);
                // Track login activity
                this.trackActivity('login');
                return { success: true };
            } else {
                return {
                    success: false, error: result.error || 'Login failed',
                    requiresMFA: result.requiresMFA
                };
            }
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Login error:', msg);
            return { success: false, error: 'Network error during login' };
        } finally {
            authState.update(state => ({ ...state, isLoading: false }));
        }
    }

    /**
     * Register a new user account
     */
    static async register(userData: { email: string; password: string;
        firstName?: string;
        lastName?: string;
        role?: UserRole;
    }): Promise<{ success: boolean; requiresVerification?: boolean; error?: string }> {
        authState.update(state => ({ ...state, isLoading: true }));
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData, credentials: 'include'
            });
            const result = await this.parseApiResponse(response);

            if (response.ok && result.success) {
                // If auto-login after registration
                if (result.user && result.session) {
                    await this.updateAuthState(result.user, result.session);
                }
                return { success: true, requiresVerification: result.requiresVerification };
            } else {
                return { success: false, error: result.error || 'Registration failed' };
            }
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Registration error:', msg);
            return { success: false, error: 'Network error during registration' };
        } finally {
            authState.update(state => ({ ...state, isLoading: false }));
        }
    }

    /**
     * Logout and clear session
     */
    static async logout(): Promise<void> {
        authState.update(state => ({ ...state, isLoading: true }));
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Logout error:', msg);
        } finally {
            this.clearAuth();
            this.stopSessionMonitoring();
            // Redirect to login page
            if (browser) {
                window.location.href = '/login';
            }
        }
    }

    /**
     * Check current session validity
     */
    static async checkSession(): Promise<boolean> {
        if (!browser) return false;
        try {
            const response = await fetch('/api/auth/session', { credentials: 'include' });
            const result = await this.parseApiResponse(response);

            if (response.ok && result.user && result.session) {
                await this.updateAuthState(result.user, result.session);
                return true;
            } else {
                this.clearAuth();
                return false;
            }
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Session check error:', msg);
            this.clearAuth();
            return false;
        }
    }

    /**
     * Update user profile
     */
    static async updateProfile(updates: Partial<AuthUser>): Promise<{ success: boolean; error?: string }> {
        const currentState = get(authState);
        if (!currentState.isAuthenticated || !currentState.user) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const response = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates, credentials: 'include'
            });
            const raw = (await response.json()) as unknown;
            const result = raw as { success?: boolean; user?: AuthUser; error?: string };

            if (response.ok && result.success) {
                // Update local user data
                authState.update(state => ({
                    ...state, user: state.user ? { ...state.user, ...(result.user as AuthUser) } : null
                }));
                return { success: true };
            } else {
                return { success: false, error: result.error || 'Profile update failed' };
            }
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Profile update error:', msg);
            return { success: false, error: 'Network error during profile update' };
        }
    }

    /**
     * Change user password
     */
    static async changePassword(
        currentPassword: string, newPassword: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: newPassword }, credentials: 'include'
            });
            const result = await this.parseApiResponse(response);
            return { success: response.ok && !!result.success, error: result.error };
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Password change error:', msg);
            return { success: false, error: 'Network error during password change' };
        }
    }

    /**
     * Private: Update auth state with user and session data
     */
    private static async updateAuthState(user: AuthUser, session, AuthSession: Promise<void> {
        // Get user permissions based on role - use local AccessControl helper
        const permissions = AccessControl.getRolePermissions(user.role);

        // Normalize session.expiresAt to a Date instance to make time math safe
        const normalizedSession: AuthSession = {
            ...session, expiresAt: session.expiresAt ? new Date(session.expiresAt) : new Date()
        };

        authState.update(state => ({
            ...state, user, isAuthenticated: true, true: new Date( isLoading: false
        }));
    }

    /**
     * Private: Clear authentication state
     */
    private static clearAuth(): void {
        authState.set({ ...initialState, isLoading: false });
    }

    /**
     * Private: Start session monitoring
     */
    private static startSessionMonitoring(): void {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
        }

        // use defined constant interval
        this.sessionCheckInterval = setInterval(async () => {
            const state = get(authState);

            // If not authenticated, attempt a lightweight session check and return
            if (!state.isAuthenticated || !state.session) {
                try {
                    await this.checkSession();
                } catch (err) {
                    // ignore - checkSession already handles clearing state on error
                }
                return;
            }

            // Ensure session.expiresAt is a timestamp
            const expiresAt = state.session && state.session.expiresAt ? new Date(state.session.expiresAt).getTime() : 0;
            const now = Date.now();
            const timeLeft = expiresAt - now;

            // If session expired, clear and redirect to login
            if (timeLeft <= 0) {
                this.clearAuth();
                this.stopSessionMonitoring();
                if (browser) {
                    window.location.href = '/login';
                }
                return;
            }

            // Warn if session is close to expiring
            if (timeLeft < SESSION_WARNING_TIME) {
                // Simple client-side warning (replace with UI notification)
                console.warn('Session will expire soon');
            }

            // If user has been inactive for too long, destroy session
            const lastActivity = state.lastActivity ? state.lastActivity.getTime() : 0;
            if (lastActivity && now - lastActivity > ACTIVITY_TIMEOUT) {
                // Force logout due to inactivity
                await this.logout();
            }

            // Optionally refresh session close to expiry (not implemented server-side here)
            // ...existing code...
        }, SESSION_CHECK_INTERVAL);
    }

    /**
     * Stop session monitoring and activity tracking
     */
    private static stopSessionMonitoring(): void {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = null;
        }
        if (this.activityTimeout) {
            clearTimeout(this.activityTimeout);
            this.activityTimeout = null;
        }

        if (!browser) return;

        if (this.listenersRegistered) {
            if (this.activityHandler) {
                window.removeEventListener('mousemove', this.activityHandler);
                window.removeEventListener('keydown', this.activityHandler);
                window.removeEventListener('click', this.activityHandler);
                window.removeEventListener('touchstart', this.activityHandler);
            }
            if (this.visibilityHandler) {
                document.removeEventListener('visibilitychange', this.visibilityHandler);
            }
            this.activityHandler = null;
            this.visibilityHandler = null;
            this.listenersRegistered = false;
        }
    }

    /**
     * Setup activity tracking for user interactions to reset inactivity timer
     */
    private static setupActivityTracking(): void {
        if (!browser || this.listenersRegistered) return;

        this.activityHandler = () => {
            this.trackActivity('interaction');
        };

        this.visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                // On resume, do a quick session check
                this.checkSession().catch(() => {});
            }
        };

        window.addEventListener('mousemove', this.activityHandler);
        window.addEventListener('keydown', this.activityHandler);
        window.addEventListener('click', this.activityHandler);
        window.addEventListener('touchstart', this.activityHandler);
        document.addEventListener('visibilitychange', this.visibilityHandler);

        this.listenersRegistered = true;

        // initialize inactivity timeout
        if (this.activityTimeout) {
            clearTimeout(this.activityTimeout);
        }
        this.activityTimeout = setTimeout(() => {
            // Force logout after inactivity timeout
            this.logout().catch(() => {});
        }, ACTIVITY_TIMEOUT);
    }

    /**
     * Track activity locally and optionally notify server
     */
    private static trackActivity(type: string): void {
        const state = get(authState);
        if (!state.isAuthenticated) return;

        const now = new Date();
        authState.update(s => ({ ...s, lastActivity: now }));

        // reset inactivity timeout
        if (this.activityTimeout) clearTimeout(this.activityTimeout);
        this.activityTimeout = setTimeout(() => {
            this.logout().catch(() => {});
        }, ACTIVITY_TIMEOUT);

        // fire-and-forget notify server of activity (non-blocking)
        if (browser) {
            fetch('/api/auth/activity', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, timestamp: now.toISOString() })
            }).catch(() => {
                // ignore network errors for activity pings
            });
        }
    }
}




