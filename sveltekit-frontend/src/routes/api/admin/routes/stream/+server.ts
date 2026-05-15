import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool as pgPool } from '$lib/server/db/client';

const MAX_SSE_CLIENTS = 200;
const ZOMBIE_TIMEOUT_MS = 120_000;
const clients = new Map<ReadableStreamDefaultController, number>();

// Periodic zombie cleanup
setInterval(() => {
	const now = Date.now();
	for (const [ctrl, lastActive] of clients) {
		if (now - lastActive > ZOMBIE_TIMEOUT_MS) {
			clients.delete(ctrl);
			try { ctrl.close(); } catch { /* already closed */ }
		}
	}
}, 60_000).unref();

function broadcastToClients(message: Uint8Array) {
	for (const [controller] of clients) {
		try {
			controller.enqueue(message);
			clients.set(controller, Date.now());
		} catch {
			clients.delete(controller);
		}
	}
}

export function _broadcastRouteUpdate(data: unknown) {
	broadcastToClients(new TextEncoder().encode(`event: route_updated\ndata: ${JSON.stringify(data)}\n\n`));
}

export function _broadcastAgentProgress(data: unknown) {
	broadcastToClients(new TextEncoder().encode(`event: agent_progress\ndata: ${JSON.stringify(data)}\n\n`));
}

export function _broadcastKBSync(data: unknown) {
	broadcastToClients(new TextEncoder().encode(`event: kb_synced\ndata: ${JSON.stringify(data)}\n\n`));
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	let heartbeatId: ReturnType<typeof setInterval>;
	let monitorId: ReturnType<typeof setInterval>;
	let activeController: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(controller) {
			// Reject if at capacity
			if (clients.size >= MAX_SSE_CLIENTS) {
				controller.close();
				return;
			}
			activeController = controller;
			clients.set(controller, Date.now());

			// Welcome message
			const welcomeMsg = `event: connected\ndata: ${JSON.stringify({ message: 'Connected to route explorer stream' })}\n\n`;
			controller.enqueue(new TextEncoder().encode(welcomeMsg));

			// Heartbeat
			heartbeatId = setInterval(() => {
				try {
					controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
					clients.set(controller, Date.now());
				} catch {
					clearInterval(heartbeatId);
					clearInterval(monitorId);
					clients.delete(controller);
				}
			}, 30000);

			// Monitor for changes (with error cleanup + LIMIT)
			monitorId = setInterval(async () => {
				try {
					const result = await pgPool.query(`
						SELECT
							file_path,
							COUNT(*) as error_count,
							MAX(created_at) as last_updated
						FROM raw_error_embeddings
						WHERE source = 'svelte-check'
						  AND created_at > NOW() - INTERVAL '10 seconds'
						GROUP BY file_path
						LIMIT 100
					`);

					if (result.rows.length > 0) {
						for (const row of result.rows) {
							controller.enqueue(
								new TextEncoder().encode(
									`event: route_updated\ndata: ${JSON.stringify({
										id: row.file_path,
										path: row.file_path,
										errors: parseInt(row.error_count),
										timestamp: row.last_updated
									})}\n\n`
								)
							);
						}
					}
				} catch (error) {
					console.error('Monitor error:', error);
					// Clean up on DB failure to prevent zombie polling
					clearInterval(monitorId);
					clearInterval(heartbeatId);
					clients.delete(controller);
					try { controller.close(); } catch { /* already closed */ }
				}
			}, 5000);

		},

		cancel() {
			clearInterval(heartbeatId);
			clearInterval(monitorId);
			if (activeController) clients.delete(activeController);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
