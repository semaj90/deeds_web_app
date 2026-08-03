/**
 * Qdrant Sync Worker
 */

import * as amqp from 'amqplib';
import { db } from '$lib/server/db/client.js';
import { eq } from 'drizzle-orm';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
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
    .from(atlasPackets)
    .where(eq(atlasPackets.packetKey, event.packet_key))
    .limit(1);

  if (!rows || rows.length === 0) {
    throw new Error(`Packet not found: ${event.packet_key}`);
  }

  const packet = rows[0];

  const p = packet as any;

  if (!p.sourceRef || !p.featureId) {
    throw new Error(`Invalid identity: ${event.packet_key}`);
  }

  if (!p.qdrantPointId) {
    console.log('Packet not indexed in Qdrant:', { packet_key: event.packet_key });
    return;
  }

  const qdrant = getQdrantClient();

  const payload: Record<string, unknown> = {
    packet_key: p.packetKey,
    source_ref: p.sourceRef,
    feature_id: p.featureId,
    identity_lane: p.identityLane,
    identity_confidence: p.identityConfidence,
    recovery_lane: p.recoveryLane,
    domain_class: p.domainClass,
    tree_node_id: p.treeNodeId,
    title_id: p.titleId,
    community_id: p.communityId,
    som_cluster: p.somCluster
  };

  await (qdrant as any).upsert('codebase_chunks_768', {
    points: [
      {
        id: p.qdrantPointId,
        payload
      }
    ]
  });

  console.log('Qdrant payload synced:', {
    packet_key: event.packet_key,
    qdrant_point_id: p.qdrantPointId
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
