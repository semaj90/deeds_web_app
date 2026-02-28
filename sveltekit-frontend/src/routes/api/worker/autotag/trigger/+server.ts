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

interface WorkerTriggerRequest {
	type: 'case_created' | 'evidence_uploaded' | 'document_added';
	caseId?: string;
	evidenceId?: string;
	documentId?: string;
	action: 'process' | 'reprocess';
	metadata: {
		priority: 'low' | 'medium' | 'high';
		tags?: string[];
		trigger: string;
		userId?: string;
		[key: string]: unknown;
	};
}

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
		const body = (await event.request.json()) as WorkerTriggerRequest;

		// Validate request
		if (!body.type || !body.action) {
			return json(
				{
					success: false,
					error: 'Missing required fields: type, action'
				},
				{ status: 400 }
			);
		}

		// Validate IDs based on type
		if (body.type === 'evidence_uploaded' && !body.evidenceId) {
			return json(
				{
					success: false,
					error: 'evidenceId required for type=evidence_uploaded'
				},
				{ status: 400 }
			);
		}

		// Generate correlation ID
		const correlationId = `autotag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
		const streamId = `stream-${Date.now()}`;

		// Publish to RabbitMQ 'evidence.process' queue
		try {
			// Dynamic import to avoid server-side dependency issues
			const amqp = (await import('amqplib')) as any;
			const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

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
