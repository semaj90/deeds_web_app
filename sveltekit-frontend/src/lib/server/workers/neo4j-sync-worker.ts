/**
 * Neo4j Sync Worker
 *
 * Consumes identity update events and syncs canonical identity to Neo4j.
 * Creates Packet nodes and provenance edges.
 * Idempotent upsert pattern.
 */

import amqp from 'amqplib';
import { db } from '$lib/server/db/client.js';
import { eq } from 'drizzle-orm';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { ENV } from '$lib/server/env.server.js';
import type { IdentityUpdatedEvent } from './mirror-sync-publisher.js';

let channel: any = null;
const QUEUE_NAME = 'neo4j-sync-workers';
const RETRY_LIMIT = 3;

export async function startNeo4jSyncWorker(): Promise<void> {
  try {
    const connection = await (amqp as any).connect(ENV.RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    console.log('Neo4j sync worker started:', { queue: QUEUE_NAME });

    channel.consume(QUEUE_NAME, async (msg: any) => {
      if (!msg) return;

      try {
        const event = JSON.parse(msg.content.toString()) as IdentityUpdatedEvent;
        await processNeo4jSync(event);
        channel?.ack(msg);
      } catch (err) {
        console.error('Neo4j sync error:', err);

        const retryCount = (msg.properties.headers['x-retry-count'] as number) || 0;
        if (retryCount < RETRY_LIMIT) {
          channel?.nack(msg, false, true);
        } else {
          channel?.nack(msg, false, false);
        }
      }
    });
  } catch (err) {
    console.error('Failed to start Neo4j sync worker:', err);
    throw err;
  }
}

async function processNeo4jSync(event: IdentityUpdatedEvent): Promise<void> {
  // Fetch from Postgres (canonical)
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

  // Note: Actual Neo4j sync would require neo4j-driver
  // This is a stub showing the pattern - implement with driver
  console.log('Neo4j sync would create/update packet node:', {
    packet_key: p.packetKey,
    source_ref: p.sourceRef,
    feature_id: p.featureId,
    identity_lane: p.identityLane
  });

  // In production:
  // - Get Neo4j driver
  // - Upsert Packet node by packet_key
  // - Write provenance fields
  // - Create/update safe topology edges only when fields exist
}

export async function stopNeo4jSyncWorker(): Promise<void> {
  if (channel) {
    try {
      await channel.close();
      channel = null;
    } catch (err) {
      console.warn('Error closing Neo4j worker channel:', err);
    }
  }
}
