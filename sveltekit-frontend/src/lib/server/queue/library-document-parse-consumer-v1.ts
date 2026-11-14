import { z } from 'zod';
import { workCommandBaseSchema } from './commands.js';
import { declareTopology, QUEUES, type AmqpChannel } from './topology.js';
import { closeRabbitConnection, getRabbitChannel } from './rabbitmq-connection.js';

export const libraryDocumentParsePayloadV1Schema = z.object({
	jobId: z.string().uuid(),
	documentId: z.string().uuid(),
	sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
	documentRevision: z.string().uuid(),
	caseId: z.string().uuid().nullable(),
}).strict();

const envelopeSchema = z.object({
	command: workCommandBaseSchema,
	payload: libraryDocumentParsePayloadV1Schema,
}).strict();

export type LibraryDocumentParsePayloadV1 = z.infer<typeof libraryDocumentParsePayloadV1Schema>;

export interface LibraryDocumentParseDeliveryV1 {
	content: Buffer;
}

export interface LibraryDocumentParseChannelV1 {
	assertExchange?: (...args: unknown[]) => Promise<unknown>;
	assertQueue?: (...args: unknown[]) => Promise<unknown>;
	bindQueue?: (...args: unknown[]) => Promise<unknown>;
	prefetch(count: number): void;
	consume(queue: string, callback: (message: LibraryDocumentParseDeliveryV1 | null) => void, options?: { noAck?: boolean }): Promise<unknown>;
	ack(message: LibraryDocumentParseDeliveryV1): void;
	nack(message: LibraryDocumentParseDeliveryV1, allUpTo?: boolean, requeue?: boolean): void;
}

export async function handleLibraryDocumentParseDeliveryV1(
	channel: Pick<LibraryDocumentParseChannelV1, 'ack' | 'nack'>,
	delivery: LibraryDocumentParseDeliveryV1,
	processTask: (payload: LibraryDocumentParsePayloadV1) => Promise<void>,
): Promise<void> {
	let parsed: z.infer<typeof envelopeSchema>;
	try {
		parsed = envelopeSchema.parse(JSON.parse(delivery.content.toString('utf8')));
		if (
			parsed.command.commandType !== 'document.parse'
			|| parsed.command.taskId !== parsed.payload.jobId
			|| parsed.command.capability !== 'library.document.parse'
			|| parsed.command.targetWorkerClass !== 'library-ingestion-worker'
		) {
			channel.nack(delivery, false, false);
			return;
		}
	} catch {
		channel.nack(delivery, false, false);
		return;
	}

	try {
		await processTask(parsed.payload);
		channel.ack(delivery);
	} catch {
		// Transient database/provider errors are redelivered. The handler itself
		// uses the ingestion job lease as its idempotency/fencing boundary.
		channel.nack(delivery, false, true);
	}
}

/** Starts the existing document.parse RabbitMQ route with at-least-once delivery. */
export async function startLibraryDocumentParseConsumerV1(
	processTask: (payload: LibraryDocumentParsePayloadV1) => Promise<void>,
): Promise<() => Promise<void>> {
	const channel = await getRabbitChannel() as unknown as LibraryDocumentParseChannelV1 & AmqpChannel;
	await declareTopology(channel);
	channel.prefetch(1);
	await channel.consume(QUEUES.documentWork, (delivery) => {
		if (!delivery) return;
		void handleLibraryDocumentParseDeliveryV1(channel, delivery, processTask);
	}, { noAck: false });
	return closeRabbitConnection;
}
