/**
 * Authentication helpers that trust the user/session already resolved by hooks.server.ts.
 */
import { error, type RequestEvent } from '@sveltejs/kit';

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
 * Get the authenticated user resolved by hooks.server.ts.
 * In development this may be a validated session or the explicit dev bypass user.
 */
export async function getUserWithFallback(event: RequestEvent): Promise<AuthResult> {
	if (event.locals.user) {
		return {
			user: event.locals.user as AuthResult['user'],
			session: event.locals.session,
			isTestMode: false
		};
	}

	throw error(401, 'Authentication required');
}

/**
 * Require authentication using the resolved request user.
 */
export async function requireAuth(event: RequestEvent, allowTestMode = true): Promise<AuthResult> {
  const result = await getUserWithFallback(event);

  if (result.isTestMode && !allowTestMode) {
    throw error(401, 'Authentication required (Test mode not allowed)');
  }

  return result;
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
