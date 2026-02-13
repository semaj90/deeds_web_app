/**
 * Session API - Lucia v3
 * Get current session or refresh/validate existing session
 */

import { deleteSessionCookie, setSessionCookie, validateSession } from '$lib/server/lucia';
import { json, type RequestHandler } from '@sveltejs/kit';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET /api/auth/session
 * Check if user has a valid session
 */
export const GET: RequestHandler = async ({ cookies }) => {
	try {
		const sessionId = cookies.get('auth_session');

		if (!sessionId) {
			return json({ authenticated: false, user: null }, { status: 401 });
		}

		// Validate session with Lucia v3
		const { session, user } = await validateSession(sessionId);

		if (!session || !user) {
			// Session invalid, clear cookie
			deleteSessionCookie(cookies);
			return json({ authenticated: false, user: null }, { status: 401 });
		}

		// Refresh session cookie if needed (Lucia automatically handles session refresh)
		setSessionCookie(cookies, session.id);

		return json({
			authenticated: true,
			session: { id: session.id,
				userId: session.userId,
				expiresAt: session.expiresAt,
				fresh: session.fresh
			},
			user: { id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				role: user.role,
				isActive: user.isActive,
				avatarUrl: user.avatarUrl
			}
		});
	} catch (error) {
		console.error('[Auth] Session validation error:', error);
		return json({ error: 'Session validation failed' }, { status: 500 });
	}
};



