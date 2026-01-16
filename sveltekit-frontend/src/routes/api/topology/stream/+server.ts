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

// Notify all clients of updates
export function broadcastUpdate(event: string, data: any) {
	const message = `event: ${ event }\ndata: ${JSON.stringify(data)}\n\n`;
	clients.forEach(controller => {
		try {
			controller.enqueue(new TextEncoder().encode(message));
		} catch (error) {
			// Client disconnected, will be removed on next iteration
		}
	});
}

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream({
		start(controller) {
			clients.add(controller);

			// Send initial connection message
			const welcomeMsg = `event: connected\ndata: ${JSON.stringify({ message: 'Connected to topology stream' })}\n\n`;
			controller.enqueue(new TextEncoder().encode(welcomeMsg));

			// Heartbeat to keep connection alive
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
				} catch {
					clearInterval(heartbeat);
					clients.delete(controller);
				}
			}, 30000);

			// Poll for changes every 5 seconds
			const pollInterval = setInterval(async () => {
				try {
					// Check for recent error changes$1;$2						SELECT
							file_path,
							error_code,
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
									`event: node_updated\ndata: ${JSON.stringify({ id: component,
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

			// Cleanup on disconnect
			return () => {
				clearInterval(heartbeat);
				clearInterval(pollInterval);
				clients.delete(controller);
			};
		},

		cancel() {
			// Client disconnected
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

function extractComponent(filePath: string): string {
	const parts = filePath.split(/[\/\\]/);

	if (parts.includes('routes')) {
		const idx = parts.indexOf('routes');
		return parts.slice(idx, idx + 2).join('/');
	}

	if (parts.includes('lib')) {
		const idx = parts.indexOf('lib');
		return parts.slice(idx, idx + 2).join('/');
	}

	return parts.slice(-2).join('/');
}



