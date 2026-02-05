/**
 * RabbitMQ Client for Async Job Processing
 * Handles message queue operations for ACE pipeline
 */

// TODO: Fix amqplib type imports
// @ts-ignore - amqplib type mismatch
import amqp from 'amqplib';

let connection: any | null = null;
let channel: any | null = null;

/**
 * Initialize RabbitMQ connection
 */
async function ensureConnection() {
	if (connection && channel) {
		return { connection, channel };
	}

	const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

	// @ts-ignore - amqp typing issue
	connection = await amqp.connect(rabbitmqUrl);
	// @ts-ignore - amqp typing issue
	channel = await connection.createChannel();

	// Declare exchanges
	await channel.assertExchange('ace', 'topic', { durable: true });
	await channel.assertExchange('cuda', 'topic', { durable: true });
	await channel.assertExchange('rag', 'topic', { durable: true });

	return { connection, channel };
}

/**
 * Publish message to RabbitMQ queue
 */
export async function publishToRabbitMQ(
	routingKey: string,
	message: Record<string, any>
) {
	try {
		const { channel } = await ensureConnection();

		const [exchange] = routingKey.split('.');
		const messageBuffer = Buffer.from(JSON.stringify(message));

		channel.publish(
			exchange,
			routingKey,
			messageBuffer,
			{
				persistent: true,
				contentType: 'application/json',
				timestamp: Date.now()
			}
		);

		console.log(`[RabbitMQ] Published to ${routingKey}:`, message);
		return true;

	} catch (error) {
		console.error('[RabbitMQ] Publish error:', error);
		return false;
	}
}

/**
 * Subscribe to queue
 */
export async function subscribeToQueue(
	queueName: string,
	callback: (message: any) => Promise<void>
) {
	try {
		const { channel } = await ensureConnection();

		await channel.assertQueue(queueName, { durable: true });
		await channel.prefetch(1); // Process one message at a time

		channel.consume(queueName, async (msg) => {
			if (!msg) return;

			try {
				const content = JSON.parse(msg.content.toString());
				await callback(content);
				channel.ack(msg);
			} catch (error) {
				console.error(`[RabbitMQ] Error processing message:`, error);
				channel.nack(msg, false, true); // Requeue on error
			}
		});

		console.log(`[RabbitMQ] Subscribed to queue: ${queueName}`);

	} catch (error) {
		console.error('[RabbitMQ] Subscribe error:', error);
	}
}

/**
 * Close RabbitMQ connection
 */
export async function closeRabbitMQ() {
	if (channel) await channel.close();
	if (connection) await connection.close();
	connection = null;
	channel = null;
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
	process.on('SIGTERM', closeRabbitMQ);
	process.on('SIGINT', closeRabbitMQ);
}
