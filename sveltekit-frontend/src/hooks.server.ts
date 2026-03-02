/**
 * SvelteKit Server Hooks
 * Handles request/response processing and middleware
 */

import { dev } from '$app/environment';
import { deleteSessionCookie, setSessionCookie, validateSession } from '$lib/server/lucia';
import { startWorker } from '$lib/server/analysis/worker.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { startRabbitMQPipeline } from '$lib/messaging/rabbitmq-xstate-integration.js';
import { initializeQdrant } from '$lib/server/startup/qdrant-init.js';
import { warmupTemplateCache } from '$lib/server/cache/report-template-cache.js';
import type { Handle, HandleServerError } from '@sveltejs/kit';

// Start the analysis worker on server boot (idempotent)
startWorker();

// Start RabbitMQ 7-queue pipeline (XState v5 with auto-reconnect, non-blocking)
startRabbitMQPipeline().then(() => {
	console.log('[Boot] RabbitMQ consumers active');
}).catch((err) => {
	console.warn('[Boot] RabbitMQ unavailable (non-fatal):', (err as Error).message);
});

// Initialize Qdrant collections (Priority #2: auto-create missing collections)
initializeQdrant().then(() => {
	console.log('[Boot] Qdrant collections verified');
}).catch((err) => {
	console.warn('[Boot] Qdrant initialization failed (non-fatal):', (err as Error).message);
});

// Warm up template cache (Priority #10: pre-load all 10 templates on startup)
warmupTemplateCache().then(() => {
	console.log('[Boot] Template cache warmed');
}).catch((err) => {
	console.warn('[Boot] Template cache warmup failed (non-fatal):', (err as Error).message);
});

/**
 * Main request handler with Lucia v3 session validation
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Add request ID for tracing
	const requestId = crypto.randomUUID();
	event.locals.requestId = requestId;

	// Add timing information
	const startTime = Date.now();

	// === DEV BYPASS AUTH (only in development mode) ===
	if (dev && process.env.DEV_BYPASS_AUTH === 'true') {
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

	// Add timing headers + structured request logging
	const duration = Date.now() - startTime;
	response.headers.set('X-Request-ID', requestId);
	response.headers.set('X-Response-Time', `${duration}ms`);

	productionLogger.apiRequest(
		event.request.method,
		event.url.pathname,
		response.status,
		duration,
		{ requestId, userId: event.locals.user?.id }
	);

	// Cross-origin isolation headers — required for SharedArrayBuffer / threaded WASM (ORT)
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

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

	// Debug: log full stack trace to file for diagnosis
	if (dev) {
		const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
		const debugLine = `[${new Date().toISOString()}] ${event.url.pathname}: ${errMsg}\n---\n`;
		import('node:fs').then(fs => fs.appendFileSync('ssr-errors.log', debugLine)).catch(() => {});
	}

	productionLogger.error(
		`[${errorId}] Unhandled error in ${event.url.pathname}`,
		error instanceof Error ? error : new Error(String(error)),
		{ requestId: event.locals.requestId, endpoint: event.url.pathname }
	);

	return {
		message: dev ? `${error instanceof Error ? error.message : String(error)}` : 'An unexpected error occurred',
		code: errorId
	};
};