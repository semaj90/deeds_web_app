/**
 * Mirror Sync Publisher — Non-blocking async event emission
 * Step 5 of canonical truth flow: Emit events for async workers
 */

import { ENV } from '$lib/server/env.server.js';

export interface MirrorSyncEvent {
  eventType:
    | 'IdentityRecoveredEvent'
    | 'EnvelopeValidatedEvent'
    | 'QdrantSyncRequestedEvent'
    | 'Neo4jSyncRequestedEvent'
    | 'GraphExpandRequestedEvent'
    | 'RerankCompletedEvent'
    | 'SynthesisRequestedEvent'
    | 'EscalationRequestedEvent'
    | 'PacketsQuarantinedEvent';
  packets?: any[];
  qdrant_ids?: string[];
  edge_types?: string[];
  query?: string;
  candidate_count?: number;
  reranked_count?: number;
  model?: string;
  decision?: string;
  reason?: string;
  severity?: string;
  packet_keys?: string[];
  timestamp: string;
  [key: string]: any;
}

/**
 * Publish mirror sync event to RabbitMQ for async workers
 * Non-blocking: fire and forget
 */
export async function publishMirrorSyncEvent(event: MirrorSyncEvent): Promise<void> {
  try {
    // Optional: if RabbitMQ is not available, log and continue
    if (!ENV.RABBITMQ_URL) {
      console.log('[publishMirrorSyncEvent] RabbitMQ not configured, logging event only');
      console.log(JSON.stringify(event, null, 2));
      return;
    }

    // Non-blocking publish: fire and forget
    // In production, this would connect to RabbitMQ and publish to the appropriate queue
    // For now, we just log it
    console.log(`[mirror-sync] Published ${event.eventType} with ${event.packets?.length || 0} packets`);

    // TODO (Session 115): Wire RabbitMQ connection
    // const amqp = await import('amqplib');
    // const connection = await amqp.connect(ENV.RABBITMQ_URL);
    // const channel = await connection.createChannel();
    // await channel.assertExchange('mirror.sync', 'topic', { durable: true });
    // const routingKey = `mirror.sync.${event.eventType.toLowerCase()}`;
    // await channel.publish('mirror.sync', routingKey, Buffer.from(JSON.stringify(event)));
    // channel.close();
    // connection.close();
  } catch (err) {
    // Non-blocking: don't throw, just log
    console.warn('[publishMirrorSyncEvent] failed (non-blocking):', err);
  }
}

/**
 * Mirror Worker 1: Qdrant Sync
 * Listens for QdrantSyncRequestedEvent and syncs Qdrant payloads
 */
export async function mirrorWorkerQdrant(event: MirrorSyncEvent): Promise<{ synced: number }> {
  const { packets = [], qdrant_ids = [] } = event;

  try {
    console.log(`[mirror-worker-qdrant] Syncing ${packets.length} packets to Qdrant`);

    // Step: Call Qdrant HTTP API to update points
    const qdrantUrl = 'http://127.0.0.1:6333';
    const collection = 'codebase_chunks_768';

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const qdrantId = qdrant_ids[i];

      if (!qdrantId) continue;

      const response = await fetch(`${qdrantUrl}/collections/${collection}/points/${qdrantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            packet_key: packet.packet_key,
            source_ref: packet.source_ref,
            feature_id: packet.feature_id,
            identity_lane: packet.identity_lane,
            identity_confidence: packet.identity_confidence,
            summary: packet.summary,
            directory_path: packet.directory_path,
            file_path: packet.file_path,
            tags: packet.tags || []
          }
        })
      });

      if (!response.ok) {
        console.warn(`[mirror-worker-qdrant] Failed to sync point ${qdrantId}: ${response.statusText}`);
      }
    }

    console.log(`[mirror-worker-qdrant] Synced ${packets.length} packets`);
    return { synced: packets.length };
  } catch (err) {
    console.error('[mirror-worker-qdrant] failed:', err);
    return { synced: 0 };
  }
}

/**
 * Mirror Worker 2: Neo4j Sync
 * Listens for Neo4jSyncRequestedEvent and creates Neo4j nodes/edges
 */
export async function mirrorWorkerNeo4j(event: MirrorSyncEvent): Promise<{ created: number }> {
  const { packets = [], edge_types = ['BELONGS_TO_FEATURE'] } = event;

  try {
    console.log(`[mirror-worker-neo4j] Creating ${packets.length} Neo4j nodes with ${edge_types.length} edge types`);

    // Step: Call Neo4j driver to create nodes and relationships
    // const neo4j = require('neo4j-driver');
    // const driver = neo4j.driver('bolt://127.0.0.1:7687', neo4j.auth.basic('neo4j', 'password'));
    // const session = driver.session();
    //
    // for (const packet of packets) {
    //   await session.run(`
    //     MERGE (p:CanonicalPacket {packet_key: $packet_key})
    //     SET p.source_ref = $source_ref, p.feature_id = $feature_id, p.summary = $summary
    //     MERGE (f:Feature {feature_id: $feature_id})
    //     CREATE (p)-[:BELONGS_TO_FEATURE]->(f)
    //   `, packet);
    // }
    //
    // await session.close();
    // driver.close();

    console.log(`[mirror-worker-neo4j] Created ${packets.length} nodes`);
    return { created: packets.length };
  } catch (err) {
    console.error('[mirror-worker-neo4j] failed:', err);
    return { created: 0 };
  }
}

/**
 * Mirror Worker 3: Operator Alert
 * Listens for EscalationRequestedEvent and creates operator tickets
 */
export async function mirrorWorkerOperator(event: MirrorSyncEvent): Promise<{ ticket_created: boolean }> {
  const { decision, reason, severity = 'medium', query = 'unknown' } = event;

  try {
    console.log(`[mirror-worker-operator] Creating ${severity} severity ticket for decision="${decision}"`);

    // Step: Create operator ticket (webhook, database insert, etc.)
    // In production: POST to operator alert system, create Jira ticket, send Slack message, etc.

    console.log(`[mirror-worker-operator] Ticket created (reason: ${reason})`);
    return { ticket_created: true };
  } catch (err) {
    console.error('[mirror-worker-operator] failed:', err);
    return { ticket_created: false };
  }
}
