/**
 * Redis Invalidation Worker
 *
 * Consumes identity update events and invalidates stale cache keys.
 * Non-blocking failure behavior (cache stale doesn''t block success).
 *
 * DEAD CODE, confirmed 2026-09-04 (BITFROST-INVALIDATION-OWNER-01 audit):
 * startRedisInvalidateWorker()/stopRedisInvalidateWorker() have zero callers
 * anywhere in the repo -- this RabbitMQ consumer is never started. Left in
 * place (archive-not-delete) rather than removed, but its key logic below is
 * fixed to the real live shape / delegated to the canonical invalidator so it
 * isn't a landmine if it's ever wired up later. See
 * docs/reports/parent-atlas-bitfrost-invalidation-owner-v1.json.
 */

import amqp from 'amqplib';
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import { ENV } from '$lib/server/env.server.js';
import { invalidateBitfrostPacket } from '$lib/server/cache/atlas-reward-cache.js';
import type { IdentityUpdatedEvent } from './mirror-sync-publisher.js';

let channel: any = null;
let redis: ReturnType<typeof getValkeyClient> | null = null;
const QUEUE_NAME = 'redis-invalidate-workers';

export async function startRedisInvalidateWorker(): Promise<void> {
  try {
    const connection = await (amqp as any).connect(ENV.RABBITMQ_URL);
    channel = await connection.createChannel();

    redis = getValkeyClient().duplicate({
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

  const result = await invalidateBitfrostPacket(redis, {
    packetKey: event.packet_key,
    featureId: event.feature_id,
  });

  if (!result.ok) {
    console.warn('Redis invalidation partial failure (non-blocking):', {
      packet_key: event.packet_key,
      error: result.error
    });
    return;
  }

  console.log('Redis cache invalidated:', {
    packet_key: event.packet_key,
    keys_deleted: result.keysDeleted
  });
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
