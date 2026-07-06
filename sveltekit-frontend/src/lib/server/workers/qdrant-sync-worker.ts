/**
 * Qdrant Sync Worker
 */

import * as amqp from 'amqplib';
import { db } from '$lib/server/db/client.js';
import { eq } from 'drizzle-orm';
import { atlas_packets } from '$lib/server/db/schema-postgres.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-manager.js';
import type { IdentityUpdatedEvent } from './mirror-sync-publisher.js';

let channel: any = null;
const QUEUE_NAME = 'qdrant-sync-workers';
const RETRY_LIMIT = 3;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export async function startQdrantSyncWorker(): Promise<void> {
  try {
    const connection = await (amqp as any).connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    console.log('Qdrant sync worker started:', { queue: QUEUE_NAME });

    channel.consume(QUEUE_NAME, async (msg: any) => {
      if (!msg) return;

      try {
        const event = JSON.parse(msg.content.toString()) as IdentityUpdatedEvent;
        await processQdrantSync(event);
        channel?.ack(msg);
      } catch (err) {
        console.error('Qdrant sync error:', err);

        const retryCount = (msg.properties.headers['x-retry-count'] as number) || 0;
        if (retryCount < RETRY_LIMIT) {
          channel?.nack(msg, false, true);
        } else {
          channel?.nack(msg, false, false);
        }
      }
    });
  } catch (err) {
    console.error('Failed to start Qdrant sync worker:', err);
    throw err;
  }
}

async function processQdrantSync(event: IdentityUpdatedEvent): Promise<void> {
  if (event.identity_lane === 'quarantine') {
    console.log('Skipping quarantine packet:', { packet_key: event.packet_key });
    return;
  }

  const rows = await db
    .select()
    .from(atlas_packets)
    .where(eq(atlas_packets.packet_key, event.packet_key))
    .limit(1);

  if (!rows || rows.length === 0) {
    throw new Error(`Packet not found: ${event.packet_key}`);
  }

  const packet = rows[0];

  if (!packet.source_ref || !packet.feature_id) {
    throw new Error(`Invalid identity: ${event.packet_key}`);
  }

  if (!packet.qdrant_point_id) {
    console.log('Packet not indexed in Qdrant:', { packet_key: event.packet_key });
    return;
  }

  const qdrant = getQdrantClient();

  const payload: Record<string, unknown> = {
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    identity_lane: packet.identity_lane,
    identity_confidence: packet.identity_confidence,
    recovery_lane: packet.recovery_lane,
    domain_class: packet.domain_class,
    tree_node_id: packet.tree_node_id,
    title_id: packet.title_id,
    community_id: packet.community_id,
    som_cluster: packet.som_cluster
  };

  await (qdrant as any).upsert('codebase_chunks_768', {
    points: [
      {
        id: packet.qdrant_point_id,
        payload
      }
    ]
  });

  console.log('Qdrant payload synced:', {
    packet_key: event.packet_key,
    qdrant_point_id: packet.qdrant_point_id
  });
}

export async function stopQdrantSyncWorker(): Promise<void> {
  if (channel) {
    try {
      await channel.close();
      channel = null;
    } catch (err) {
      console.warn('Error closing Qdrant worker channel:', err);
    }
  }
}
