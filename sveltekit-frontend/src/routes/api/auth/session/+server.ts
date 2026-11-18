/**
 * Session API - Lucia v3
 * Get current session or refresh/validate existing session
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

/**
 * GET /api/auth/session
 * Check if user has a valid session
 */
export const GET: RequestHandler = async ({ locals, request }) => {
	try {
		// The server hook is the single session authority. It validates Lucia cookies
		// and also supplies the explicitly configured development identity; checking
		// cookies again here made the UI report signed-out while protected routes
		// correctly accepted the same request.
		const { user, session } = locals;
		if (!user || !session) {
			return json({ authenticated: false, session: null, user: null }, {
				status: 401,
				headers: cacheControl.private
			});
		}

		const responseData = {
			authenticated: true,
			session: { id: session.id,
				userId: session.userId,
				expiresAt: session.expiresAt,
				fresh: session.fresh
			},
			user: { id: user.id,
				email: user.email ?? null,
				firstName: user.firstName ?? null,
				lastName: user.lastName ?? null,
				role: user.role ?? null,
				isActive: user.isActive ?? null,
				avatarUrl: user.avatarUrl ?? null
			}
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.private, ETag: etag }
		});
	} catch (error) {
		console.error('[Auth] Session validation error:', error);
		return json({ authenticated: false, session: null, user: null }, {
			headers: cacheControl.private
		});
	}
};



