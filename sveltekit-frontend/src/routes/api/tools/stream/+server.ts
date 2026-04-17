/**
 * POST /api/tools/stream
 *
 * SSE-streamed tool execution via gRPC ToolCallingService.ExecuteToolStream
 * (server-streaming RPC).  The client receives a sequence of ToolCallEvent
 * messages until the tool emits a 'done' event.
 *
 * Body: {
 *   requestId?:            string   — auto-generated UUID if omitted
 *   toolName:              string
 *   arguments:             Record<string, string>
 *   caseId?:               string
 *   userId?:               string   — defaults to locals.user.id
 *   retrievalConfidence?:  number
 *   message?:              string
 * }
 *
 * SSE events:
 *   event: start    — tool started executing  { requestId, toolName, elapsedMs }
 *   event: progress — incremental update      { data, elapsedMs }
 *   event: result   — final result chunk      { data, elapsedMs }
 *   event: error    — execution error         { data, elapsedMs }
 *   event: done     — stream complete         { elapsedMs }
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getToolCallingClient } from '$lib/server/grpc/tool-calling-client.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';

// ── Input schema ──────────────────────────────────────────────────────────────

const schema = z.object({
	requestId:           z.string().max(128).optional(),
	toolName:            z.string().min(1).max(128),
	arguments:           z.record(z.string(), z.string()),
	caseId:              z.string().uuid().optional(),
	userId:              z.string().max(128).optional(),
	retrievalConfidence: z.number().min(0).max(1).optional(),
	message:             z.string().max(4096).optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const req = {
		...parsed.data,
		requestId: parsed.data.requestId ?? randomUUID(),
		userId:    parsed.data.userId    ?? String(locals.user.id),
	};

	const client = getToolCallingClient();

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();
			const send = (event: string, data: unknown) =>
				controller.enqueue(enc.encode(sseFormat(event, data)));

			try {
				// retry hint — clients reconnect automatically on drop
				controller.enqueue(enc.encode('retry: 3000\n\n'));

				if (!client.isEnabled) {
					send('error', {
						requestId: req.requestId,
						toolName:  req.toolName,
						data:      'ToolCallingService is disabled',
						elapsedMs: 0,
					});
					controller.close();
					return;
				}

				for await (const evt of client.executeStream(req)) {
					send(evt.eventType, evt);
					if (evt.eventType === 'done' || evt.eventType === 'error') break;
				}
			} catch (err) {
				send('error', {
					requestId: req.requestId,
					toolName:  req.toolName,
					data:      err instanceof Error ? err.message : 'Stream error',
					elapsedMs: 0,
				});
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { headers: sseHeaders() });
};
