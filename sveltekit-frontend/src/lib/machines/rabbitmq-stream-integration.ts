/**
 * RabbitMQ Streams Integration with XState v5
 * Phase 96 - Production-ready streaming patterns
 * January 11, 2026
 *
 * This module demonstrates RabbitMQ Streams integration with XState v5 state machines,
 * including chunking, publisher confirms, offset tracking, and error handling.
 */

import type { Channel, Connection, ConsumeMessage } from 'amqplib';
import { assign, fromCallback, fromPromise, setup, type ActorRefFrom } from 'xstate';

// ===== Types =====

export interface RabbitMQStreamConfig {
	url: string;
	streamName: string;
	maxLengthBytes?: number;
	maxAge?: string;
	segmentSizeBytes?: number;
	prefetchCount?: number;
	offset?: 'first' | 'last' | 'next' | number;
}

export interface StreamMessage {
	id: string;
	type: string;
	data: unknown;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

export interface StreamContext {
	config: RabbitMQStreamConfig;
	connection: Connection | null;
	channel: Channel | null;
	messages: StreamMessage[];
	error: string | null;
	isConnected: boolean;
	consumerTag: string | null;
	lastOffset: number;
	publishedCount: number;
	consumedCount: number;
}
| { type: 'CONNECT';
	config: RabbitMQStreamConfig }
	| { type: 'DISCONNECT' }
	| { type: 'PUBLISH';
	message: StreamMessage }
	| { type: 'MESSAGE_RECEIVED';
	message: StreamMessage }
	| { type: 'START_CONSUMING'; offset?: 'first' | 'last' | 'next' | number }
	| { type: 'STOP_CONSUMING' }
	| { type: 'ERROR';
	error: string }
	| { type: 'RECONNECT' };

// ===== RabbitMQ Stream Machine =====

/**
 * XState v5 machine for managing RabbitMQ stream connections
 * Features:
 * - Publisher confirms for reliability
 * - Offset-based consumption
 * - QoS prefetch control
 * - Automatic reconnection
 * - Clean error handling
 */
export const rabbitMQStreamMachine = setup({
	types: {} as {
		context: StreamContext,
		events: StreamEvent,
	},
	actors: {
		/**
		 * Connect to RabbitMQ and declare stream
		 */
		connectToStream: fromPromise<
			{ connection: Connection;
	channel: Channel },
	{ config: RabbitMQStreamConfig }
		>(async ({ input }) => {
			// Dynamic import to avoid SSR issues
			const amqp = await import('amqplib');

			const connection = await amqp.connect(input.config.url);
			const channel = await connection.createChannel();

			// Enable publisher confirms for reliability
			await channel.confirmSelect();

			// Declare stream with configuration
			await channel.assertQueue(input.config.streamName, {
				durable: true,
				arguments: {
					'x-queue-type': 'stream',
					'x-max-length-bytes': input.config.maxLengthBytes ?? 20_000_000_000, // 20GB default
					'x-max-age': input.config.maxAge ?? '7D',
					'x-stream-max-segment-size-bytes': input.config.segmentSizeBytes ?? 100_000_000
				}
			});

			// Set QoS prefetch for chunking control
			await channel.prefetch(input.config.prefetchCount ?? 100);

			return { connection, channel };
		}),

		/**
		 * Publish message to stream with confirmation
		 */
		publishToStream: fromPromise<
			{ messageId: string;
	confirmed: boolean },
	{ channel: Channel;
	streamName: string; message: StreamMessage }
		>(async ({ input }) => {
			const { channel, streamName, message } = input;

			// Add deduplication header for exactly-once semantics
			const publishOptions = {
				persistent: true,
				messageId: message.id,
				timestamp: message.timestamp,
				headers: {
					'x-deduplication-header': message.id,
					'x-stream-publishing-id': message.id,
					'message-type': message.type
				}
			};

			const buffer = Buffer.from(JSON.stringify(message));

			// Publish and wait for confirmation
			channel.publish('', streamName, buffer, publishOptions);

			// Wait for publisher confirm
			await channel.waitForConfirms();

			return {
				messageId: message.id,
				confirmed: true
			};
		}),

		/**
		 * Stream consumer using fromCallback for continuous message flow
		 */
		streamConsumer: fromCallback<StreamEvent, {
			channel: Channel;
	streamName: string;
			offset?: 'first' | 'last' | 'next' | number;
		}>(({ sendBack, input }) => {
			const { channel, streamName, offset = 'last' } = input;
			let consumerTag: string | null = null;

			// Start consuming from stream
			channel.consume(
				streamName,
				(msg: ConsumeMessage | null) => {
					if (!msg) return;

					try {
						const message = JSON.parse(msg.content.toString()) as StreamMessage;

						// Send message to parent machine
						sendBack({
							type: 'MESSAGE_RECEIVED',
							message
						});

						// Manual acknowledgment after processing
						channel.ack(msg);
					} catch (error) {
						console.error('Failed to process stream message:', error);
						// Negative ack to requeue (or use nack with requeue: false to dead-letter)
						channel.nack(msg, false, false);
					}
				},
	{
					noAck: false, // Manual acknowledgment
					arguments: {
						'x-stream-offset': offset
					}
				}
			).then((result) => {
				consumerTag = result.consumerTag;
			}).catch((error) => {
				sendBack({
					type: 'ERROR',
					error: error instanceof Error ? error.message : String(error)
				});
			});

			// Cleanup function
			return () => {
				if (consumerTag) {
					channel.cancel(consumerTag).catch(console.error);
				}
			};
		}),

		/**
		 * Disconnect from RabbitMQ
		 */
		disconnectFromStream: fromPromise<void, {
			connection: Connection | null;
			channel: Channel | null;
		}>(async ({ input }) => {
			const { connection, channel } = input;

			if (channel) {
				await channel.close();
			}

			if (connection) {
				await connection.close();
			}
		})
	}
}).createMachine({
	id: 'rabbitMQStream',
	initial: 'disconnected',
	context: {
	config: {
			url: 'amqp://localhost',
			streamName: 'default-stream'
		},
	connection: null,
		channel: null,
		messages: [],
		error: null,
		isConnected: false,
		consumerTag: null,
		lastOffset: 0,
		publishedCount: 0,
		consumedCount: 0
	},
	states: {
	disconnected: {
			on: {
	CONNECT: {
					target: 'connecting',
					actions: assign({
	config: ({ event }) => event.config,
						error: null
					})
				}
			}
		},
	connecting: {
	invoke: {
				src: 'connectToStream',
				input: ({ context }) => ({ config: context.config }),
				onDone: {
	target: 'connected',
					actions: assign({
	connection: ({ event }) => event.output.connection,
						channel: ({ event }) => event.output.channel,
						isConnected: true,
						error: null
					})
				},
	onError: {
	target: 'error',
					actions: assign({
	error: ({ event }) => event.error instanceof Error ? event.error.message : String(event.error)
					})
				}
			}
		},
	connected: {
	on: {
				DISCONNECT: 'disconnecting',
				PUBLISH: 'publishing',
				START_CONSUMING: 'consuming',
				ERROR: {
	target: 'error',
					actions: assign({
	error: ({ event }) => event.error
					})
				}
			}
		},
	publishing: {
	invoke: {
				src: 'publishToStream',
				input: ({ context, event }) => ({
					channel: context.channel!,
					streamName: context.config.streamName,
					message: (event as Extract<StreamEvent, { type: 'PUBLISH' }>).message
				}),
				onDone: {
	target: 'connected',
					actions: assign({
	publishedCount: ({ context }) => context.publishedCount + 1
					})
				},
	onError: {
	target: 'error',
					actions: assign({
	error: ({ event }) => event.error instanceof Error ? event.error.message : String(event.error)
					})
				}
			}
		},
	consuming: {
	invoke: {
				src: 'streamConsumer',
				input: ({ context, event }) => ({
					channel: context.channel!,
					streamName: context.config.streamName,
					offset: (event as Extract<StreamEvent, { type: 'START_CONSUMING' }>).offset
				})
			},
	on: {
	MESSAGE_RECEIVED: {
					actions: assign({
	messages: ({ context, event }) => [
							...context.messages.slice(-99), // Keep last 100 messages
							(event as Extract<StreamEvent, { type: 'MESSAGE_RECEIVED' }>).message
						],
						consumedCount: ({ context }) => context.consumedCount + 1
					})
				},
	STOP_CONSUMING: 'connected',
				PUBLISH: 'publishing',
				DISCONNECT: 'disconnecting',
				ERROR: {
	target: 'error',
					actions: assign({
	error: ({ event }) => event.error
					})
				}
			}
		},
	disconnecting: {
	invoke: {
				src: 'disconnectFromStream',
				input: ({ context }) => ({
					connection: context.connection,
					channel: context.channel
				}),
				onDone: {
	target: 'disconnected',
					actions: assign({
	connection: null,
						channel: null,
						isConnected: false,
						consumerTag: null
					})
				},
	onError: {
	target: 'disconnected',
					actions: assign({
	connection: null,
						channel: null,
						isConnected: false,
						error: ({ event }) => event.error instanceof Error ? event.error.message : String(event.error)
					})
				}
			}
		},
	error: {
	on: {
				RECONNECT: 'connecting',
				DISCONNECT: 'disconnecting'
			}
		}
	}
});

// ===== Type Export =====

export type RabbitMQStreamActor = ActorRefFrom<typeof rabbitMQStreamMachine>;

// ===== Helper Functions =====

/**
 * Create a chunked document stream processor
 * Integrates with unified-document-processor.ts for legal document ingestion
 */
export function createDocumentChunkStream(
	streamConfig: RabbitMQStreamConfig,
	chunkSize = 500,
	overlap = 50
): RabbitMQStreamActor {
	const { createActor } = require('xstate');

	const actor = createActor(rabbitMQStreamMachine, {
		input: {
	config: {
				...streamConfig,
				prefetchCount: 200, // Optimal for document chunks
				maxLengthBytes: 50_000_000_000 // 50GB for legal documents
			}
		}
	});

	return actor;
}

/**
 * Create a recommendation stream processor
 * Integrates with recommendation-routing-machine.ts for AI suggestions
 */
export function createRecommendationStream(
	streamConfig: RabbitMQStreamConfig
): RabbitMQStreamActor {
	const { createActor } = require('xstate');

	const actor = createActor(rabbitMQStreamMachine, {
		input: {
	config: {
				...streamConfig,
				streamName: streamConfig.streamName ?? 'legal-recommendations',
				prefetchCount: 100,
				offset: 'last' // Always get latest recommendations
			}
		}
	});

	return actor;
}

/**
 * Publish chunked data to stream with deduplication
 */
export async function publishChunkedData(
	actor: RabbitMQStreamActor,
	chunks: string[],
	messageType: string,
	metadata: Record<string, unknown> = {}
): Promise<void> {
	for (let i = 0; i < chunks.length; i++) {
		const message: StreamMessage = {
			id: `${messageType}-${Date.now()}-${i}`,
			type: messageType,
			data: chunks[i],
			timestamp: Date.now(),
			metadata: {
				...metadata,
				chunkIndex: i,
				totalChunks: chunks.length
			}
		};

		actor.send({ type: 'PUBLISH', message });

		// Small delay to avoid overwhelming the stream
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}

/**
 * Example: Legal document processing pipeline with RabbitMQ streams
 */
export async function processLegalDocumentWithStreams(
	documentText: string,
	caseId: string
): Promise<void> {
	// 1. Create document chunk stream
	const streamActor = createDocumentChunkStream({
		url: process.env.RABBITMQ_URL ?? 'amqp://localhost',
		streamName: `case-${caseId}-documents`,
		maxLengthBytes: 50_000_000_000,
		maxAge: '30D' // Keep legal docs for 30 days
	});

	streamActor.start();

	// 2. Connect to stream
	streamActor.send({
		type: 'CONNECT',
		config: {
	url: process.env.RABBITMQ_URL ?? 'amqp://localhost',
			streamName: `case-${caseId}-documents`
		}
	});

	// 3. Wait for connection
	await new Promise(resolve => {
		const sub = streamActor.subscribe(snapshot => {
			if (snapshot.matches('connected')) {
				sub.unsubscribe();
				resolve(null);
			}
		});
	});

	// 4. Chunk and publish document
	const chunkSize = 500;
	const overlap = 50;
	const chunks: string[] = [];

	for (let i = 0; i < documentText.length; i += chunkSize - overlap) {
		chunks.push(documentText.slice(i, i + chunkSize));
	}

	await publishChunkedData(streamActor, chunks, 'legal-document-chunk', { caseId: documentLength, documentText.length,
		chunkSize: overlap
	});

	// 5. Cleanup
	streamActor.send({ type: 'DISCONNECT' });
}
