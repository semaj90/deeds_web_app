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

import { checkHealth, getChannel, getCurrentConfig } from '$lib/server/queue/rabbitmq-connection';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const publishSchema = z.object({
	queue: z.string().min(1).max(200),
	message: z.record(z.string(), z.unknown()),
	options: z.object({
		persistent: z.boolean().optional(),
		priority: z.number().int().min(0).max(10).optional()
	}).optional().default({})
});

/**
 * Publish message to RabbitMQ queue
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
	try {
		const raw = await request.json();
		const parsed = publishSchema.safeParse(raw);
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}
		const { queue, message, options } = parsed.data;

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
				error: 'Message publish failed'
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
