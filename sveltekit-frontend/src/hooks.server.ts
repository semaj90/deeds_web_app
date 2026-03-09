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
import { startIdleScanner } from '$lib/server/engagement/idle-reengagement.js';
import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema-postgres.js';
import { desc } from 'drizzle-orm';
import { cacheExport } from '$lib/server/cache/pdf-export-cache.js';
import { storeCachedResponse } from '$lib/server/ai/llm-cache.js';
import { ENV } from '$lib/server/env.server.js';
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

// Idle re-engagement scanner (5-min interval, checks user activity → notifications)
startIdleScanner();

// Start typed RabbitMQ queue workers (concrete consumers for 4 queues)
startQueueWorkers().then(() => {
	console.log('[Boot] Queue workers active');
}).catch((err) => {
	console.warn('[Boot] Queue workers failed (non-fatal):', (err as Error).message);
});

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
		const OLLAMA_URL = 'http://localhost:11434';
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
 * Start typed RabbitMQ queue workers via WorkerRegistry.
 * All 7 queues get consumers. Partial failure = degraded, not crash.
 */
async function startQueueWorkers(): Promise<void> {
	const { createDefaultRegistry } = await import('$lib/server/queue/queue-worker.js');

	const registry = createDefaultRegistry();
	const result = await registry.startAll();
	console.log(`[Boot] Queue workers: ${result.started}/${result.started + result.failed} started`);

	if (result.errors.length > 0) {
		console.warn('[Boot] Queue worker errors:', result.errors.join('; '));
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

	// === CORS for API routes ===
	if (event.url.pathname.startsWith('/api/')) {
		const allowedOrigin = dev ? '*' : (ENV.PUBLIC_API_URL || event.url.origin);

		if (event.request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': allowedOrigin,
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
					'Access-Control-Max-Age': '86400',
				},
			});
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

	// CORS origin header on API responses
	if (event.url.pathname.startsWith('/api/')) {
		const allowedOrigin = dev ? '*' : (ENV.PUBLIC_API_URL || event.url.origin);
		response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
	}

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

// ── Graceful Shutdown Orchestrator ──────────────────────────────────────
if (typeof process !== 'undefined') {
	const shutdown = async (signal: string) => {
		console.log(`[Shutdown] ${signal} received, closing connections...`);
		try {
			const { closeAllConnections } = await import('$lib/server/connections/connection-pool.js');
			await closeAllConnections();
		} catch (err) {
			console.error('[Shutdown] Error closing connections:', (err as Error).message);
		}
		productionLogger.shutdown();
		console.log('[Shutdown] All connections closed');
	};

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
