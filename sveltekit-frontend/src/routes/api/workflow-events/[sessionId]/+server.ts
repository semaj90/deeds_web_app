/**
 * GET /api/workflow-events/[sessionId]
 *
 * SSE endpoint for real-time workflow job events.
 * Consumed by WorkflowEventStream in $lib/client/workflow-event-stream.ts.
 *
 * Protocol:
 *   - Emits { type: 'SSE_CONNECTED', sessionId, timestamp } immediately on connect.
 *   - Polls Redis list `workflow:events:{sessionId}` every 2s for queued events.
 *     Workers publish events via RPUSH; this handler LPOPs and forwards them.
 *   - Closes automatically after receiving WORKFLOW_COMPLETE or WORKFLOW_ERROR,
 *     or after MAX_DURATION_MS of no terminal event.
 *   - Emits a keepalive comment every 25s to prevent proxy timeouts.
 *
 * Workers write events with:
 *   redis.rpush(`workflow:events:${sessionId}`, JSON.stringify({ type, ...data }))
 *   redis.expire(`workflow:events:${sessionId}`, 300)  // 5-min TTL
 */

import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

const POLL_INTERVAL_MS  = 2_000;
const KEEPALIVE_MS      = 25_000;
const MAX_DURATION_MS   = 5 * 60 * 1_000; // 5 minutes

const TERMINAL_TYPES = new Set(['WORKFLOW_COMPLETE', 'WORKFLOW_ERROR']);

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) {
		return new Response('Unauthorized', { status: 401 });
	}

	const sessionId = params.sessionId;
	if (!sessionId || sessionId.length > 200) {
		return new Response('Invalid sessionId', { status: 400 });
	}

	const redisKey = `workflow:events:${sessionId}`;
	const encoder  = new TextEncoder();
	let isClosed   = false;

	const stream = new ReadableStream({
		start(controller) {
			const safeEnqueue = (text: string) => {
				if (isClosed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					isClosed = true;
				}
			};

			const closeStream = () => {
				if (isClosed) return;
				isClosed = true;
				try { controller.close(); } catch { /* already closed */ }
			};

			// Timers
			let pollTimer:      ReturnType<typeof setInterval> | null = null;
			let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
			let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

			const cleanup = () => {
				if (pollTimer)       { clearInterval(pollTimer);       pollTimer = null; }
				if (keepAliveTimer)  { clearInterval(keepAliveTimer);  keepAliveTimer = null; }
				if (maxDurationTimer){ clearTimeout(maxDurationTimer); maxDurationTimer = null; }
			};

			// Send immediate SSE_CONNECTED
			safeEnqueue(
				`data: ${JSON.stringify({ type: 'SSE_CONNECTED', sessionId, timestamp: new Date().toISOString() })}\n\n`
			);

			// Keepalive comments
			keepAliveTimer = setInterval(() => {
				safeEnqueue(': keepalive\n\n');
			}, KEEPALIVE_MS);

			// Max duration guard
			maxDurationTimer = setTimeout(() => {
				safeEnqueue(
					`data: ${JSON.stringify({ type: 'SSE_ERROR', sessionId, error: 'Session timeout', timestamp: new Date().toISOString() })}\n\n`
				);
				cleanup();
				closeStream();
			}, MAX_DURATION_MS);

			// Redis poll loop — LPOP one event per tick
			const redis = getRedis();
			pollTimer = setInterval(async () => {
				if (isClosed) { cleanup(); return; }

				try {
					// Drain all queued events in one tick (up to 20 to avoid blocking)
					for (let i = 0; i < 20; i++) {
						const raw = await redis.lpop(redisKey);
						if (!raw) break;

						let event: Record<string, unknown>;
						try { event = JSON.parse(raw) as Record<string, unknown>; }
						catch { continue; }

						safeEnqueue(`data: ${JSON.stringify({ ...event, sessionId, timestamp: new Date().toISOString() })}\n\n`);

						if (TERMINAL_TYPES.has(String(event.type))) {
							cleanup();
							closeStream();
							return;
						}
					}
				} catch {
					// Redis unavailable — keep retrying until timeout
				}
			}, POLL_INTERVAL_MS);
		},

		cancel() {
			isClosed = true;
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type':      'text/event-stream',
			'Cache-Control':     'no-cache',
			'Connection':        'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
