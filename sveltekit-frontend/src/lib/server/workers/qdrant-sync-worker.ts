/**
 * Qdrant Sync Worker
 */

import * as amqp from 'amqplib';
import { db } from '$lib/server/db/client.js';
import { eq } from 'drizzle-orm';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { CODEBASE_COLLECTION_PRIORITY } from '$lib/server/retrieval/collection-aliases.js';
import { buildQdrantSyncPayload } from '$lib/server/retrieval/qdrant-sync-payload.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-manager.js';
import type { IdentityUpdatedEvent } from './mirror-sync-publisher.js';

let channel: any = null;
const QUEUE_NAME = 'qdrant-sync-workers';
const RETRY_LIMIT = 3;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

/**
 * Payload sync is a canonical projection write, not a serving-alias write.
 * Keep it pinned to the first canonical collection owner so an operator alias
 * cannot redirect identity/revision payload updates back into a legacy lane.
 */
export const QDRANT_SYNC_COLLECTION = CODEBASE_COLLECTION_PRIORITY[0];

export async function startQdrantSyncWorker(): Promise<void> {
  try {
    const connection = await (amqp as any).connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    console.log('Qdrant sync worker started:', {
      queue: QUEUE_NAME,
      collection: QDRANT_SYNC_COLLECTION,
    });

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

  if (!p.packetKey || !p.sourceRef || !p.featureId || !p.workspaceId) {
    throw new Error(`Invalid identity: ${event.packet_key}`);
  }

  if (!p.qdrantPointId) {
    console.log('Packet not indexed in Qdrant:', { packet_key: event.packet_key });
    return;
  }

  const qdrant = getQdrantClient();
  const payload: Record<string, unknown> = buildQdrantSyncPayload(p);

  // This worker owns payload synchronization only. It must never create or
  // replace the semantic vector while repairing identity/revision lineage.
  // Require the canonical-v2 point to exist, then use Qdrant's payload-only
  // mutation API. Historical points absent from v2 remain a reconciliation
  // problem rather than being silently recreated without a vector.
  const existing = await (qdrant as any).retrieve(QDRANT_SYNC_COLLECTION, {
    ids: [p.qdrantPointId],
    with_payload: false,
    with_vector: false,
  });

  if (!Array.isArray(existing) || existing.length !== 1) {
    console.log('Packet point not present in canonical Qdrant collection:', {
      packet_key: event.packet_key,
      qdrant_point_id: p.qdrantPointId,
      collection: QDRANT_SYNC_COLLECTION,
    });
    return;
  }

  await (qdrant as any).setPayload(QDRANT_SYNC_COLLECTION, {
    payload,
    points: [p.qdrantPointId],
    wait: true,
  });

  console.log('Qdrant payload synced:', {
    packet_key: event.packet_key,
    qdrant_point_id: p.qdrantPointId,
    collection: QDRANT_SYNC_COLLECTION,
    mutation: 'setPayload',
    vector_write: false,
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
