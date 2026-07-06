/**
 * Mirror Sync Publisher — Async Event Emission
 *
 * Architecture:
 * Postgres commit
 *   ↓ (Identity Worker)
 * Publish identity.updated → RabbitMQ
 *   ↓ (Non-blocking)
 * Mirror workers subscribe and listen:
 *   - Qdrant worker: sync payload
 *   - Neo4j worker: sync topology node
 *   - Redis worker: cache invalidation
 *
 * This ensures:
 * - Postgres is always updated FIRST (truth)
 * - Mirrors are updated AFTER (async, non-blocking)
 * - If mirror update fails, doesn't break identity worker
 * - Audit trail in RabbitMQ for debugging
 */

import type { IdentityWorkerResult } from './identity-worker.js';

/**
 * Event payload published to RabbitMQ after identity update
 */
export interface IdentityUpdatedEvent {
  packetKey: string;
  sourceRef: string;
  identityLane: 'canonical' | 'recoverable' | 'quarantine' | 'mirror_orphan';
  canonicalEnvelope: any; // CanonicalEnvelope
  action: 'created' | 'updated' | 'skipped' | 'quarantined';
  timestamp: string;
  workerId: string;
}

/**
 * Publish identity.updated event to RabbitMQ
 *
 * Subscribers:
 * - qdrant-sync-worker: listens and syncs payload to Qdrant
 * - neo4j-sync-worker: listens and syncs node to Neo4j
 * - redis-invalidate-worker: listens and invalidates cache
 */
export async function publishIdentityUpdatedEvent(
  result: IdentityWorkerResult,
  workerId: string = 'identity-worker'
): Promise<void> {
  if (!result.was_updated) {
    // Don't publish events for skipped packets
    return;
  }

  try {
    // This would normally publish to RabbitMQ
    // For now, just log (v1 non-blocking stub)
    const event: IdentityUpdatedEvent = {
      packetKey: result.packet_key,
      sourceRef: result.source_ref,
      identityLane: result.identity_lane,
      canonicalEnvelope: result.canonical_envelope,
      action: result.action,
      timestamp: new Date().toISOString(),
      workerId
    };

    console.log(
      `[mirror-sync-publisher] Published: identity.updated → ${result.packet_key} (action: ${result.action})`
    );

    // TODO: Wire RabbitMQ publisher
    // const channel = await getRabbitMQChannel();
    // await channel.publish('legal.updates', 'identity.updated', Buffer.from(JSON.stringify(event)), {
    //   persistent: true,
    //   contentType: 'application/json'
    // });
  } catch (err) {
    // Non-blocking: if publishing fails, just log
    // Mirrors can be synced via manual backfill if needed
    console.warn(`[mirror-sync-publisher] Failed to publish event for ${result.packet_key}:`, err);
  }
}

/**
 * Publish batch of identity.updated events
 */
export async function publishBatchIdentityUpdatedEvents(
  results: IdentityWorkerResult[],
  workerId: string = 'identity-worker'
): Promise<void> {
  const events = results
    .filter((r) => r.was_updated)
    .map((r) => ({
      packetKey: r.packet_key,
      sourceRef: r.source_ref,
      identityLane: r.identity_lane,
      canonicalEnvelope: r.canonical_envelope,
      action: r.action,
      timestamp: new Date().toISOString(),
      workerId
    }));

  if (events.length === 0) {
    return; // Nothing to publish
  }

  console.log(`[mirror-sync-publisher] Publishing ${events.length} identity.updated events`);

  try {
    // TODO: Batch publish to RabbitMQ
    // for (const event of events) {
    //   const channel = await getRabbitMQChannel();
    //   await channel.publish('legal.updates', 'identity.updated', Buffer.from(JSON.stringify(event)), {
    //     persistent: true,
    //     contentType: 'application/json'
    //   });
    // }

    console.log(`[mirror-sync-publisher] Published ${events.length} events`);
  } catch (err) {
    console.warn(`[mirror-sync-publisher] Batch publish failed:`, err);
  }
}

/**
 * Future mirror workers (stubs for Session 114+)
 */

/**
 * Qdrant Sync Worker
 * Listens to identity.updated events
 * Syncs canonical envelope payload to Qdrant
 */
export async function handleQdrantSyncEvent(event: IdentityUpdatedEvent): Promise<void> {
  console.log(`[qdrant-sync-worker] Syncing ${event.packetKey} to Qdrant`);
  // TODO: Implement
  // 1. Fetch Qdrant point by packet_key
  // 2. Update payload with canonical_envelope fields
  // 3. Publish qdrant.synced event
}

/**
 * Neo4j Sync Worker
 * Listens to identity.updated events
 * Syncs topology node to Neo4j
 */
export async function handleNeo4jSyncEvent(event: IdentityUpdatedEvent): Promise<void> {
  console.log(`[neo4j-sync-worker] Syncing ${event.packetKey} to Neo4j`);
  // TODO: Implement
  // 1. Create or update Neo4j node for packet
  // 2. Add edges: BELONGS_TO_DIRECTORY, BELONGS_TO_FEATURE, etc.
  // 3. Publish neo4j.synced event
}

/**
 * Redis Cache Invalidation Worker
 * Listens to identity.updated events
 * Invalidates related cache keys
 */
export async function handleRedisCacheInvalidationEvent(event: IdentityUpdatedEvent): Promise<void> {
  console.log(`[redis-invalidate-worker] Invalidating cache for ${event.packetKey}`);
  // TODO: Implement
  // 1. Delete bifrost:packet:{packetKey}
  // 2. Delete bifrost:feature:{featureId}:packets
  // 3. Delete bifrost:directory:{directoryPath}:packets
  // 4. Publish redis.invalidated event
}
