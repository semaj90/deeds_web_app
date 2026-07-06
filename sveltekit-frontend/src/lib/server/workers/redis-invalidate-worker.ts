/**
 * Redis Invalidation Worker
 *
 * Consumes identity update events and invalidates stale cache keys.
 * Non-blocking failure behavior (cache stale doesn''t block success).
 */

import amqp from 'amqplib';
import Redis from 'ioredis';
import { ENV } from '$lib/server/env.server.js';
import type { IdentityUpdatedEvent } from './mirror-sync-publisher.js';

let channel: any = null;
let redis: Redis | null = null;
const QUEUE_NAME = 'redis-invalidate-workers';

export async function startRedisInvalidateWorker(): Promise<void> {
  try {
    const connection = await (amqp as any).connect(ENV.RABBITMQ_URL);
    channel = await connection.createChannel();

    redis = new Redis({
      host: ENV.REDIS_HOST || 'localhost',
      port: ENV.REDIS_PORT || 6379,
      password: ENV.REDIS_PASSWORD || 'redis',
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });

    await redis.connect();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    console.log('Redis invalidation worker started:', { queue: QUEUE_NAME });

    channel.consume(QUEUE_NAME, async (msg: any) => {
      if (!msg) return;

      try {
        const event = JSON.parse(msg.content.toString()) as IdentityUpdatedEvent;
        await invalidateRedisCache(event);
        channel?.ack(msg);
      } catch (err) {
        console.warn('Redis invalidation non-blocking error:', err);
        channel?.ack(msg);
      }
    });
  } catch (err) {
    console.error('Failed to start Redis invalidation worker:', err);
    throw err;
  }
}

async function invalidateRedisCache(event: IdentityUpdatedEvent): Promise<void> {
  if (!redis) {
    throw new Error('Redis not initialized');
  }

  const patterns = [
    `bifrost:packet:${event.packet_key}`,
    `bifrost:trace:${event.packet_key}`,
    `bifrost:source:${event.source_ref}`,
    `bifrost:feature:${event.feature_id}`
  ];

  try {
    const pipeline = redis.pipeline();
    for (const pattern of patterns) {
      pipeline.del(pattern);
    }
    await pipeline.exec();

    console.log('Redis cache invalidated:', {
      packet_key: event.packet_key,
      patterns_count: patterns.length
    });
  } catch (err) {
    console.warn('Redis invalidation partial failure (non-blocking):', {
      packet_key: event.packet_key,
      error: err
    });
  }
}

export async function stopRedisInvalidateWorker(): Promise<void> {
  if (channel) {
    try {
      await channel.close();
      channel = null;
    } catch (err) {
      console.warn('Error closing Redis worker channel:', err);
    }
  }

  if (redis) {
    try {
      await redis.quit();
      redis = null;
    } catch (err) {
      console.warn('Error closing Redis connection:', err);
    }
  }
}
