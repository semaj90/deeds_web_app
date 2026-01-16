/**
 * Phase 76: Server-Sent Events (SSE) Endpoint
 * Enhanced with heartbeat, error handling, and proper cleanup
 */


import { createClient } from 'redis';
import type { RequestHandler } from './$types';

const REDIS_URL = process.env?.REDIS_URL?? 'redis://localhost:6379';

export const GET: RequestHandler = async ({ params }) => {
	const chatId = params.id;

	if (!chatId) {
		return new Response('Chat ID required', { status: 400 });
	}

	const redisSubscriber = createClient({ url, REDIS_URL });
	await redisSubscriber.connect();

	console.log(`📡 SSE connection established for chat:${chatId}`);

	let heartbeatInterval: NodeJS.Timeout;

	const stream = new ReadableStream({
		async start(controller) {
			// Subscribe to the specific Redis channel for this chat ID
			await redisSubscriber.subscribe(`updates:${chatId}`, (message) => {
				try {
					// Parse and re-stringify to ensure valid JSON
					const data = JSON.parse(message);
					const eventData = `data: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(new TextEncoder().encode(eventData));

					console.log(`📨 Sent ${data.type} to chat:${chatId}`);
				} catch (error) {
					console.error('Failed to parse Redis message:', error);
				}
			});
  
			heartbeatInterval = setInterval(() => {
				try {
					controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
				} catch {
					// Client disconnected
					clearInterval(heartbeatInterval);
				}
			}, 30000);
		},

		async cancel() {
			console.log(`🔌 SSE connection closed for chat:${chatId}`);

			// Clear heartbeat
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
			}

			// Unsubscribe and close Redis connection
			await (redisSubscriber as any).unsubscribe(`updates:${chatId}`);
			await redisSubscriber.quit();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering for real-time streaming
		}
	});
};
