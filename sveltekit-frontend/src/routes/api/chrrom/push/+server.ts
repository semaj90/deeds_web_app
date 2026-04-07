/** GET /api/chrrom/push — SSE stream for real-time CHR pattern broadcasting
 *  POST /api/chrrom/push — Generate patterns and broadcast to all connected clients */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { generateCHRPatterns } from '$lib/server/chrrom/patterns.js';
import type { PrecomputeContext } from '$lib/server/chrrom/patterns.js';
import { addClient, removeClient, broadcastPatterns } from '$lib/server/chrrom/bus.js';

export const GET: RequestHandler = async () => {
	const encoder = new TextEncoder();
	let client: { write: (chunk: string) => void } | null = null;

	const stream = new ReadableStream({
		start(controller) {
			client = {
				write: (chunk: string) => {
					try {
						controller.enqueue(encoder.encode(chunk));
					} catch {
						// Controller closed
					}
				},
			};
			addClient(client);
			controller.enqueue(encoder.encode('event: ping\ndata: {"ok":true}\n\n'));
		},
		cancel() {
			if (client) removeClient(client);
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const ctx = (await request.json()) as PrecomputeContext;
		const patterns = await generateCHRPatterns(ctx);
		broadcastPatterns(patterns);
		return json({ ok: true, count: patterns.length });
	} catch (err) {
		console.error('[chrrom/push] error:', err);
		return json({ ok: false, count: 0 });
	}
};