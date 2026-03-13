/**
 * SvelteKit Server Hooks
 * Handles request/response processing and middleware
 *
 * Sprint 1 Critical Fixes:
 * - Graceful shutdown: DB pool + hard 10s deadline
 * - Request-level timeout: 30s default, 120s AI, streaming excluded
 * - VAPID key validation at startup
 * - CORS: credentials, expose-headers, PATCH method
 * - Slow request logging (>10s warning)
 */

import { dev } from '$app/environment';
import { deleteSessionCookie, setSessionCookie, validateSession } from '$lib/server/lucia';
import { startWorker } from '$lib/server/analysis/worker.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { startRabbitMQPipeline } from '$lib/messaging/rabbitmq-xstate-integration.js';
import { initializeQdrant } from '$lib/server/startup/qdrant-init.js';
import { warmupTemplateCache } from '$lib/server/cache/report-template-cache.js';
import { startIdleScanner } from '$lib/server/engagement/idle-reengagement.js';
import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema-postgres.js';
import { desc } from 'drizzle-orm';
import { cacheExport } from '$lib/server/cache/pdf-export-cache.js';
import { storeCachedResponse } from '$lib/server/ai/llm-cache.js';
import { ENV } from '$lib/server/env.server.js';
import type { Handle, HandleServerError } from '@sveltejs/kit';

// ── Request Timeout Constants ────────────────────────────────────────────
const DEFAULT_REQUEST_TIMEOUT = 30_000; // 30s for normal routes
const AI_REQUEST_TIMEOUT = 120_000;     // 120s for AI/inference routes

// ── Request Body Size Limits (Sprint 4) ──────────────────────────────────
const MAX_BODY_SIZE = 50 * 1024 * 1024;          // 50MB default
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;        // 100MB for file uploads
const UPLOAD_PATHS = ['/api/evidence/upload', '/api/vision/analyze', '/api/persons-of-interest'];

// ── Global Write Rate Limiting (Sprint 4) ────────────────────────────────
// In-memory sliding window for write endpoints — 60 writes/min per IP
const writeRateLimits = new Map<string, { count: number; resetTime: number }>();
const WRITE_RATE_WINDOW = 60_000;  // 1 minute
const WRITE_RATE_MAX = 60;         // 60 writes per minute per IP
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of writeRateLimits) {
		if (now > entry.resetTime) writeRateLimits.delete(key);
	}
}, 60_000);

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

// Idle re-engagement scanner (5-min interval, checks user activity → notifications)
startIdleScanner();

// Note: Queue consumers are registered by startRabbitMQPipeline() above
// via rabbitmq.initialize() → startConsumers() (all 7 queues)

// Option #6: Warm up export cache (pre-generate top 5 recent report exports)
warmupExportCache().then(() => {
	console.log('[Boot] Export cache warmed');
}).catch((err) => {
	console.warn('[Boot] Export cache warmup failed (non-fatal):', (err as Error).message);
});

// Option #6: Warm up LLM cache (pre-cache 5 common legal queries)
warmupLLMCache().then(() => {
	console.log('[Boot] LLM cache warmed');
}).catch((err) => {
	console.warn('[Boot] LLM cache warmup failed (non-fatal):', (err as Error).message);
});

// ── VAPID Key Validation ─────────────────────────────────────────────────
if (ENV.VAPID_PUBLIC_KEY && ENV.VAPID_PRIVATE_KEY) {
	console.log('[Boot] VAPID keys configured — Web Push enabled');
} else {
	console.warn('[Boot] VAPID keys empty — Web Push notifications disabled. Generate with: npx web-push generate-vapid-keys --json');
}

/**
 * Option #6: Warm up export cache with top 5 recent reports
 * Pre-generates HTML, Markdown, and JSON exports for frequently accessed reports
 */
async function warmupExportCache(): Promise<void> {
	try {
		const recentReports = await db
			.select()
			.from(reports)
			.orderBy(desc(reports.createdAt))
			.limit(5);

		if (recentReports.length === 0) {
			console.log('[Boot] Export warmup: No reports found, skipping');
			return;
		}

		const formats = ['html', 'markdown', 'json'] as const;
		let cached = 0;

		for (const report of recentReports) {
			for (const format of formats) {
				try {
					const content = format === 'json'
						? JSON.stringify({ id: report.id, title: report.title, content: report.content }, null, 2)
						: format === 'markdown'
						? `# ${report.title}\n\n${report.content || ''}`
						: `<html><head><title>${report.title}</title></head><body><h1>${report.title}</h1><div>${report.content || ''}</div></body></html>`;

					const contentType = format === 'json'
						? 'application/json'
						: format === 'markdown'
						? 'text/markdown'
						: 'text/html';

					const filename = `${report.title.replace(/[^a-z0-9]/gi, '_')}.${format}`;

					await cacheExport(
						report.id,
						format,
						content,
						contentType,
						filename,
						report.updatedAt
					);
					cached++;
				} catch (err) {
					console.warn(`[Boot] Export warmup failed for ${report.id}:${format}:`, (err as Error).message);
				}
			}
		}

		console.log(`[Boot] Export warmup: Cached ${cached} exports (${recentReports.length} reports x ${formats.length} formats)`);
	} catch (err) {
		console.warn('[Boot] Export warmup failed:', (err as Error).message);
	}
}

/**
 * Option #6: Warm up LLM cache with common legal queries
 */
async function warmupLLMCache(): Promise<void> {
	try {
		const commonQueries = [
			{
				query: 'What is the statute of limitations for breach of contract?',
				context: 'general legal research',
				response: 'The statute of limitations for breach of contract varies by jurisdiction. In most U.S. states, it ranges from 3-6 years for written contracts and 2-4 years for oral contracts. California: 4 years (written), 2 years (oral). New York: 6 years. Texas: 4 years. Always consult local statutes and recent case law, as exceptions apply for fraud, tolling, and discovery rules.'
			},
			{
				query: 'How do I file a motion to suppress evidence?',
				context: 'criminal procedure',
				response: 'To file a motion to suppress evidence: 1) Draft the motion citing Fourth Amendment violations or other legal grounds. 2) Include supporting affidavits and case law (Mapp v. Ohio, Miranda v. Arizona). 3) File with the court clerk before trial. 4) Serve opposing counsel. 5) Attend the suppression hearing. Grounds include illegal search/seizure, lack of warrant, Miranda violations, chain of custody issues.'
			},
			{
				query: 'What are the elements of negligence?',
				context: 'tort law',
				response: 'The four elements of negligence are: 1) Duty - defendant owed plaintiff a legal duty of care. 2) Breach - defendant breached that duty through action or inaction. 3) Causation - breach was the actual and proximate cause of harm. 4) Damages - plaintiff suffered actual injury or loss. All four must be proven by a preponderance of evidence for a successful negligence claim.'
			},
			{
				query: 'What is hearsay and what are the exceptions?',
				context: 'evidence law',
				response: 'Hearsay is an out-of-court statement offered to prove the truth of the matter asserted (FRE 801). It is generally inadmissible unless an exception applies. Key exceptions: present sense impression, excited utterance, then-existing mental/emotional/physical condition, statements for medical diagnosis, recorded recollection, business records, public records, learned treatises, former testimony, dying declarations, statements against interest.'
			},
			{
				query: 'How long do I have to respond to discovery requests?',
				context: 'civil procedure',
				response: 'Under Federal Rules of Civil Procedure: Interrogatories - 30 days (FRCP 33). Requests for Production - 30 days (FRCP 34). Requests for Admission - 30 days (FRCP 36). Time starts from service date. Extensions can be requested by stipulation or court order. State court deadlines may vary - check local rules. Failure to respond timely may result in waiver of objections or court sanctions.'
			}
		];

		let cached = 0;
		const OLLAMA_URL = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
		const EMBEDDING_MODEL = 'embeddinggemma:latest';

		for (const item of commonQueries) {
			try {
				const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: item.query }),
					signal: AbortSignal.timeout(8000)
				});

				if (!embedRes.ok) {
					console.warn(`[Boot] LLM warmup: Embedding failed for "${item.query.slice(0, 30)}..."`);
					continue;
				}

				const embedData = await embedRes.json();
				const queryEmbedding = embedData.embedding;

				if (!Array.isArray(queryEmbedding)) {
					console.warn(`[Boot] LLM warmup: Invalid embedding for "${item.query.slice(0, 30)}..."`);
					continue;
				}

				await storeCachedResponse({
					query: item.query,
					queryEmbedding,
					context: item.context,
					response: item.response,
					model: 'gemma3-legal:latest',
					confidence: 0.95
				});

				cached++;
			} catch (err) {
				console.warn(`[Boot] LLM warmup failed for "${item.query.slice(0, 30)}...":`, (err as Error).message);
			}
		}

		console.log(`[Boot] LLM warmup: Cached ${cached}/${commonQueries.length} common queries`);
	} catch (err) {
		console.warn('[Boot] LLM warmup failed:', (err as Error).message);
	}
}


/**
 * Main request handler with Lucia v3 session validation
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Add request ID for tracing
	const requestId = crypto.randomUUID();
	event.locals.requestId = requestId;

	// Add timing information
	const startTime = Date.now();

	// === CORS for API routes (Sprint 1: credentials + expose-headers + PATCH) ===
	if (event.url.pathname.startsWith('/api/')) {
		const allowedOrigin = dev ? '*' : (ENV.PUBLIC_API_URL || event.url.origin);

		if (event.request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': allowedOrigin,
					'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
					'Access-Control-Allow-Credentials': 'true',
					'Access-Control-Expose-Headers': 'X-Request-ID, X-Response-Time',
					'Access-Control-Max-Age': '86400',
				},
			});
		}
	}

	// === REQUEST BODY SIZE LIMIT (Sprint 4) ===
	if (event.url.pathname.startsWith('/api/') && event.request.method !== 'GET' && event.request.method !== 'HEAD') {
		const contentLength = parseInt(event.request.headers.get('content-length') || '0', 10);
		const isUpload = UPLOAD_PATHS.some(p => event.url.pathname.startsWith(p));
		const limit = isUpload ? MAX_UPLOAD_SIZE : MAX_BODY_SIZE;

		if (contentLength > limit) {
			return new Response(
				JSON.stringify({ error: 'Payload too large', maxBytes: limit }),
				{ status: 413, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } }
			);
		}
	}

	// === GLOBAL WRITE RATE LIMITING (Sprint 4) ===
	if (event.url.pathname.startsWith('/api/')
		&& ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method)
		&& !event.url.pathname.startsWith('/api/health')) {
		const forwarded = event.request.headers.get('x-forwarded-for');
		const ip = forwarded ? forwarded.split(',')[0].trim() : event.getClientAddress?.() ?? 'unknown';
		const now = Date.now();
		const entry = writeRateLimits.get(ip);

		if (!entry || now > entry.resetTime) {
			writeRateLimits.set(ip, { count: 1, resetTime: now + WRITE_RATE_WINDOW });
		} else if (entry.count >= WRITE_RATE_MAX) {
			const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
			return new Response(
				JSON.stringify({ error: 'Rate limit exceeded', retryAfter }),
				{
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': String(retryAfter),
						'X-Request-ID': requestId
					}
				}
			);
		} else {
			entry.count++;
		}
	}

	// === DEV BYPASS AUTH (only in development mode) ===
	if (dev && process.env.DEV_BYPASS_AUTH === 'true') {
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

	// === CENTRALIZED AUTH GUARDS (Phase A2 — deny-by-default) ===
	if (event.url.pathname.startsWith('/api/')) {
		const path = event.url.pathname;

		// Public routes (no auth needed) — explicitly allowlisted
		const PUBLIC = ['/api/health', '/api/auth', '/api/metrics', '/api/system',
			'/api/ping', '/api/infrastructure', '/api/docs', '/api/glossary',
			'/api/kb', '/api/precedents', '/api/statutes', '/api/ollama'];

		// Admin-only routes (require admin role)
		const ADMIN_ONLY = ['/api/admin', '/api/codebase-index', '/api/codebase', '/api/phase89',
			'/api/phase72', '/api/phase82', '/api/error-brain', '/api/errors', '/api/internal',
			'/api/cache', '/api/consolidation', '/api/gpu', '/api/gpu-wasm', '/api/indexing',
			'/api/pipeline', '/api/qlora', '/api/rabbitmq', '/api/security', '/api/topology',
			'/api/worker', '/api/generate-cluster'];

		const isPublic = PUBLIC.some(p => path.startsWith(p));

		if (!isPublic) {
			// Deny-by-default: ALL non-public API routes require authentication
			if (!event.locals.user) {
				return new Response(
					JSON.stringify({ error: 'Authentication required' }),
					{ status: 401, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } }
				);
			}

			// Admin-only routes additionally require admin role
			const needsAdmin = ADMIN_ONLY.some(p => path.startsWith(p));
			if (needsAdmin && event.locals.user?.role !== 'admin') {
				return new Response(
					JSON.stringify({ error: 'Admin access required' }),
					{ status: 403, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } }
				);
			}
		}
	}

	// === Resolve with request-level timeout (Sprint 1) ===
	let response: Response;
	const isStreamRoute = event.url.pathname.includes('/stream')
		|| event.url.pathname.startsWith('/api/sse/')
		|| event.url.pathname.startsWith('/api/routes');
	const isAIRoute = event.url.pathname.startsWith('/api/ai/')
		|| event.url.pathname.startsWith('/api/nlp/')
		|| event.url.pathname.startsWith('/api/rag/')
		|| event.url.pathname.startsWith('/api/synthesis/')
		|| event.url.pathname.startsWith('/api/evidence/upload');

	if (isStreamRoute) {
		// No timeout for SSE / streaming routes
		response = await resolve(event);
	} else {
		const timeout = isAIRoute ? AI_REQUEST_TIMEOUT : DEFAULT_REQUEST_TIMEOUT;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			response = await Promise.race([
				resolve(event),
				new Promise<Response>((_, reject) => {
					controller.signal.addEventListener('abort', () => {
						reject(new Error(`Request timeout after ${timeout}ms`));
					});
				})
			]);
		} catch (err) {
			clearTimeout(timer);
			const msg = err instanceof Error ? err.message : 'Request timeout';
			console.warn(`[Timeout] ${event.request.method} ${event.url.pathname} — ${msg}`);
			return new Response(JSON.stringify({ error: 'Request timeout', timeout }), {
				status: 504,
				headers: {
					'Content-Type': 'application/json',
					'X-Request-ID': requestId
				}
			});
		}
		clearTimeout(timer);
	}

	// Add timing headers + structured request logging
	const duration = Date.now() - startTime;
	response.headers.set('X-Request-ID', requestId);
	response.headers.set('X-Response-Time', `${duration}ms`);

	// Slow request warning (Sprint 1)
	if (duration > 10_000) {
		console.warn(`[Slow] ${event.request.method} ${event.url.pathname} took ${duration}ms`);
	}

	productionLogger.apiRequest(
		event.request.method,
		event.url.pathname,
		response.status,
		duration,
		{ requestId, userId: event.locals.user?.id }
	);

	// CORS origin header on API responses (Sprint 1: credentials + expose-headers)
	if (event.url.pathname.startsWith('/api/')) {
		const allowedOrigin = dev ? '*' : (ENV.PUBLIC_API_URL || event.url.origin);
		response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
		response.headers.set('Access-Control-Allow-Credentials', 'true');
		response.headers.set('Access-Control-Expose-Headers', 'X-Request-ID, X-Response-Time');
	}

	// Cross-origin isolation headers — required for SharedArrayBuffer / threaded WASM (ORT)
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

	// Security headers (production only — avoid breaking HMR in dev)
	if (!dev) {
		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('X-Frame-Options', 'DENY');
		response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		response.headers.set('Content-Security-Policy',
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
		);
	}

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
		code: errorId,
		requestId: event.locals.requestId,
		timestamp: new Date().toISOString()
	};
};

// ── Graceful Shutdown Orchestrator (Sprint 1: DB pool + hard deadline) ───
const SHUTDOWN_TIMEOUT = 10_000; // 10s hard deadline
let shuttingDown = false;

if (typeof process !== 'undefined') {
	const shutdown = async (signal: string) => {
		if (shuttingDown) {
			console.log(`[Shutdown] ${signal} received again — forcing exit`);
			process.exit(1);
		}
		shuttingDown = true;
		console.log(`[Shutdown] ${signal} received, closing connections...`);

		// Hard deadline: if graceful shutdown takes too long, force exit
		const hardTimer = setTimeout(() => {
			console.error('[Shutdown] Hard timeout reached — forcing exit');
			process.exit(1);
		}, SHUTDOWN_TIMEOUT);
		hardTimer.unref(); // Don't keep process alive just for this timer

		try {
			// Close infrastructure connections (Redis, Neo4j, RabbitMQ)
			const { closeAllConnections } = await import('$lib/server/connections/connection-pool.js');
			await closeAllConnections();
		} catch (err) {
			console.error('[Shutdown] Error closing infrastructure:', (err as Error).message);
		}

		try {
			// Close DB pools (Sprint 1 fix: was missing!)
			const { closeConnections } = await import('$lib/server/db/client');
			await closeConnections();
		} catch (err) {
			console.error('[Shutdown] Error closing DB pools:', (err as Error).message);
		}

		productionLogger.shutdown();
		console.log('[Shutdown] All connections closed');
	};

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
