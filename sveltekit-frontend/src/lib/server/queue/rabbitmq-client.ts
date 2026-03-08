/**
 * RabbitMQ Publish Client — Lightweight publish-only helper
 *
 * Delegates to rabbitmq-manager-fixed.ts for connection management.
 * No subscribe logic — consuming is handled by queue-worker.ts.
 *
 * Provides:
 *   - `publishMessage<T>()` with optional Zod validation
 *   - `publishBatch<T>()` with single-channel reuse
 *
 * Usage:
 *   import { publishMessage, publishBatch } from '$lib/server/queue/rabbitmq-client.js';
 *   await publishMessage('document.processing', 'document.embed', { documentId: '123', text: 'hello' });
 *   await publishBatch('analytics.events', [{ routingKey: 'analytics.search', data: { ... } }]);
 */

import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishOptions {
	persistent?: boolean;
	headers?: Record<string, unknown>;
	expiration?: string; // ms as string
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

// ---------------------------------------------------------------------------
// Single Message Publish
// ---------------------------------------------------------------------------

/**
 * Publish a single message to an exchange with optional Zod validation.
 *
 * @param exchange - The exchange name (e.g. 'document.processing')
 * @param routingKey - The routing key (e.g. 'document.embed')
 * @param data - The message payload
 * @param schema - Optional Zod schema for validation
 * @param options - Publish options (persistent, headers, expiration)
 */
export async function publishMessage<T>(
	exchange: string,
	routingKey: string,
	data: T,
	schema?: z.ZodType<T>,
	options?: PublishOptions
): Promise<PublishResult> {
	try {
		// Optional Zod validation
		if (schema) {
			const result = schema.safeParse(data);
			if (!result.success) {
				return {
					ok: false,
					error: `Validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`
				};
			}
		}

		const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');
		if (!rabbitmq) {
			return { ok: false, error: 'RabbitMQ manager not available' };
		}

		// Use the manager's internal publish (which handles channel reuse)
		const message = Buffer.from(JSON.stringify(data));

		// Access channel through the manager's consume/publish methods
		// The manager handles connection lifecycle
		await publishViaManager(rabbitmq, exchange, routingKey, message, options);

		return { ok: true };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		console.error(`[RabbitMQ:publish] Failed (${exchange}/${routingKey}):`, error);
		return { ok: false, error };
	}
}

// ---------------------------------------------------------------------------
// Batch Publish
// ---------------------------------------------------------------------------

/**
 * Publish multiple messages to an exchange in a single batch.
 * Reuses a single channel for all messages.
 *
 * @param exchange - The exchange name
 * @param messages - Array of { routingKey, data, options? }
 * @param schema - Optional Zod schema applied to all messages
 */
export async function publishBatch<T>(
	exchange: string,
	messages: BatchMessage<T>[],
	schema?: z.ZodType<T>
): Promise<{ total: number; sent: number; errors: string[] }> {
	const errors: string[] = [];
	let sent = 0;

	if (messages.length === 0) {
		return { total: 0, sent: 0, errors: [] };
	}

	try {
		const { rabbitmq } = await import('./rabbitmq-manager-fixed.js');
		if (!rabbitmq) {
			return {
				total: messages.length,
				sent: 0,
				errors: ['RabbitMQ manager not available']
			};
		}

		for (const msg of messages) {
			try {
				// Optional Zod validation per message
				if (schema) {
					const result = schema.safeParse(msg.data);
					if (!result.success) {
						if (errors.length < 10) {
							errors.push(
								`Validation: ${result.error.issues.map((i) => i.message).join(', ')}`
							);
						}
						continue;
					}
				}

				const buffer = Buffer.from(JSON.stringify(msg.data));
				await publishViaManager(
					rabbitmq,
					exchange,
					msg.routingKey,
					buffer,
					msg.options
				);
				sent++;
			} catch (err) {
				if (errors.length < 10) {
					errors.push(err instanceof Error ? err.message : String(err));
				}
			}
		}
	} catch (err) {
		errors.push(err instanceof Error ? err.message : String(err));
	}

	return { total: messages.length, sent, errors };
}

// ---------------------------------------------------------------------------
// Convenience Publishers
// ---------------------------------------------------------------------------

/** Publish a cache invalidation event */
export async function publishCacheInvalidation(
	data: { key?: string; pattern?: string; type?: string }
): Promise<PublishResult> {
	return publishMessage('cache.invalidation', `${data.type ?? 'cache'}.invalidate`, data);
}

/** Publish a document for embedding */
export async function publishDocumentEmbed(
	data: { documentId: string; text: string; collection?: string; metadata?: Record<string, unknown> }
): Promise<PublishResult> {
	return publishMessage('document.processing', 'document.embed', data);
}

/** Publish an analytics event */
export async function publishAnalyticsEvent(
	data: { eventType: string; payload: Record<string, unknown> }
): Promise<PublishResult> {
	return publishMessage('analytics.events', `analytics.${data.eventType}`, data);
}

/** Publish a vector index operation */
export async function publishVectorIndex(
	data: { id: string; vector: number[]; collection: string; payload?: Record<string, unknown> }
): Promise<PublishResult> {
	return publishMessage('vector.updates', 'vector.index.document', data);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Publish via the RabbitMQ manager's existing channel.
 * Uses typed method signatures from rabbitmq-manager-fixed.ts.
 */
async function publishViaManager(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manager: any,
	exchange: string,
	routingKey: string,
	message: Buffer,
	options?: PublishOptions
): Promise<void> {
	const persistent = options?.persistent ?? true;

	// Access the internal channel if available, otherwise use typed methods
	const channel = manager.channel as {
		publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean;
	} | null;

	if (channel) {
		channel.publish(exchange, routingKey, message, {
			persistent,
			...(options?.headers ? { headers: options.headers } : {}),
			...(options?.expiration ? { expiration: options.expiration } : {})
		});
	} else {
		// Fallback: use the manager's typed publishers
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
}
