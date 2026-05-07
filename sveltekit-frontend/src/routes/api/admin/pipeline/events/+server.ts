/**
 * GET /api/admin/pipeline/events — SSE stream of PipelineEvents
 *
 * Tries Redis XREAD (stream: pipeline:events) first.
 * Falls back to polling memory/pipeline-events.jsonl every 2s.
 *
 * Query params:
 *   since  — ISO timestamp; only events after this are emitted
 *   last   — integer; emit the last N events on connect (default 20)
 *
 * Auth: requires locals.user (standard admin auth guard).
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PipelineEvent } from '$lib/server/analytics/event-logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../../../../..');
const ROLLING_LOG = resolve(ROOT, 'memory/pipeline-events.jsonl');

function readRollingLog(since?: Date, last = 20): PipelineEvent[] {
	try {
		if (!existsSync(ROLLING_LOG)) return [];
		const lines = readFileSync(ROLLING_LOG, 'utf-8')
			.split('\n')
			.filter(Boolean);
		const events: PipelineEvent[] = lines
			.map((l) => {
				try { return JSON.parse(l) as PipelineEvent; } catch { return null; }
			})
			.filter((e): e is PipelineEvent => e !== null);
		const filtered = since
			? events.filter((e) => new Date(e.ts) > since)
			: events.slice(-last);
		return filtered.slice(-last);
	} catch {
		return [];
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const sinceParam = url.searchParams.get('since');
	const last = Math.min(parseInt(url.searchParams.get('last') ?? '20', 10), 200);
	const since = sinceParam ? new Date(sinceParam) : undefined;

	// Try Redis XREAD with SSE streaming
	let useRedis = false;
	let redisClient: import('ioredis').Redis | null = null;
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		redisClient = getRedis();
		useRedis = true;
	} catch { /* Redis not available */ }

	const encoder = new TextEncoder();
	function sse(event: string, data: unknown): Uint8Array {
		return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	}

	const stream = new ReadableStream({
		async start(controller) {
			// Send backlog immediately
			const backlog = readRollingLog(since, last);
			for (const evt of backlog) {
				controller.enqueue(sse('pipeline_event', evt));
			}
			controller.enqueue(sse('backlog_end', { count: backlog.length }));

			if (useRedis && redisClient) {
				// Stream new events from Redis xread (blocking, 5s timeout loop)
				let lastId = '$';
				const interval = setInterval(async () => {
					try {
						const results = await (redisClient as import('ioredis').Redis).xread(
							'COUNT', '50', 'BLOCK', '0', 'STREAMS', 'pipeline:events', lastId
						);
						if (results) {
							for (const [, messages] of results as Array<[string, Array<[string, string[]]>]>) {
								for (const [id, fields] of messages) {
									lastId = id;
									const evt: Record<string, string> = {};
									for (let i = 0; i < fields.length; i += 2) {
										evt[fields[i]] = fields[i + 1];
									}
									controller.enqueue(sse('pipeline_event', evt));
								}
							}
						}
					} catch {
						// Redis unavailable — fall back to file polling handled below
					}
				}, 2000);

				// Cleanup when client disconnects
				controller.close = () => { clearInterval(interval); };
			} else {
				// File-poll fallback: check rolling log every 2s for new lines
				let lastSeen = new Date();
				const poll = setInterval(() => {
					const newEvents = readRollingLog(lastSeen, 50);
					if (newEvents.length) {
						lastSeen = new Date(newEvents[newEvents.length - 1].ts);
						for (const evt of newEvents) {
							controller.enqueue(sse('pipeline_event', evt));
						}
					}
				}, 2000);

				controller.close = () => { clearInterval(poll); };
			}
		},
		cancel() {
			// Cleanup handled in stream.start via overridden close
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
