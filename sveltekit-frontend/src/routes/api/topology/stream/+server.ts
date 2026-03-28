import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool as pgPool } from '$lib/server/db/client';
import { extractComponent } from '$lib/server/utils/extract-component.js';
import { sseHeaders } from '$lib/server/streaming/sse-utils.js';

const clients = new Set<ReadableStreamDefaultController>();

// Notify all clients of updates (prefixed with _ for SvelteKit export compliance)
export function _broadcastUpdate(event: string, data: unknown) {
	const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	clients.forEach(controller => {
		try {
			controller.enqueue(new TextEncoder().encode(message));
		} catch (error) {
			// Client disconnected, will be removed on next iteration
		}
	});
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	let heartbeatId: ReturnType<typeof setInterval>;
	let pollId: ReturnType<typeof setInterval>;
	let activeController: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(controller) {
			activeController = controller;
			clients.add(controller);

			// Send initial connection message
			const welcomeMsg = `event: connected\ndata: ${JSON.stringify({ message: 'Connected to topology stream' })}\n\n`;
			controller.enqueue(new TextEncoder().encode(welcomeMsg));

			// Heartbeat to keep connection alive
			heartbeatId = setInterval(() => {
				try {
					controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
				} catch {
					clearInterval(heartbeatId);
					clearInterval(pollId);
					clients.delete(controller);
				}
			}, 30000);

			// Poll for changes every 5 seconds
			pollId = setInterval(async () => {
				try {
					// Check for recent error changes
					const result = await pgPool.query(`
						SELECT
							file_path, error_code,
							COUNT(*) as error_count,
							MAX(created_at) as last_updated
						FROM raw_error_embeddings
						WHERE source = 'svelte-check'
						  AND created_at > NOW() - INTERVAL '10 seconds'
						GROUP BY file_path, error_code
					`);

					if (result.rows.length > 0) {
						for (const row of result.rows) {
							const component = extractComponent(row.file_path);
							controller.enqueue(
								new TextEncoder().encode(
									`event: node_updated\ndata: ${JSON.stringify({
										id: component,
										errors: row.error_count,
										timestamp: row.last_updated
									})}\n\n`
								)
							);
						}
					}
				} catch (error) {
					console.error('SSE poll error:', error);
				}
			}, 5000);

		},

		cancel() {
			clearInterval(heartbeatId);
			clearInterval(pollId);
			if (activeController) clients.delete(activeController);
		}
	});

	return new Response(stream, { headers: sseHeaders() });
};

