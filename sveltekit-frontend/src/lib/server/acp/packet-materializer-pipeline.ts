/**
 * ACP Packet Materializer Pipeline — 5-Step Truth Flow
 *
 * Persist canonical packets to all mirrors in strict order:
 * 1. Read from Postgres (canonical source)
 * 2. Transform/Validate (CPU work)
 * 3. Write to Postgres (update truth)
 * 4. Invalidate Caches (Redis)
 * 5. Emit Events (NATS/EventEmitter)
 *
 * This is the durable persistence layer for the canonical 5-step truth flow.
 */

import type { PacketTopologyEnvelope } from '../db/packet-topology-envelope.js';
import type { PoolClient } from 'pg';
import { generateTitleIdentity } from '../ace/title-id-generator.js';

// Canonical title_id format: title:<slug>:<8-char-hex> where slug = [a-z0-9]+(-[a-z0-9]+)*
const CANONICAL_TITLE_RE = /^title:[a-z0-9]+(?:-[a-z0-9]+)*:[a-f0-9]{8}$/;

/**
 * Configuration for materialization behavior
 */
export interface MaterializationConfig {
  writePostgres: boolean;
  invalidateRedis: boolean;
  emitEvents: boolean;
  writeQdrant: boolean;
  writeNeo4j: boolean;
  dryRun: boolean;
}

/**
 * Result of a materialization operation
 */
export interface MaterializationResult {
  packetKey: string;
  step1_postgres_read: { success: boolean; error?: string };
  step2_validate: { success: boolean; error?: string };
  step3_postgres_write: { success: boolean; error?: string };
  step4_redis_invalidate: { success: boolean; error?: string };
  step5_emit_events: { success: boolean; error?: string };
  totalDurationMs: number;
  dryRun: boolean;
}

/**
 * Materialize a single canonical packet through the 5-step pipeline
 */
export async function materializePacket(
  packet: PacketTopologyEnvelope,
  context: MaterializationContext,
  config: Partial<MaterializationConfig> = {}
): Promise<MaterializationResult> {
  const startTime = Date.now();
  const cfg: MaterializationConfig = {
    writePostgres: config.writePostgres ?? true,
    invalidateRedis: config.invalidateRedis ?? true,
    emitEvents: config.emitEvents ?? true,
    writeQdrant: config.writeQdrant ?? true,
    writeNeo4j: config.writeNeo4j ?? true,
    dryRun: config.dryRun ?? false,
  };

  const result: MaterializationResult = {
    packetKey: packet.packet_key,
    step1_postgres_read: { success: false },
    step2_validate: { success: false },
    step3_postgres_write: { success: false },
    step4_redis_invalidate: { success: false },
    step5_emit_events: { success: false },
    totalDurationMs: 0,
    dryRun: cfg.dryRun,
  };

  try {
    // Step 1: Read from Postgres (canonical source)
    if (cfg.writePostgres) {
      try {
        const existing = await readPacketFromPostgres(packet.packet_key, context.pgClient);
        result.step1_postgres_read = {
          success: true,
        };
      } catch (err: any) {
        result.step1_postgres_read = {
          success: false,
          error: err.message,
        };
        // Don't fail pipeline; packet may not exist yet
      }
    } else {
      result.step1_postgres_read = { success: true };
    }

    // Step 2: Transform/Validate (CPU work, no I/O)
    try {
      validatePacketStructure(packet);
      result.step2_validate = { success: true };
    } catch (err: any) {
      result.step2_validate = {
        success: false,
        error: err.message,
      };
      throw err; // Hard fail on validation
    }

    // Step 3: Write to Postgres (canonical truth)
    if (cfg.writePostgres && !cfg.dryRun) {
      try {
        await writePacketToPostgres(packet, context.pgClient);
        result.step3_postgres_write = { success: true };
      } catch (err: any) {
        result.step3_postgres_write = {
          success: false,
          error: err.message,
        };
        throw err; // Hard fail; Postgres write is critical
      }
    } else {
      result.step3_postgres_write = { success: true };
    }

    // Step 4: Invalidate Redis cache (AFTER Postgres succeeds)
    if (cfg.invalidateRedis && !cfg.dryRun) {
      try {
        await invalidateRedisCache(packet, context);
        result.step4_redis_invalidate = { success: true };
      } catch (err: any) {
        result.step4_redis_invalidate = {
          success: false,
          error: err.message,
        };
        // Don't fail pipeline; cache miss is recoverable
      }
    } else {
      result.step4_redis_invalidate = { success: true };
    }

    // Step 5: Emit events (non-blocking)
    if (cfg.emitEvents && !cfg.dryRun) {
      try {
        await emitPacketEvents(packet, context);
        result.step5_emit_events = { success: true };
      } catch (err: any) {
        result.step5_emit_events = {
          success: false,
          error: err.message,
        };
        // Don't fail pipeline; event listeners are non-critical
      }
    } else {
      result.step5_emit_events = { success: true };
    }
  } finally {
    result.totalDurationMs = Date.now() - startTime;
  }

  return result;
}

/**
 * Materialize multiple packets in batch (parallel or sequential)
 */
export async function materializePacketBatch(
  packets: PacketTopologyEnvelope[],
  context: MaterializationContext,
  config: Partial<MaterializationConfig> = {},
  parallel: boolean = false
): Promise<MaterializationResult[]> {
  if (parallel) {
    return Promise.all(packets.map((p) => materializePacket(p, context, config)));
  } else {
    const results: MaterializationResult[] = [];
    for (const packet of packets) {
      results.push(await materializePacket(packet, context, config));
    }
    return results;
  }
}

/**
 * Materialization context (dependencies)
 */
export interface MaterializationContext {
  pgClient: PoolClient;
  redisClient?: any; // ioredis.Redis
  natsClient?: any; // nats.Client
  eventEmitter?: any; // EventEmitter
}

// ─────────────────────────────────────────────────────────────────────
// Step implementations
// ─────────────────────────────────────────────────────────────────────

/**
 * Step 1: Read existing packet from Postgres
 */
async function readPacketFromPostgres(
  packetKey: string,
  pgClient: PoolClient
): Promise<PacketTopologyEnvelope | null> {
  const query = `
    SELECT * FROM atlas_packets
    WHERE packet_key = $1
    LIMIT 1
  `;

  const result = await pgClient.query(query, [packetKey]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Step 2: Validate packet structure
 */
function validatePacketStructure(packet: PacketTopologyEnvelope): void {
  // Required fields
  if (!packet.packet_key || typeof packet.packet_key !== 'string') {
    throw new Error('Invalid packet_key');
  }
  if (!packet.source_ref || typeof packet.source_ref !== 'string') {
    throw new Error('Invalid source_ref');
  }
  if (!packet.feature_id || typeof packet.feature_id !== 'string') {
    throw new Error('Invalid feature_id');
  }

  // Array fields
  if (!Array.isArray(packet.semantic_tags)) {
    throw new Error('semantic_tags must be array');
  }
  if (!Array.isArray(packet.topological_neighbors)) {
    throw new Error('topological_neighbors must be array');
  }
  if (!Array.isArray(packet.neo4j_edges)) {
    throw new Error('neo4j_edges must be array');
  }
}

/**
 * Step 3: Write packet to Postgres
 *
 * Enforces canonical title_id format before persisting. Any non-canonical value
 * (gRPC passthrough, legacy format, missing value) is regenerated here so the DB
 * never receives a non-canonical title_id regardless of how the packet was assembled.
 */
async function writePacketToPostgres(
  packet: PacketTopologyEnvelope,
  pgClient: PoolClient
): Promise<void> {
  // Canonical title_id guard: must match `title:<slug>:<8-char-hex>` pattern.
  // Regenerate if missing or not in canonical format.
  if (!packet.title_id || !CANONICAL_TITLE_RE.test(packet.title_id)) {
    const enrichedPacket = {
      ...packet,
      title_id: generateTitleIdentity(packet.packet_key, {
        featureId: packet.feature_id ?? undefined,
      }).titleId,
    };
    packet = enrichedPacket;
  }
  const query = `
    INSERT INTO atlas_packets (
      packet_key, source_ref, file_path, function_symbol, feature_id, feature_label,
      title_id, summary, domain_class, semantic_tags,
      som_cluster, som_row, som_col, community_id, topological_neighbors,
      qdrant_point_id, qdrant_collection, redis_key, neo4j_node_id, neo4j_edges,
      extracted_from_service, extracted_from_method, extracted_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20,
      $21, $22, $23,
      NOW()
    )
    ON CONFLICT (packet_key) DO UPDATE SET
      source_ref = $2, file_path = $3, function_symbol = $4, feature_id = $5, feature_label = $6,
      title_id = $7, summary = $8, domain_class = $9, semantic_tags = $10,
      som_cluster = $11, som_row = $12, som_col = $13, community_id = $14, topological_neighbors = $15,
      qdrant_point_id = $16, qdrant_collection = $17, redis_key = $18, neo4j_node_id = $19, neo4j_edges = $20,
      extracted_from_service = $21, extracted_from_method = $22, extracted_at = $23,
      updated_at = NOW()
  `;

  await pgClient.query(query, [
    packet.packet_key,
    packet.source_ref,
    packet.file_path,
    packet.function_symbol,
    packet.feature_id,
    packet.feature_label,
    packet.title_id,
    packet.summary,
    packet.domain_class,
    JSON.stringify(packet.semantic_tags),
    packet.som_cluster,
    packet.som_row,
    packet.som_col,
    packet.community_id,
    JSON.stringify(packet.topological_neighbors),
    packet.qdrant_point_id,
    packet.qdrant_collection,
    packet.redis_key,
    packet.neo4j_node_id,
    JSON.stringify(packet.neo4j_edges),
    packet.extracted_from_service,
    packet.extracted_from_method,
    packet.extracted_at,
  ]);
}

/**
 * Step 4: Invalidate Redis cache
 */
async function invalidateRedisCache(
  packet: PacketTopologyEnvelope,
  context: MaterializationContext
): Promise<void> {
  if (!context.redisClient) {
    return; // Skip if no Redis client
  }

  const redis = context.redisClient;
  const keysToDelete = [
    `bifrost:packet:${packet.packet_key}`,
    `bifrost:feature:${packet.feature_id}:packets`,
    `bifrost:source:${packet.source_ref}`,
    `bitfrost:summary:${packet.packet_key}`,
  ];

  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
}

/**
 * Step 5: Emit events
 */
async function emitPacketEvents(
  packet: PacketTopologyEnvelope,
  context: MaterializationContext
): Promise<void> {
  if (context.eventEmitter) {
    context.eventEmitter.emit('packet:materialized', {
      packetKey: packet.packet_key,
      sourceRef: packet.source_ref,
      featureId: packet.feature_id,
      timestamp: new Date(),
    });
  }

  if (context.natsClient) {
    // Publish to NATS (non-blocking)
    context.natsClient.publish('atlas.packets.materialized', JSON.stringify(packet)).catch(
      (err: any) => {
        console.error('NATS publish error:', err.message);
      }
    );
  }
}
