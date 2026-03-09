/**
 * Authentication Helpers with Test Fallback
 * Provides conditional authentication for development and testing
 */
import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

export interface AuthResult {
	user: {
		id: string;
		email: string;
		role: 'admin' | 'lead_prosecutor' | 'prosecutor' | 'paralegal' | 'investigator' | 'analyst' | 'viewer' | 'user';
	};
	session: unknown;
	isTestMode: boolean;
}

/**
 * Get user with conditional fallback to test mode
 * Returns authenticated user OR test user if auth is unavailable
 */
export async function getUserWithFallback(event: RequestEvent): Promise<AuthResult> {
	if (event.locals.user) {
		return {
			user: event.locals.user as AuthResult['user'],
			session: event.locals.session,
			isTestMode: false
		};
	}

	// Fallback to test mode for development/testing
	if (process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true') {
		console.log('[Auth] Auth not available, using test mode');
		return {
			user: {
				id: 'test-user-id',
				email: 'test@legal-ai.dev',
				role: 'admin'
			},
			session: {
				id: 'test-session-id',
				userId: 'test-user-id',
				fresh: false,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
			},
			isTestMode: true
		};
	}

	throw error(401, 'Authentication required');
}

/**
 * Require authentication with conditional fallback
 * Throws 401 error if auth is unavailable AND not in development mode
 */
export async function requireAuth(event: RequestEvent, allowTestMode = true): Promise<AuthResult> {
	try {
		const result = await getUserWithFallback(event);

		if (result.isTestMode && !allowTestMode) {
			throw error(401, 'Authentication required (Test mode not allowed)');
		}
		return result;
	} catch (e) {
		throw error(401, 'Authentication required');
	}
}

/**
 * Check if user has specific role
 */
export function hasRole(
	user: AuthResult['user'],
	roles: Array<
		'admin' | 'lead_prosecutor' | 'prosecutor' | 'paralegal' | 'investigator' | 'analyst' | 'viewer' | 'user'
	>
): boolean {
	return roles.includes(user.role);
}

/**
 * Require specific role with test mode fallback
 */
export async function requireRole(
	event: RequestEvent,
	roles: Array<
		'admin' | 'lead_prosecutor' | 'prosecutor' | 'paralegal' | 'investigator' | 'analyst' | 'viewer' | 'user'
	>,
	allowTestMode = true
): Promise<AuthResult> {
	const auth = await requireAuth(event, allowTestMode);

	if (!hasRole(auth.user, roles)) {
		throw error(403, 'Insufficient permissions');
	}

	return auth;
}

/**
 * Get optional user (doesn't throw error if not authenticated)
 */
export async function getOptionalUser(event: RequestEvent): Promise<AuthResult | null> {
	try {
		if (event.locals.user) {
			return {
				user: event.locals.user as AuthResult['user'],
				session: event.locals.session,
				isTestMode: false
			};
		}
		return null;
	} catch {
		return null;
	}
}
