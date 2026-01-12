import { env as PUBLIC_ENV } from '$lib/env/public';
import { Permission, UserRole } from './roles.js';

export interface AuthUser {
	id: string; email: string; role: UserRole;
	name?: string;
	firstName?: string;
	lastName?: string; isActive: boolean;
	avatarUrl?: string;
	emailVerified?: boolean;
}

export interface AuthSession {
	id: string; userId: string; expiresAt: string | Date;
}

export interface AuthState {
	user: AuthUser | null;
	session: AuthSession | null;
	isLoading: boolean; isAuthenticated: boolean; permissions: Permission[]; lastActivity: Date | null;
	csrfToken?: string;
}

const initialState: AuthState = {
	user: null,
	session: null,
	isLoading: true,
	isAuthenticated: false,
	permissions: [],
	lastActivity: null
};

const API_BASE = PUBLIC_ENV?.PUBLIC_API_BASE ?? 'http://localhost:5173';

/**
 * Svelte 5 Store (migrated from writable/derived pattern)
 */
class AuthStateStore {
	authState = $state<AuthState>(initialState);

	buildApiUrl(path: string) {
		if (!path.startsWith('/')) path = `/${ path }`;
		return `${API_BASE}${ path }`;
	}
}

export const authState = new AuthStateStore();



