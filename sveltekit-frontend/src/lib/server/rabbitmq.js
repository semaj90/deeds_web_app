/// <reference types="vite/client" />
import * as amqp from 'amqplib';

let connection = null;
let channel = null;

export async function getConnection() {
	if (connection) return connection;
	const rabbitmqUrl = import.meta.env.RABBITMQ_URL || 'amqp://localhost:5672';
	console.log('[RabbitMQ] Connecting to:', rabbitmqUrl);
	connection = await amqp.connect(rabbitmqUrl);
	connection.on('error', (err) => {
		console.error('[RabbitMQ] Connection error:', err);
		connection = null;
		channel = null;
	});
	connection.on('close', () => {
		console.log('[RabbitMQ] Connection closed');
		connection = null;
		channel = null;
	});
	return connection;
}

export async function getChannel() {
	if (channel) return channel;
	const conn = await getConnection();
	channel = await conn.createChannel();
	await channel.prefetch(1);
	channel.on('error', (err) => {
		console.error('[RabbitMQ] Channel error:', err);
		channel = null;
	});
	channel.on('close', () => {
		console.log('[RabbitMQ] Channel closed');
		channel = null;
	});
	return channel;
}

export async function publishToQueue(queueName, payload) {
	try {
		const ch = await getChannel();
		// Match canonical queue args from rabbitmq-manager-fixed.ts to avoid PRECONDITION_FAILED
		await ch.assertQueue(queueName, {
			durable: true,
			arguments: {
				'x-message-ttl': 300000,
				'x-dead-letter-exchange': 'dlx.dead-letter',
				'x-dead-letter-routing-key': queueName
			}
		});
		const message = JSON.stringify(payload);
		const sent = ch.sendToQueue(queueName, Buffer.from(message), {
			persistent: true,
			timestamp: Date.now(),
			messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		});
		if (!sent) {
			throw new Error('Message queue is full');
		}
		console.log(`[RabbitMQ] Published to queue ${queueName}:`, {
			messageId: payload && payload.sessionId ? payload.sessionId : 'unknown',
			queueName
		});
	} catch (error) {
		console.error(`[RabbitMQ] Failed to publish to queue ${queueName}:`, error);
		throw error;
	}
}

export async function consumeFromQueue(queueName, processor) {
	try {
		const ch = await getChannel();
		// Match canonical queue args from rabbitmq-manager-fixed.ts to avoid PRECONDITION_FAILED
		await ch.assertQueue(queueName, {
			durable: true,
			arguments: {
				'x-message-ttl': 300000,
				'x-dead-letter-exchange': 'dlx.dead-letter',
				'x-dead-letter-routing-key': queueName
			}
		});
		console.log(`[RabbitMQ] Starting consumer for queue: ${queueName}`);
		await ch.consume(queueName, async (msg) => {
			if (!msg) return;
			try {
				const payload = JSON.parse(msg.content.toString());
				await processor(
					payload,
					() => ch.ack(msg),
					() => ch.nack(msg, false, false)
				);
			} catch (error) {
				console.error(`[RabbitMQ] Error processing message from ${queueName}:`, error);
				ch.nack(msg, false, false);
			}
		});
	} catch (error) {
		console.error(`[RabbitMQ] Failed to consume from queue ${queueName}:`, error);
		throw error;
	}
}

export async function setupQueues() {
	try {
		const ch = await getChannel();
		// Use canonical DLX exchange matching rabbitmq-manager-fixed.ts
		await ch.assertExchange('dlx.dead-letter', 'topic', { durable: true });
		const queues = [
			'evidence.process.queue',
			'evidence.process.control',
			'evidence.ocr.queue',
			'evidence.embedding.queue',
			'evidence.rag.queue'
		];
		for (const queueName of queues) {
			// Create DLQ per queue
			const dlqName = `${queueName}.dlq`;
			await ch.assertQueue(dlqName, { durable: true });
			await ch.bindQueue(dlqName, 'dlx.dead-letter', queueName);
			// Create main queue with canonical DLX args
			await ch.assertQueue(queueName, {
				durable: true,
				arguments: {
					'x-message-ttl': 300000,
					'x-dead-letter-exchange': 'dlx.dead-letter',
					'x-dead-letter-routing-key': queueName
				}
			});
			console.log(`[RabbitMQ] Queue setup: ${queueName}`);
		}
		console.log('[RabbitMQ] Setup complete');
	} catch (error) {
		console.error('[RabbitMQ] Failed to setup queues:', error);
		throw error;
	}
}

export async function closeRabbitMQ() {
	try {
		if (channel) {
			await channel.close();
			channel = null;
		}
		if (connection) {
			await connection.close();
			connection = null;
		}
		console.log('[RabbitMQ] Connections closed gracefully');
	} catch (error) {
		console.error('[RabbitMQ] Error closing connections:', error);
	}
}

export async function healthCheck() {
	try {
		const ch = await getChannel();
		await ch.checkQueue('evidence.process.queue');
		return true;
	} catch (error) {
		console.error('[RabbitMQ] Health check failed:', error);
		return false;
	}
}
