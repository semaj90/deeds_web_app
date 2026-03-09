import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

let connection: amqp.Connection | null = null;
let channel: amqp.Channel | null = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbit:5672';

export async function connectRabbitMQ() {
  try {
    if (!connection) {
      connection = await amqp.connect(RABBITMQ_URL) as any;
      channel = await (connection as any).createChannel();

      // Declare queue
      await (channel as any).assertQueue('ingest', { durable: true });

      console.log('🐰 Connected to RabbitMQ');
    }
    return channel;
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
    throw error;
  }
}

export async function queueIngestJob(jobData: any): Promise<string> {
  const ch = await connectRabbitMQ();
  const jobId = uuidv4();

  const message = {
    jobId,
    timestamp: new Date().toISOString(),
    ...jobData
  };

  (ch as any).sendToQueue('ingest', Buffer.from(JSON.stringify(message)), {
    persistent: true,
    messageId: jobId
  });

  console.log(`📤 Queued ingestion job: ${jobId}`);
  return jobId;
}

export async function closeRabbitMQ() {
  if (channel) {
    await (channel as any).close();
  }
  if (connection) {
    await (connection as any).close();
  }
}

export async function checkRabbitMQConnection(): Promise<boolean> {
  try {
    const ch = await connectRabbitMQ();
    return ch !== null;
  } catch (error) {
    console.error('RabbitMQ connection check failed:', error);
    return false;
  }
}