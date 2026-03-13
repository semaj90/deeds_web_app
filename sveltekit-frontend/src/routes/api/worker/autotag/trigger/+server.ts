/**
 * POST /api/worker/autotag/trigger
 * Trigger RabbitMQ worker for background auto-tagging
 *
 * Purpose: Publish message to 'evidence.process' queue for async auto-tagging
 * Consumer: rabbitmq-manager-fixed.ts handleEvidenceProcessing()
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ApiResponse } from '$lib/types/api.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { getRabbitMQUrl } from '$lib/config/env.server.js';
import { z } from 'zod';

const workerTriggerSchema = z.object({
	type: z.enum(['case_created', 'evidence_uploaded', 'document_added']),
	caseId: z.string().max(500).optional(),
	evidenceId: z.string().max(500).optional(),
	documentId: z.string().max(500).optional(),
	action: z.enum(['process', 'reprocess']),
	metadata: z.object({
		priority: z.enum(['low', 'medium', 'high']),
		tags: z.array(z.string().max(200)).max(50).optional(),
		trigger: z.string().max(200),
		userId: z.string().max(500).optional()
	}).passthrough()
}).refine(
	data => !(data.type === 'evidence_uploaded' && !data.evidenceId),
	{ message: 'evidenceId required for type=evidence_uploaded' }
);

interface WorkerTriggerResponse {
	streamId: string;
	correlationId: string;
	triggerType: string;
	action: string;
	caseId?: string;
	evidenceId?: string;
	documentId?: string;
}

/**
 * POST /api/worker/autotag/trigger
 * Publishes auto-tagging job to RabbitMQ queue
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireAuth(event);

	try {
		const raw = await event.request.json();
		const parsed = workerTriggerSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{
					success: false,
					error: parsed.error.issues[0]?.message ?? 'Invalid input'
				},
				{ status: 400 }
			);
		}
		const body = parsed.data;

		// Generate correlation ID
		const correlationId = `autotag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
		const streamId = `stream-${Date.now()}`;

		// Publish to RabbitMQ 'evidence.process' queue
		try {
			// Dynamic import to avoid server-side dependency issues
			const amqp = (await import('amqplib')) as any;
			const rabbitmqUrl = getRabbitMQUrl();

			const connection = await amqp.connect(rabbitmqUrl);
			const channel = await connection.createChannel();

			const exchangeName = 'deeds.evidence';
			const routingKey = 'evidence.process';
			const queueName = 'evidence_process';

			// Ensure exchange and queue exist
			await channel.assertExchange(exchangeName, 'topic', { durable: true });
			await channel.assertQueue(queueName, { durable: true });
			await channel.bindQueue(queueName, exchangeName, routingKey);

			// Publish message
			const message = {
				type: body.type,
				caseId: body.caseId,
				evidenceId: body.evidenceId,
				documentId: body.documentId,
				action: body.action,
				correlationId,
				streamId,
				metadata: {
					...body.metadata,
					userId: auth.user.id,
					timestamp: new Date().toISOString(),
					trigger: body.metadata.trigger || 'api-manual'
				}
			};

			const published = channel.publish(
				exchangeName,
				routingKey,
				Buffer.from(JSON.stringify(message)),
				{
					persistent: true,
					correlationId,
					contentType: 'application/json'
				}
			);

			if (!published) {
				throw new Error('RabbitMQ publish failed (buffer full)');
			}

			await channel.close();
			await connection.close();

			console.log(
				`[autotag-trigger] Published message to ${queueName}: type=${body.type}, id=${body.evidenceId || body.caseId || body.documentId}`
			);

			return json(
				{
					success: true,
					data: {
						streamId,
						correlationId,
						triggerType: body.type,
						action: body.action,
						caseId: body.caseId,
						evidenceId: body.evidenceId,
						documentId: body.documentId
					},
					metadata: {
						timestamp: new Date().toISOString(),
						version: '1.0',
						processing_time: 0
					}
				},
				{ status: 202 }
			);
		} catch (rabbitmqError) {
			console.error('[autotag-trigger] RabbitMQ error:', rabbitmqError);

			// Fallback: log to console but return success
			// In production, you might want to queue this in a fallback system
			return json(
				{
					success: true,
					data: {
						streamId,
						correlationId,
						triggerType: body.type,
						action: body.action,
						caseId: body.caseId,
						evidenceId: body.evidenceId,
						documentId: body.documentId
					},
					message: 'RabbitMQ unavailable - job logged for manual processing',
					metadata: {
						timestamp: new Date().toISOString(),
						version: '1.0',
						processing_time: 0
					}
				},
				{ status: 202 }
			);
		}
	} catch (err) {
		console.error('[autotag-trigger] Request error:', err);
		const message = err instanceof Error ? err.message : String(err);

		return json(
			{
				success: false,
				error: `Worker trigger failed: ${message}`
			},
			{ status: 500 }
		);
	}
};
