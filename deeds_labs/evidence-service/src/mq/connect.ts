import amqp from 'amqplib';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';

// amqplib type definitions have some issues - using type assertions where needed
let connection: any = null;
let channel: any = null;

export const QUEUES = {
  OCR: 'evidence.ocr',
  EMBED: 'evidence.embed',
  SUMMARIZE: 'evidence.summarize',
  ENTITY: 'evidence.entity',
} as const;

export const EXCHANGES = {
  EVIDENCE: 'evidence.topic',
} as const;

export async function connectRabbitMQ(): Promise<{ connection: any; channel: any }> {
  if (connection && channel) {
    return { connection, channel };
  }

  try {
    logger.info('Connecting to RabbitMQ...', { url: env.rabbitmq.url });
    connection = await amqp.connect(env.rabbitmq.url);
    channel = await connection.createChannel();

    // Declare exchange
    await channel.assertExchange(EXCHANGES.EVIDENCE, 'topic', { durable: true });

    // Declare queues
    for (const queueName of Object.values(QUEUES)) {
      await channel.assertQueue(queueName, { durable: true });
      // Bind to exchange with routing key
      await channel.bindQueue(queueName, EXCHANGES.EVIDENCE, queueName);
    }

    logger.info('RabbitMQ connected and queues declared');

    connection.on('error', (err: Error) => {
      logger.error('RabbitMQ connection error', err);
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    return { connection, channel };
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ', error);
    throw error;
  }
}

export async function getChannel(): Promise<any> {
  if (!channel) {
    const conn = await connectRabbitMQ();
    return conn.channel;
  }
  return channel;
}

export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ', error);
  }
}
