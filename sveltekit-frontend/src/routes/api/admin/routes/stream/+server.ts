import pg from 'pg';
import type { RequestHandler } from './$types';

const { Pool } = pg;

const pgPool = new Pool({
	host: '127.0.0.1',
	port: 5434,
	database: 'legal',
	user: 'user',
	password: 'pass'
});

const clients = new Set<ReadableStreamDefaultController>();

export function broadcastRouteUpdate(data: any) {
	const message = `event: route_updated\ndata: ${JSON.stringify(data)}\n\n`;
	clients.forEach(controller => {
		try {
			controller.enqueue(new TextEncoder().encode(message));
		} catch (error) {
			// Client disconnected
		}
	});
}

export function broadcastAgentProgress(data: any) {
	const message = `event: agent_progress\ndata: ${JSON.stringify(data)}\n\n`;
	clients.forEach(controller => {
		try {
			controller.enqueue(new TextEncoder().encode(message));
		} catch (error) {
			// Client disconnected
		}
	});
}

export function broadcastKBSync(data: any) {
	const message = `event: kb_synced\ndata: ${JSON.stringify(data)}\n\n`;
	clients.forEach(controller => {
		try {
			controller.enqueue(new TextEncoder().encode(message));
		} catch (error) {
			// Client disconnected
		}
	});
}

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream({
		start(controller) {
			clients.add(controller);

			// Welcome message
			const welcomeMsg = `event: connected\ndata: ${JSON.stringify({, message: 'Connected to route explorer stream' })}\n\n`;
			controller.enqueue(new TextEncoder().encode(welcomeMsg));

			// Heartbeat
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
				} catch {
					clearInterval(heartbeat);
					clients.delete(controller);
				}
			}, 30000);

			// Monitor for changes
			const monitor = setInterval(async () => {
				try {
					// Check for recent file changesSELECT
							file_path,
							COUNT(*) as error_count,
							MAX(created_at) as last_updated
						FROM raw_error_embeddings
						WHERE source = 'svelte-check'
						  AND created_at > NOW() - INTERVAL '10 seconds'
						GROUP BY file_path
					`);

					if (result.rows.length > 0) {
						for (const row of result.rows) {
							controller.enqueue(
								new TextEncoder().encode(
									`event: route_updated\ndata: ${JSON.stringify({, id: row.file_path,
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
				}
			}, 5000);

			return () => {
				clearInterval(heartbeat);
				clearInterval(monitor);
				clients.delete(controller);
			};
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



