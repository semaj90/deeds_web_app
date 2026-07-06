/**
 * Mirror Sync Publisher
 *
 * Publishes identity update events to RabbitMQ for mirror workers to consume.
 */

import * as amqp from 'amqplib';

export interface IdentityUpdatedEvent {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  identity_lane: 'canonical' | 'recoverable_1' | 'recoverable_2' | 'mirror_orphan' | 'quarantine';
  mirror_parity: {
    qdrant_synced_at?: string;
    neo4j_synced_at?: string;
    redis_invalidated_at?: string;
  };
  updated_at: string;
  envelope?: Record<string, unknown>;
}

const EXCHANGE_NAME = 'identity.updated';
const QUEUES = {
  qdrant: 'qdrant-sync-workers',
  neo4j: 'neo4j-sync-workers',
  redis: 'redis-invalidate-workers',
  dlq: 'mirror-worker-dlq'
};

const ROUTING_KEYS = {
  canonical: 'identity.canonical',
  recoverable: 'identity.recoverable',
  quarantine: 'identity.quarantine',
  all: 'identity.*'
};

let connection: any = null;
let channel: any = null;
let isReady = false;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export async function initializeMirrorSyncPublisher(): Promise<void> {
  if (isReady && channel) return;

  try {
    connection = await (amqp as any).connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, 'topic', {
      durable: true,
      autoDelete: false
    });

    for (const queueName of Object.values(QUEUES)) {
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': EXCHANGE_NAME,
          'x-dead-letter-routing-key': 'mirror.dlq'
        }
      });
    }

    await channel.bindQueue(QUEUES.qdrant, EXCHANGE_NAME, ROUTING_KEYS.canonical);
    await channel.bindQueue(QUEUES.qdrant, EXCHANGE_NAME, ROUTING_KEYS.recoverable);
    await channel.bindQueue(QUEUES.neo4j, EXCHANGE_NAME, ROUTING_KEYS.all);
    await channel.bindQueue(QUEUES.redis, EXCHANGE_NAME, ROUTING_KEYS.canonical);
    await channel.bindQueue(QUEUES.redis, EXCHANGE_NAME, ROUTING_KEYS.recoverable);
    await channel.bindQueue(QUEUES.dlq, EXCHANGE_NAME, 'mirror.dlq');

    isReady = true;
    console.log('Mirror sync publisher initialized');
  } catch (err) {
    console.error('Failed to initialize mirror sync publisher:', err);
    throw err;
  }
}

export async function publishIdentityUpdatedEvent(
  event: IdentityUpdatedEvent,
  options?: { dryRun?: boolean }
): Promise<void> {
  if (!channel) {
    await initializeMirrorSyncPublisher();
  }

  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  const routingKey =
    event.identity_lane === 'canonical' ? ROUTING_KEYS.canonical :
    event.identity_lane === 'quarantine' ? ROUTING_KEYS.quarantine :
    ROUTING_KEYS.recoverable;

  const message = Buffer.from(JSON.stringify(event));

  if (options?.dryRun) {
    console.log('Dry-run: would publish identity event', { packet_key: event.packet_key, routing_key: routingKey });
    return;
  }

  const published = channel.publish(
    EXCHANGE_NAME,
    routingKey,
    message,
    {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
      headers: {
        'x-packet-key': event.packet_key,
        'x-identity-lane': event.identity_lane,
        'x-event-version': '1'
      }
    }
  );

  if (!published) {
    await new Promise(resolve => channel.once('drain', resolve));
  }

  console.log('Published identity update event:', { packet_key: event.packet_key, routing_key: routingKey });
}

export async function publishBatchIdentityUpdatedEvents(
  events: IdentityUpdatedEvent[],
  options?: { dryRun?: boolean }
): Promise<void> {
  if (!channel) {
    await initializeMirrorSyncPublisher();
  }

  for (const event of events) {
    await publishIdentityUpdatedEvent(event, options);
  }

  console.log('Batch published:', { count: events.length });
}

export async function getMirrorQueueStats(): Promise<Record<string, { messageCount: number; consumerCount: number }>> {
  if (!channel) {
    await initializeMirrorSyncPublisher();
  }

  const stats: Record<string, { messageCount: number; consumerCount: number }> = {};
  for (const queueName of Object.values(QUEUES)) {
    const ok = await channel.checkQueue(queueName);
    stats[queueName] = { messageCount: ok.messageCount, consumerCount: ok.consumerCount };
  }
  return stats;
}

export async function closeMirrorSyncPublisher(): Promise<void> {
  if (channel) {
    try {
      await channel.close();
      channel = null;
    } catch (err) {
      console.warn('Error closing channel:', err);
    }
  }
  if (connection) {
    try {
      await connection.close();
      connection = null;
    } catch (err) {
      console.warn('Error closing connection:', err);
    }
  }
  isReady = false;
}

export async function healthCheckMirrorSync(): Promise<boolean> {
  try {
    if (!channel) {
      await initializeMirrorSyncPublisher();
    }
    if (!channel) return false;
    await channel.checkExchange(EXCHANGE_NAME);
    for (const queueName of Object.values(QUEUES)) {
      await channel.checkQueue(queueName);
    }
    return true;
  } catch (err) {
    console.error('Mirror sync health check failed:', err);
    return false;
  }
}

export const MirrorSyncConfig = {
  EXCHANGE_NAME,
  QUEUES,
  ROUTING_KEYS
};
