// @ts-nocheck
/**
 * Identity Worker — Canonical Identity Resolution
 *
 * Responsibility:
 * 1. Read packets from Postgres
 * 2. Route through identity lanes (canonical/recoverable/quarantine)
 * 3. Validate envelope against Zod schema
 * 4. UPSERT canonical envelope to Postgres
 * 5. Publish identity.updated event → mirror workers
 *
 * This worker runs:
 * - During backfill: batch process 100+ packets
 * - During live indexing: on-demand per packet
 * - Asynchronously: RabbitMQ queue listener
 *
 * Architecture:
 * Read Postgres
 *   ↓ (Router)
 * Canonical / Recoverable / Quarantine
 *   ↓ (Validator)
 * Zod Validation + Envelope Build
 *   ↓ (Upsert)
 * Postgres Commit
 *   ↓ (Publish)
 * RabbitMQ: identity.updated event
 *   ↓ (Async)
 * Mirror Workers: Qdrant/Neo4j/Redis listen
 */

import { db } from '../db/client.js';
import { eq, isNull, and } from 'drizzle-orm';
import { atlasPackets } from '../db/schema-postgres.js';
import {
  validateCanonicalEnvelope,
  type CanonicalEnvelope
} from '../topology/canonical-id-hierarchy.js';
import { createPermissionManager } from '../topology/permission-manager.js';
import { randomUUID } from 'node:crypto';

/**
 * Identity Worker Result — tracks what happened to a packet
 */
export interface IdentityWorkerResult {
  packet_key: string;
  source_ref: string;
  identity_lane: 'canonical' | 'recoverable' | 'quarantine' | 'mirror_orphan';
  canonical_envelope: CanonicalEnvelope | null;
  validation_errors: string[];
  was_updated: boolean;
  action: 'created' | 'updated' | 'skipped' | 'quarantined';
}

/**
 * Build canonical envelope from packet data
 * Uses Zod validation to ensure shape is correct
 */
/**
 * Input shape: a row selected via Drizzle `db.select().from(atlasPackets)`.
 * Drizzle returns camelCase property names (per schema/atlas-packets.ts), NOT the
 * raw snake_case Postgres column names. `repositoryId`/`directoryId`/`fileId`/
 * `moduleId`/`symbolId`/`chunkId`/`userId`/`redisKey` are NOT modeled in the
 * Drizzle schema at all (even though repository_id/directory_id/file_id/module_id/
 * symbol_id/chunk_id exist as live raw columns — see S180-6C schema-gap audit).
 * They will always be undefined here until the schema is extended; the `|| randomUUID()`
 * fallback is therefore always taken for those five fields today.
 */
function buildCanonicalEnvelope(packet: {
  packetKey: string;
  sourceRef: string;
  featureId?: string;
  directoryPath?: string;
  [key: string]: any;
}): CanonicalEnvelope | null {
  try {
    const parts = (packet.sourceRef || '').split('/');
    const fileName = parts[parts.length - 1] || '';
    const dirPath = parts.slice(0, -1).join('/') || '';
    const moduleName = fileName.replace(/\.(ts|js|tsx|jsx)$/, '');

    const envelope: CanonicalEnvelope = {
      // Hierarchy (immutable identity chain)
      // NOTE: repositoryId/directoryId/fileId/moduleId/symbolId/chunkId are not
      // modeled in the Drizzle schema (schema-gap, S180-6C) — always regenerated.
      repository_id: packet.repositoryId || randomUUID(),
      directory_id: packet.directoryId || randomUUID(),
      file_id: packet.fileId || randomUUID(),
      module_id: packet.moduleId || randomUUID(),
      symbol_id: packet.symbolId || randomUUID(),
      feature_id: packet.featureId || `${dirPath}:${moduleName}`,
      packet_key: packet.packetKey,
      chunk_id: packet.chunkId || randomUUID(),

      // Mirrors (store-specific IDs)
      qdrant_point_id: packet.qdrantPointId || undefined,
      neo4j_node_id: packet.neo4jNodeId || undefined,
      redis_key: packet.redisKey || undefined,

      // Topology (coordinates)
      source_ref: packet.sourceRef,
      directory_path: packet.directoryPath || dirPath,
      feature_label: packet.featureLabel || moduleName,

      // Permissions (access control)
      permissions: {
        owner: packet.userId || 'system',
        scope: 'canonical',
        can_write: true,
        can_delete: true
      },

      // Provenance (tracking)
      created_at: packet.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Validate against Zod schema
    const validation = validateCanonicalEnvelope(envelope);
    if (!validation.valid) {
      console.warn(`[identity-worker] Envelope validation failed for ${packet.packetKey}:`, validation.errors);
      return null;
    }

    return envelope;
  } catch (err) {
    console.error(`[identity-worker] Failed to build envelope for ${packet.packetKey}:`, err);
    return null;
  }
}

/**
 * Process a single packet through the identity worker
 *
 * Steps:
 * 1. Read packet from Postgres
 * 2. Build canonical envelope
 * 3. Validate against Zod
 * 4. UPSERT to atlas_packets
 * 5. Return result (will be published as event)
 */
export async function processPacketIdentity(packetKey: string): Promise<IdentityWorkerResult> {
  const startTime = Date.now();

  try {
    // 1. Read packet from Postgres
    const packet = await db
      .select()
      .from(atlasPackets)
      .where(eq(atlasPackets.packetKey, packetKey))
      .limit(1);

    if (!packet || packet.length === 0) {
      return {
        packet_key: packetKey,
        source_ref: '(not found)',
        identity_lane: 'quarantine',
        canonical_envelope: null,
        validation_errors: ['packet not found in Postgres'],
        was_updated: false,
        action: 'skipped'
      };
    }

    if (packet.length > 1) {
      // packet_key has a live UNIQUE constraint (atlas_packets_packet_key_key), so this
      // should be unreachable in practice — fail closed rather than silently pick packet[0].
      console.error(`[identity-worker] Duplicate packet_key rows for ${packetKey} (${packet.length} rows) — failing closed`);
      return {
        packet_key: packetKey,
        source_ref: '(ambiguous)',
        identity_lane: 'quarantine',
        canonical_envelope: null,
        validation_errors: [`duplicate packet_key: ${packet.length} rows matched`],
        was_updated: false,
        action: 'skipped'
      };
    }

    const packetRow = packet[0];

    // 2. Build canonical envelope
    const envelope = buildCanonicalEnvelope(packetRow);
    if (!envelope) {
      return {
        packet_key: packetKey,
        source_ref: packetRow.sourceRef || '(missing)',
        identity_lane: 'quarantine',
        canonical_envelope: null,
        validation_errors: ['failed to build canonical envelope'],
        was_updated: false,
        action: 'quarantined'
      };
    }

    // 3. Validate envelope
    const validation = validateCanonicalEnvelope(envelope);
    if (!validation.valid) {
      const laneOnFailure = validation.recovery_lane ?? 'quarantine';
      console.warn(
        `[identity-worker] Validation failed for ${packetKey}, defaulting identity_lane to '${laneOnFailure}' (errors: ${validation.errors.join(', ')})`
      );
      return {
        packet_key: packetKey,
        source_ref: packetRow.sourceRef || '(missing)',
        identity_lane: laneOnFailure,
        canonical_envelope: null,
        validation_errors: validation.errors,
        was_updated: false,
        action: 'quarantined'
      };
    }

    // 4. UPSERT canonical envelope to Postgres
    const identityLane = validation.recovery_lane ?? 'canonical';
    const permissionMgr = createPermissionManager(envelope);

    // Only write if permissions allow (canonical lane can write/delete)
    if (!permissionMgr.canWrite()) {
      return {
        packet_key: packetKey,
        source_ref: packetRow.sourceRef || '(missing)',
        identity_lane: identityLane,
        canonical_envelope: null,
        validation_errors: ['insufficient permissions to write'],
        was_updated: false,
        action: 'skipped'
      };
    }

    // Update packet with canonical identity
    // NOTE (S180-6C fix): only feature_id/identity_lane/identity_confidence/updated_at
    // are actually modeled as Drizzle columns on atlasPackets (schema/atlas-packets.ts).
    // repository_id/directory_id/file_id/module_id/symbol_id/chunk_id exist as raw
    // Postgres columns but have NO Drizzle property — passing them here previously
    // either silently dropped them or threw, and the `.where()` below used a
    // nonexistent `packet_key` property (eq(undefined, packetKey)), so this UPDATE
    // never reliably matched a row. Until the schema is extended to model those six
    // uuid columns (tracked separately), they cannot be written through this path.
    try {
      await db
        .update(atlasPackets)
        .set({
          featureId: envelope.feature_id,
          identityLane: identityLane,
          identityConfidence: validation.confidence ?? 0,
          updatedAt: new Date()
        })
        .where(eq(atlasPackets.packetKey, packetKey));

      console.log(
        `[identity-worker] ✅ ${packetKey} → ${identityLane} (${Date.now() - startTime}ms)`
      );

      return {
        packet_key: packetKey,
        source_ref: packetRow.sourceRef || '(missing)',
        identity_lane: identityLane,
        canonical_envelope: envelope,
        validation_errors: [],
        was_updated: true,
        action: identityLane === 'canonical' ? 'created' : 'updated'
      };
    } catch (updateErr) {
      console.error(`[identity-worker] Update failed for ${packetKey}:`, updateErr);
      return {
        packet_key: packetKey,
        source_ref: packetRow.sourceRef || '(missing)',
        identity_lane: identityLane,
        canonical_envelope: envelope,
        validation_errors: ['Postgres update failed'],
        was_updated: false,
        action: 'skipped'
      };
    }
  } catch (err) {
    console.error(`[identity-worker] Error processing ${packetKey}:`, err);
    return {
      packet_key: packetKey,
      source_ref: '(error)',
      identity_lane: 'quarantine',
      canonical_envelope: null,
      validation_errors: [err instanceof Error ? err.message : 'Unknown error'],
      was_updated: false,
      action: 'skipped'
    };
  }
}

/**
 * Batch process packets through the identity worker
 *
 * Returns array of results (suitable for publishing as events)
 */
export async function batchProcessIdentity(
  packetKeys: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<IdentityWorkerResult[]> {
  const results: IdentityWorkerResult[] = [];

  for (let i = 0; i < packetKeys.length; i++) {
    const result = await processPacketIdentity(packetKeys[i]);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, packetKeys.length);
    }
  }

  return results;
}

/**
 * Export worker for RabbitMQ event listener
 * Handles incoming 'identity.backfill' events
 */
export async function handleIdentityBackfillEvent(message: {
  packetKeys: string[];
  batchId: string;
}) {
  console.log(`[identity-worker] Processing batch ${message.batchId} (${message.packetKeys.length} packets)`);

  const results = await batchProcessIdentity(message.packetKeys, (completed, total) => {
    console.log(`[identity-worker] Progress: ${completed}/${total}`);
  });

  // Summary
  const canonical = results.filter((r) => r.identity_lane === 'canonical').length;
  const recoverable = results.filter((r) => r.identity_lane === 'recoverable').length;
  const quarantine = results.filter((r) => r.identity_lane === 'quarantine').length;

  console.log(
    `[identity-worker] Batch ${message.batchId} complete: ` +
      `canonical=${canonical}, recoverable=${recoverable}, quarantine=${quarantine}`
  );

  // Return summary for RabbitMQ acknowledgment
  return {
    batchId: message.batchId,
    totalProcessed: results.length,
    canonical,
    recoverable,
    quarantine,
    updated: results.filter((r) => r.was_updated).length
  };
}
