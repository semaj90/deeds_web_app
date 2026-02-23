/**
 * RabbitMQ Job Publisher Endpoint
 * Receives job requests and publishes to appropriate queues
 *
 * POST /api/rabbitmq/publish
 * Body: { queue: string, message: object, options?: { persistent?: boolean, priority?: number } }
 *
 * Integrates with:
 * - idle-detection-rabbitmq-machine (job queueing)
 * - RabbitMQ server with fallback (Docker -> Native Windows -> Remote)
 */

import { checkHealth, getChannel, getCurrentConfig } from '$lib/server/rabbitmq/connection';
import type { RequestHandler } from './$types';

/**
 * Publish message to RabbitMQ queue
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { queue, message, options = {} } = body;

		// Validation
		if (!queue || typeof queue !== 'string') {
			return new Response('Missing or invalid queue name', { status: 400 });
		}

		if (!message || typeof message !== 'object') {
			return new Response('Missing or invalid message payload', { status: 400 });
		}

		// Get channel
		const ch = await getChannel();

		// Assert queue (create if doesn't exist)
		await ch.assertQueue(queue, {
			durable: true, // Survive RabbitMQ restarts
			arguments: {
				'x-max-priority': 10 // Enable priority queueing
			}
		});

		// Publish message
		const messageBuffer = Buffer.from(JSON.stringify(message));
		const publishOptions = {
			persistent: options.persistent !== false, // Default true
			priority: options?.priority ?? 5, // Default medium priority
			contentType: 'application/json',
			timestamp: Date.now()
		};
		const published = ch.sendToQueue(queue, messageBuffer, publishOptions);

		if (!published) {
			// Buffer full, need to wait for drain event
			console.warn(`RabbitMQ buffer full for queue ${queue}`);
			await new Promise((resolve) => ch.once('drain', resolve));
		}

		console.log(`Published message to queue ${queue}`, message?.jobId ?? 'unknown');

		return new Response(
			JSON.stringify({
				success: true,
				queue,
				jobId: message.jobId,
				timestamp: Date.now()
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		console.error('RabbitMQ publish error:', error);

		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

/**
 * Health check endpoint
 * GET /api/rabbitmq/publish
 */
export const GET: RequestHandler = async () => {
	const health = await checkHealth();
	const config = getCurrentConfig();

	if (health.connected) {
		return new Response(
			JSON.stringify({
				status: 'connected',
				connection: config?.description ?? 'Unknown',
				timestamp: Date.now()
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} else {
		return new Response(
			JSON.stringify({
				status: 'disconnected',
				error: health.error,
				availableConfigs: [
					'Docker RabbitMQ (localhost:5672)',
					'Native Windows RabbitMQ (guest/guest)',
					'Environment-configured RabbitMQ'
				],
				timestamp: Date.now()
			}),
			{
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};