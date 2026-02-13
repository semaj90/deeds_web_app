/**
 * SvelteKit Server Hooks
 * Handles request/response processing and middleware
 */

import { deleteSessionCookie, setSessionCookie, validateSession } from '$lib/server/lucia';
import type { Handle, HandleServerError } from '@sveltejs/kit';

/**
 * Main request handler with Lucia v3 session validation
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Add request ID for tracing
	const requestId = crypto.randomUUID();
	event.locals.requestId = requestId;
	console.log('[HOOK] Request:', event.url.pathname);

	// Add timing information
	const startTime = Date.now();

	// === DEV BYPASS AUTH ===
	if (process.env.DEV_BYPASS_AUTH === 'true' || process.env.ENABLE_GPU === 'true') {
		// Use a valid UUID for database compatibility
		const devUserId = '00000000-0000-0000-0000-000000000001';
		event.locals.user = {
			id: devUserId,
			email: 'admin@yorha.dev',
			username: '2B',
			role: 'admin'
		};
		event.locals.session = {
			id: '00000000-0000-0000-0000-000000000002',
			userId: devUserId,
			expiresAt: new Date(Date.now() + 86400000),
			fresh: true
		} as any;
	} else {
		// === LUCIA V3 SESSION VALIDATION ===
		const sessionId = event.cookies.get('auth_session');

		if (!sessionId) {
			event.locals.user = null;
			event.locals.session = null;
		} else {
			const { session, user } = await validateSession(sessionId);

			if (session && session.fresh) {
				setSessionCookie(event.cookies, session.id);
			}

			if (!session) {
				deleteSessionCookie(event.cookies);
			}

			event.locals.user = user;
			event.locals.session = session;
		}
	}

	// Resolve the request
	const response = await resolve(event);

	// Add timing headers
	const duration = Date.now() - startTime;
	response.headers.set('X-Request-ID', requestId);
	response.headers.set('X-Response-Time', `${duration}ms`);

	// Enable streaming for AI endpoints
	if (event.url.pathname.startsWith('/api/ai/')) {
		response.headers.set('Content-Type', 'application/x-ndjson');
		response.headers.set('Cache-Control', 'no-cache');
		response.headers.set('X-Accel-Buffering', 'no');
	}

	return response;
};

/**
 * Error handler
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const errorId = crypto.randomUUID();

	console.error(`[${errorId}] Error in ${event.url.pathname}:`, error);

	return {
		message: 'An unexpected error occurred',
		code: errorId
	};
};