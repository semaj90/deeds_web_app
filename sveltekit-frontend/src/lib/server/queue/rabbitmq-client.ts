/**
 * RabbitMQ convenience publisher.
 *
 * IMPORTANT: this helper is NON-AUTHORITATIVE. Durable Parent Atlas work must
 * be persisted through enqueueTask()/enqueueArtifactWorkItem() so Postgres
 * workflow state and the outbox commit atomically before RabbitMQ delivery.
 * This module deliberately refuses the canonical atlas.tasks.v1 exchange.
 */

import type { z } from 'zod';
import { EXCHANGES } from './topology.js';

export interface PublishOptions {
	persistent?: boolean;
	headers?: Record<string, unknown>;
	expiration?: string;
}

export interface BatchMessage<T> {
	routingKey: string;
	data: T;
	options?: PublishOptions;
}

export interface PublishResult {
	ok: boolean;
	error?: string;
}

export const AUTHORITATIVE_TASK_PUBLISH_ERROR =
	'Canonical durable tasks must use the Postgres transactional outbox; direct atlas.tasks.v1 publish is forbidden.';

export function assertConveniencePublishTarget(exchange: string): void {
	if (exchange === EXCHANGES.tasks) {
		throw new Error(AUTHORITATIVE_TASK_PUBLISH_ERROR);
	}
}

export async function publishMessage<T>(
	exchange: string,
	routingKey: string,
	data: T,
	schema?: z.ZodType<T>,
	options?: PublishOptions
): Promise<PublishResult> {
	try {
		assertConveniencePublishTarget(exchange);

		if (schema) {
			const result = schema.safeParse(data);
			if (!result.success) {
				return {
					ok: false,
					error: `Validation failed: ${result.error.issues.map((issue) => issue.message).join(', ')}`,
				};
			}
		}

		const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');
		if (!rabbitmq) return { ok: false, error: 'RabbitMQ manager not available' };

		const message = Buffer.from(JSON.stringify(data));
		await publishViaManager(rabbitmq, exchange, routingKey, message, options);
		return { ok: true };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		console.error(`[RabbitMQ:publish] Failed (${exchange}/${routingKey}):`, error);
		return { ok: false, error };
	}
}

export async function publishBatch<T>(
	exchange: string,
	messages: BatchMessage<T>[],
	schema?: z.ZodType<T>
): Promise<{ total: number; sent: number; errors: string[] }> {
	const errors: string[] = [];
	let sent = 0;
	if (messages.length === 0) return { total: 0, sent: 0, errors: [] };

	try {
		assertConveniencePublishTarget(exchange);
		const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');
		if (!rabbitmq) {
			return { total: messages.length, sent: 0, errors: ['RabbitMQ manager not available'] };
		}

		for (const msg of messages) {
			try {
				if (schema) {
					const result = schema.safeParse(msg.data);
					if (!result.success) {
						if (errors.length < 10) {
							errors.push(`Validation: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
						}
						continue;
					}
				}

				await publishViaManager(
					rabbitmq,
					exchange,
					msg.routingKey,
					Buffer.from(JSON.stringify(msg.data)),
					msg.options,
				);
				sent += 1;
			} catch (err) {
				if (errors.length < 10) errors.push(err instanceof Error ? err.message : String(err));
			}
		}
	} catch (err) {
		errors.push(err instanceof Error ? err.message : String(err));
	}

	return { total: messages.length, sent, errors };
}

export async function publishCacheInvalidation(
	data: { key?: string; pattern?: string; type?: string }
): Promise<PublishResult> {
	return publishMessage('cache.invalidation', `${data.type ?? 'cache'}.invalidate`, data);
}

export async function publishDocumentEmbed(
	data: { documentId: string; text: string; collection?: string; metadata?: Record<string, unknown> }
): Promise<PublishResult> {
	return publishMessage('document.processing', 'document.embed', data);
}

export async function publishAnalyticsEvent(
	data: { eventType: string; payload: Record<string, unknown> }
): Promise<PublishResult> {
	return publishMessage('analytics.events', `analytics.${data.eventType}`, data);
}

/**
 * Legacy vector publisher retained for compatibility. New Parent Atlas paths
 * must materialize the vector and enqueue an ArtifactAddressV1 instead.
 */
export async function publishVectorIndex(
	data: { id: string; vector: number[]; collection: string; payload?: Record<string, unknown> }
): Promise<PublishResult> {
	return publishMessage('vector.updates', 'vector.index.document', data);
}

async function publishViaManager(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manager: any,
	exchange: string,
	routingKey: string,
	message: Buffer,
	options?: PublishOptions
): Promise<void> {
	const persistent = options?.persistent ?? true;
	const channel = manager.channel as {
		publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean;
	} | null;

	if (channel) {
		channel.publish(exchange, routingKey, message, {
			persistent,
			...(options?.headers ? { headers: options.headers } : {}),
			...(options?.expiration ? { expiration: options.expiration } : {}),
		});
		return;
	}

	const data = JSON.parse(message.toString());
	if (exchange.includes('analytics')) {
		await manager.publishAnalyticsEvent({ eventType: routingKey.split('.').pop() ?? 'unknown', payload: data });
	} else if (exchange.includes('document')) {
		await manager.publishDocumentEmbed(data);
	} else if (exchange.includes('vector')) {
		await manager.publishVectorIndex(data);
	} else if (exchange.includes('cache')) {
		await manager.publishCacheInvalidation(data);
	} else if (exchange.includes('codebase')) {
		await manager.publishCodebaseIndex(data);
	}
}
