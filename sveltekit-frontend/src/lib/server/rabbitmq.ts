// Type definitions for amqplib when types aren't available
type AmqpChannel = {
  prefetch: (count: number) => Promise<void>;
  assertQueue: (queue: string, options?: Record<string, unknown>) => Promise<unknown>;
  assertExchange: (exchange: string,
    type: string,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  bindQueue: (queue: string, exchange: string, routingKey: string) => Promise<unknown>;
  sendToQueue: (queue: string, content: Buffer, options?: Record<string, unknown>) => boolean;
  consume: (queue: string, callback: (msg: unknown) => void) => Promise<unknown>;
  ack: (msg: unknown) => void;
  nack: (msg: unknown, allUpTo?: boolean, requeue?: boolean) => void;
  on: (event: string; callback: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

type AmqpConnection = {
  createChannel: () => Promise<AmqpChannel>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

let connection: AmqpConnection | null = null;
let channel: AmqpChannel | null = null;

export const QUEUES = {
  evidence: { process: 'evidence.process.queue',
    analyze: 'evidence.analyze.queue',
    response: 'evidence.response.queue',
  },
	ai: { analysis: 'ai.analysis.queue',
    embedding: 'ai.embedding.queue',
    response: 'ai.response.queue',
  },
	notification: { email: 'notification.email.queue',
    webhook: 'notification.webhook.queue',
  },
	};

export async function getConnection(): Promise<AmqpConnection> {
  if (connection) return connection;
  const rabbitmqUrl = process.env?.RABBITMQ_URL ?? 'amqp://legal_admin:123456@localhost:5672';
  console.log('🐰 Connecting to RabbitMQ:', rabbitmqUrl);
  try {
    const amqp = await import('amqplib');
    const amqpModule = amqp as {
      default?: { connect: (url: string) => Promise<AmqpConnection> };
      connect?: (url: string) => Promise<AmqpConnection>;
    };
    const connectFn = amqpModule.default?.connect ?? amqpModule.connect;
    if (!connectFn) throw new Error('amqplib connect function not found');
    connection = await connectFn(rabbitmqUrl);
    (connection as any).on('error', (err: Error) => {
      console.error('❌ RabbitMQ connection error:', err);
      connection = null;
      channel = null;
    });
    (connection as any).on('close', () => {
      console.log('🔌 RabbitMQ connection closed');
      connection = null;
      channel = null;
    });
    return connection;
  } catch (err) {
    console.error('Failed to connect to RabbitMQ:', err);
    throw err;
  }
}

export async function getChannel(): Promise<AmqpChannel> {
  if (channel) return channel;
  const conn = await getConnection();
  try {
    channel = await (conn as any).createChannel();
    await (channel as any).prefetch(1);
    (channel as any).on('error', (err: Error) => {
      console.error('❌ RabbitMQ channel error:', err);
      channel = null;
    });
    (channel as any).on('close', () => {
      console.log('📺 RabbitMQ channel closed');
      channel = null;
    });
    return channel;
  } catch (err) {
    console.error('Failed to create channel:', err);
    throw err;
  }
}

export async function publishToQueue(queueName: string, payload: any): Promise<boolean> {
  try {
    const ch = await getChannel();
    await ch.assertQueue(queueName, { durable: true });

    const message = JSON.stringify(payload);
    const sent = ch.sendToQueue(queueName, Buffer.from(message), {
      persistent: true,
      timestamp: Date.now(),
      messageId: payload?.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

    if (!sent) {
      console.warn(`Queue ${queueName} buffer full`);
      return false;
    }

    console.log(`📤 Published to ${queueName}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to publish to ${queueName}:`, error);
    return false;
  }
}

export async function consumeFromQueue(
  queueName: string,
  processor: (payload: any, ack: () => void, nack: () => void) => Promise<void>
): Promise<void> {
  try {
    const ch = await getChannel();
    await ch.assertQueue(queueName, { durable: true });

    console.log(`🔄 Starting consumer for ${queueName}`);

    await ch.consume(queueName, async (msg) => {
      if (!msg) return;

      const typedMsg = msg as { content: Buffer };
      const ack = () => ch.ack(msg);
      // Don't requeue by default to avoid loops
      const nack = () => ch.nack(msg, false, false);

      try {
        const content = JSON.parse(typedMsg.content.toString());
        await processor(content, ack, nack);
      } catch (err) {
        console.error(`❌ Error processing message from ${queueName}:`, err);
        nack();
      }
    });
  } catch (error) {
    console.error(`❌ Failed to consume from ${queueName}:`, error);
    throw error;
  }
}

export async function setupQueues(): Promise<void> {
  try {
    const ch = await getChannel();

    // Setup DLX
    await ch.assertExchange('evidence.dlx', 'direct', { durable: true });
    await ch.assertQueue('evidence.failed', {
      durable: true,
      arguments: { 'x-message-ttl': 86400000 },
	});
    await ch.bindQueue('evidence.failed', 'evidence.dlx', 'failed');

    // Assert all defined queues
    const allQueues = [
      ...Object.values(QUEUES.evidence),
      ...Object.values(QUEUES.ai),
      ...Object.values(QUEUES.notification),
    ];

    for (const q of allQueues) {
      await ch.assertQueue(q, {
        durable: true,
        deadLetterExchange: 'evidence.dlx',
        deadLetterRoutingKey: 'failed',
      });
    }

    console.log('✅ RabbitMQ setup complete');
  } catch (error) {
    console.error('❌ Failed to setup RabbitMQ queues:', error);
    throw error;
  }
}

export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    console.log('✅ RabbitMQ connections closed gracefully');
  } catch (error) {
    console.error('❌ Error closing RabbitMQ:', error);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const conn = await getConnection();
    return true;
  } catch (error) {
    console.error('❌ RabbitMQ health check failed:', error);
    return false;
  }
}

export const rabbitmqService = {
  getConnection,
  getChannel,
  setupQueues,
  publishToQueue,
  consumeFromQueue,
  healthCheck,
  closeRabbitMQ,
};
