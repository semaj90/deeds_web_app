/**
 * RabbitMQ Connection and Queue Management
 *
 * Provides utilities for:
 * - Connecting to RabbitMQ
 * - Declaring queues and exchanges
 * - Publishing messages
 * - Consuming messages with error handling
 */

import * as amqplib from 'amqplib';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';

let connection: amqplib.Connection | null = null;
let channel: amqplib.Channel | null = null;

/**
 * Queue names for evidence processing pipeline
 */
export const QUEUES = {
  OCR: 'evidence.ocr',
  EMBED: 'evidence.embed',
  SUMMARIZE: 'evidence.summarize',
  ENTITY: 'evidence.entity',
} as const;

/**
 * Exchange names
 */
export const EXCHANGES = {
  EVIDENCE: 'evidence.topic',
  WORKFLOW: 'workflow.topic',
} as const;

/**
 * Connect to RabbitMQ and create channel
 */
export async function connectRabbitMQ(url?: string): Promise<void> {
  if (connection && channel) {
    logger.info('RabbitMQ already connected');
    return;
  }

  // normalize and validate RabbitMQ URL (fall back to env or process.env)
  const rabbitUrl = url || (env && (env as any).rabbitmq?.url) || process.env.RABBITMQ_URL;

  if (!rabbitUrl) {
    logger.error('RabbitMQ URL is not configured. Provide a URL via function param, env.rabbitmq.url, or RABBITMQ_URL env var');
    throw new Error('RabbitMQ URL not configured');
  }

  try {
    logger.info('Connecting to RabbitMQ...', { url: rabbitUrl });

    // Use runtime typing to avoid library/type mismatches, then cast to proper amqplib types.
    const connRuntime: any = await amqplib.connect(rabbitUrl);
    const chRuntime: any = await connRuntime.createChannel();

    // Narrow to amqplib types for module-scoped storage and later use.
    const conn = connRuntime as amqplib.Connection;
    const ch = chRuntime as amqplib.Channel;

    // Declare exchanges using the local channel
    await ch.assertExchange(EXCHANGES.EVIDENCE, 'topic', { durable: true });
    await ch.assertExchange(EXCHANGES.WORKFLOW, 'topic', { durable: true });

    // Declare all queues using the local channel
    for (const queueName of Object.values(QUEUES)) {
      await ch.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000, // 24 hours
          'x-max-length': 10000,
        }
      });

      // Bind to exchange with routing key
      await ch.bindQueue(queueName, EXCHANGES.EVIDENCE, queueName);
    }

    logger.info('RabbitMQ connected and queues declared');

    // Attach handlers to the concrete connection, then store to module-scoped vars
    connRuntime.on('error', (err: Error) => {
      logger.error('RabbitMQ connection error', { error: err });
      connection = null;
      channel = null;
    });

    connRuntime.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    // Assign module-scoped references only after full init
    connection = conn;
    channel = ch;
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ', { error });
    throw error;
  }
}

/**
 * Get the current RabbitMQ channel
 */
export async function getChannel(): Promise<amqplib.Channel> {
  if (!channel) {
    await connectRabbitMQ();
  }

  if (!channel) {
    throw new Error('Failed to establish RabbitMQ channel');
  }

  return channel;
}

/**
 * Declare a queue if it doesn't exist
 */
export async function declareQueue(queueName: string): Promise<void> {
  const ch = await getChannel();
  await ch.assertQueue(queueName, { durable: true });
  logger.info('Queue declared', { queue: queueName });
}

/**
 * Publish a message to a queue
 */
export async function publishQueue(queueName: string, message: any): Promise<void> {
  try {
    const ch = await getChannel();
    const msgBuffer = Buffer.from(JSON.stringify(message));

    ch.sendToQueue(queueName, msgBuffer, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });

    logger.info('Message published to queue', {
      queue: queueName,
      messageId: message.id || message.evidenceId
    });
  } catch (error) {
    logger.error('Failed to publish message', { queue: queueName, error });
    throw error;
  }
}

/**
 * Publish a message to an exchange with routing key
 */
export async function publishExchange(
  exchange: string,
  routingKey: string,
  message: any
): Promise<void> {
  try {
    const ch = await getChannel();
    const msgBuffer = Buffer.from(JSON.stringify(message));

    ch.publish(exchange, routingKey, msgBuffer, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });

    logger.info('Message published to exchange', {
      exchange,
      routingKey,
      messageId: message.id || message.evidenceId
    });
  } catch (error) {
    logger.error('Failed to publish to exchange', { exchange, routingKey, error });
    throw error;
  }
}

/**
 * Consume messages from a queue with callback
 */
export async function consumeQueue(
  queueName: string,
  callback: (message: any) => Promise<void>,
  options?: { prefetch?: number }
): Promise<void> {
  try {
    const ch = await getChannel();

    // Set prefetch count (number of unacknowledged messages) if supported
    if (typeof (ch as any).prefetch === 'function') {
      (ch as any).prefetch(options?.prefetch ?? 1);
    }

    // Ensure queue exists
    await ch.assertQueue(queueName, { durable: true });

    logger.info('Starting consumer for queue', { queue: queueName });

    ch.consume(queueName, async (msg: amqplib.ConsumeMessage | null) => {
      if (!msg) return;

      const startTime = Date.now();
      let content: any = undefined;

      // Parse message payload, handle invalid JSON separately
      try {
        content = JSON.parse(msg.content.toString());
      } catch (parseErr) {
        logger.error('Invalid JSON payload received, rejecting message', {
          queue: queueName,
          error: parseErr
        });
        // Reject without requeue (send to DLQ if configured)
        ch.nack(msg, false, false);
        return;
      }

      try {
        logger.info('Processing message from queue', {
          queue: queueName,
          messageId: content.id || content.evidenceId
        });

        // Execute callback
        await callback(content);

        // Acknowledge message
        ch.ack(msg);

        const duration = Date.now() - startTime;
        logger.info('Message processed successfully', {
          queue: queueName,
          duration,
          messageId: content.id || content.evidenceId
        });

      } catch (error) {
        logger.error('Failed to process message', {
          queue: queueName,
          error,
          messageId: content?.id || content?.evidenceId
        });

        // Reject message without requeue (send to dead letter queue if configured)
        ch.nack(msg, false, false);
      }
    });

    logger.info('Consumer started successfully', { queue: queueName });

  } catch (error) {
    logger.error('Failed to start consumer', { queue: queueName, error });
    throw error;
  }
}

/**
 * Close RabbitMQ connection
 */
export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) {
      try {
        await channel.close();
        logger.info('RabbitMQ channel closed');
      } catch (chErr) {
        logger.warn('Error closing RabbitMQ channel', { error: chErr });
      }
    }

    if (connection) {
      // Some amqplib implementations/types may not include `close` on the declared type.
      // Use a runtime check with a cast to `any` and try common shutdown methods.
      const connAny = connection as any;
      const closeFn = connAny.close ?? connAny.disconnect ?? connAny.end;

      if (typeof closeFn === 'function') {
        try {
          const result = closeFn.call(connection);
          // If the close function returns a promise, await it.
          if (result && typeof (result as Promise<void>).then === 'function') {
            await result;
          }
          logger.info('RabbitMQ connection closed');
        } catch (innerErr) {
          // If calling the function threw synchronously, log but continue to cleanup.
          logger.warn('Error while invoking RabbitMQ close function', { error: innerErr });
        }
      } else {
        // Best-effort: no close-like function found on the connection object.
        logger.warn('RabbitMQ connection object has no close/disconnect/end method; skipping explicit close');
      }
    }
  } catch (error) {
    logger.error('Error closing RabbitMQ', { error });
  } finally {
    connection = null;
    channel = null;
  }
}

/* Graceful shutdown handlers to ensure connections are closed on process exit */
process.once('SIGINT', async () => {
  logger.info('SIGINT received, closing RabbitMQ connection');
  await closeRabbitMQ().catch((e) => logger.error('Error during SIGINT shutdown', { error: e }));
  // allow process to exit naturally after connection cleanup
  process.exit(0);
});

process.once('SIGTERM', async () => {
  logger.info('SIGTERM received, closing RabbitMQ connection');
  await closeRabbitMQ().catch((e) => logger.error('Error during SIGTERM shutdown', { error: e }));
  process.exit(0);
});
