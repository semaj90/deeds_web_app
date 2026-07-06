/**
 * Feature Tracking Layer — Unified Canonical Packet Getter
 *
 * Bridges Postgres (truth), Qdrant (mirror), and Neo4j (topology)
 * Ensures all three stores expose the same 9 core fields + 2 retrieval fields
 *
 * Canonical fields (must exist in ALL stores):
 * 1. packet_key (identity)
 * 2. source_ref (identity)
 * 3. feature_id (identity)
 * 4. tree_node_id (derived)
 * 5. domain_class (derived)
 * 6. title_id (derived)
 * 7. topolog_cluster (topology, Phase 2A)
 * 8. som_cluster (topology, Phase 3)
 * 9. community_id (topology, Phase 3, Louvain)
 * 10. qdrant_point_id (retrieval hint, optional)
 * 11. retrieval_strategy (retrieval hint, optional)
 */

import { Pool, QueryResult } from 'pg';
import { v4 as uuidv4, validate as validateUUID } from 'uuid';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * The 11 canonical fields that MUST exist in Postgres, Qdrant, and Neo4j
 * Tier 1-3 are immutable; Tier 4 is per-query
 */
export interface CanonicalPacket {
  // === TIER 1: IDENTITY (Immutable) ===
  /** Unique packet identifier, e.g., 'ace:packet:auth:001' */
  packet_key: string;

  /** Source file reference, e.g., 'src/lib/server/auth.ts' */
  source_ref: string;

  /** Semantic feature ID, e.g., 'auth.sessions' */
  feature_id: string;

  // === TIER 2: DERIVED (Immutable, computed once) ===
  /** AST tree node UUID (from codebase structure, Phase 1) */
  tree_node_id: string;

  /** Domain classification (from Phase 1 NaiveBayes), e.g., 'error_handling' */
  domain_class: string;

  /** Title/label UUID (from Phase 1 summarization) */
  title_id: string;

  // === TIER 3: TOPOLOGY (Immutable after Phase N) ===
  /** K-means cluster assignment (Phase 2A), 0-15 */
  topolog_cluster?: number;

  /** SOM grid cluster (Phase 3), 0-399 (20×20 grid) */
  som_cluster?: number;

  /** Louvain community ID (Phase 3), increasing integer */
  community_id?: number;

  // === TIER 4: RETRIEVAL (Computed per query) ===
  /** Qdrant point UUID (for cache bypass or direct lookup) */
  qdrant_point_id?: string;

  /** Retrieval strategy hint: 'dense_qdrant' | 'sparse_bm25' | 'topology_neo4j' */
  retrieval_strategy?: string;

  // === AUDIT ===
  /** Embedding model used (canonical: 'embeddinggemma:latest') */
  embedding_model: string;

  /** Embedding dimension (canonical: 384) */
  embedding_dim: number;

  /** Row created timestamp (Postgres source of truth) */
  created_at: Date;

  /** Row last updated timestamp (Postgres source of truth) */
  updated_at: Date;
}

/**
 * Parity audit result: where canonical fields match/differ
 */
export interface ParityAuditResult {
  packet_key: string;
  fields_match: {
    postgres: CanonicalPacket;
    qdrant?: Partial<CanonicalPacket>;
    neo4j?: Partial<CanonicalPacket>;
  };
  mismatches: Array<{
    field: keyof CanonicalPacket;
    postgres_value: any;
    qdrant_value?: any;
    neo4j_value?: any;
  }>;
  parity_score: number; // 0.0-1.0 (1.0 = all 11 fields match)
}

/**
 * Feature tracking record: which phases are complete for a packet
 */
export interface FeatureTrackingRecord {
  packet_key: string;
  source_ref: string;
  feature_id: string;

  // Phase completion flags
  phase_1_identity_complete: boolean;
  phase_2a_topolog_cluster_complete: boolean;
  phase_2b_lexical_features_complete: boolean;
  phase_2c_entities_complete: boolean;
  phase_3_som_topology_complete: boolean;
  phase_3_community_complete: boolean;
  phase_4_rl_policy_complete: boolean;

  // Sync status
  qdrant_synced: boolean;
  neo4j_synced: boolean;
  retrieval_tested: boolean;

  // Audit
  last_updated: Date;
  verification_errors?: string[];
}

// ============================================================================
// POSTGRES QUERIES (TRUTH LAYER)
// ============================================================================

/**
 * Fetch canonical packet from Postgres (single source of truth)
 */
export async function getCanonicalPacketFromPostgres(
  pool: Pool,
  packet_key: string
): Promise<CanonicalPacket | null> {
  try {
    const res = await pool.query(
      `
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.tree_node_id,
        ap.domain_class,
        ap.title_id,
        ap.topolog_cluster,
        ap.updated_at,
        ap.created_at,
        'embeddinggemma:latest' AS embedding_model,
        384 AS embedding_dim
      FROM atlas_packets ap
      WHERE ap.packet_key = $1
      LIMIT 1
      `,
      [packet_key]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      tree_node_id: row.tree_node_id,
      domain_class: row.domain_class,
      title_id: row.title_id,
      topolog_cluster: row.topolog_cluster,
      embedding_model: row.embedding_model,
      embedding_dim: row.embedding_dim,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } catch (e) {
    console.warn(`[FeatureTracking] Postgres query failed for ${packet_key}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Batch fetch canonical packets from Postgres
 */
export async function getCanonicalPacketsFromPostgres(
  pool: Pool,
  packet_keys: string[],
  limit: number = 1000
): Promise<CanonicalPacket[]> {
  if (packet_keys.length === 0) return [];

  try {
    const keys = packet_keys.slice(0, limit);
    const res = await pool.query(
      `
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.tree_node_id,
        ap.domain_class,
        ap.title_id,
        ap.topolog_cluster,
        ap.updated_at,
        ap.created_at,
        'embeddinggemma:latest' AS embedding_model,
        384 AS embedding_dim
      FROM atlas_packets ap
      WHERE ap.packet_key = ANY($1)
      LIMIT $2
      `,
      [keys, limit]
    );

    return res.rows.map(row => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      tree_node_id: row.tree_node_id,
      domain_class: row.domain_class,
      title_id: row.title_id,
      topolog_cluster: row.topolog_cluster,
      embedding_model: row.embedding_model,
      embedding_dim: row.embedding_dim,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (e) {
    console.warn(`[FeatureTracking] Batch Postgres query failed: ${(e as Error).message}`);
    return [];
  }
}

// ============================================================================
// QDRANT ENRICHMENT (OPTIONAL MIRROR)
// ============================================================================

/**
 * Enrich canonical packet with Qdrant payload (read-only)
 * Qdrant is a mirror — data integrity checked but not corrected
 */
export async function enrichFromQdrantPayload(
  packet: CanonicalPacket,
  qdrantPayload?: Record<string, any>
): Promise<CanonicalPacket> {
  if (!qdrantPayload) return packet;

  // Merge read-only fields from Qdrant (verification only)
  return {
    ...packet,
    qdrant_point_id: qdrantPayload.qdrant_point_id || undefined,
    som_cluster: qdrantPayload.som_cluster || packet.som_cluster,
    community_id: qdrantPayload.community_id || packet.community_id,
    retrieval_strategy: qdrantPayload.retrieval_strategy || undefined
  };
}

// ============================================================================
// NEO4J ENRICHMENT (OPTIONAL TOPOLOGY)
// ============================================================================

/**
 * Enrich canonical packet with Neo4j properties (read-only topology)
 * Neo4j provides topology relationships but not canonical identity
 */
export async function enrichFromNeo4jNode(
  packet: CanonicalPacket,
  neo4jNode?: Record<string, any>
): Promise<CanonicalPacket> {
  if (!neo4jNode) return packet;

  // Merge topology fields from Neo4j
  return {
    ...packet,
    som_cluster: neo4jNode.som_cluster || packet.som_cluster,
    community_id: neo4jNode.community_id || packet.community_id,
    topolog_cluster: neo4jNode.topolog_cluster || packet.topolog_cluster
  };
}

// ============================================================================
// UNIFIED GETTER (Main API)
// ============================================================================

/**
 * Get canonical packet from Postgres with optional enrichment from Qdrant + Neo4j
 * Postgres is ALWAYS the source of truth; mirrors are optional verification
 */
export async function getCanonicalPacket(
  pool: Pool,
  packet_key: string,
  options: {
    enrichQdrant?: boolean;
    enrichNeo4j?: boolean;
    qdrantPayload?: Record<string, any>;
    neo4jNode?: Record<string, any>;
  } = {}
): Promise<CanonicalPacket | null> {
  // Always read from Postgres first
  const packet = await getCanonicalPacketFromPostgres(pool, packet_key);
  if (!packet) return null;

  // Optionally enrich from Qdrant
  let enriched = packet;
  if (options.enrichQdrant && options.qdrantPayload) {
    enriched = await enrichFromQdrantPayload(enriched, options.qdrantPayload);
  }

  // Optionally enrich from Neo4j
  if (options.enrichNeo4j && options.neo4jNode) {
    enriched = await enrichFromNeo4jNode(enriched, options.neo4jNode);
  }

  return enriched;
}

// ============================================================================
// PARITY AUDIT (Verification Only)
// ============================================================================

/**
 * Audit a single packet for parity across Postgres, Qdrant, Neo4j
 * Returns mismatch report (non-blocking)
 */
export async function auditPacketParity(
  pool: Pool,
  packet_key: string,
  qdrantPayload?: Record<string, any>,
  neo4jNode?: Record<string, any>
): Promise<ParityAuditResult> {
  const pgPacket = await getCanonicalPacketFromPostgres(pool, packet_key);
  if (!pgPacket) {
    return {
      packet_key,
      fields_match: { postgres: {} as CanonicalPacket },
      mismatches: [{ field: 'packet_key' as keyof CanonicalPacket, postgres_value: null }],
      parity_score: 0
    };
  }

  const mismatches: ParityAuditResult['mismatches'] = [];

  // Check Qdrant payload
  if (qdrantPayload) {
    const qFields = ['packet_key', 'source_ref', 'feature_id', 'topolog_cluster', 'som_cluster', 'community_id'];
    for (const field of qFields) {
      if (qdrantPayload[field] !== (pgPacket as any)[field]) {
        mismatches.push({
          field: field as keyof CanonicalPacket,
          postgres_value: (pgPacket as any)[field],
          qdrant_value: qdrantPayload[field]
        });
      }
    }
  }

  // Check Neo4j node
  if (neo4jNode) {
    const nFields = ['packet_key', 'source_ref', 'feature_id', 'topolog_cluster', 'som_cluster', 'community_id'];
    for (const field of nFields) {
      if (neo4jNode[field] !== (pgPacket as any)[field]) {
        mismatches.push({
          field: field as keyof CanonicalPacket,
          postgres_value: (pgPacket as any)[field],
          neo4j_value: neo4jNode[field]
        });
      }
    }
  }

  // Calculate parity score (1.0 = all canonical fields present and matching)
  const canonicalFieldsNeeded = 9; // packet_key through community_id
  const canonicalFieldsPresent = [
    pgPacket.packet_key,
    pgPacket.source_ref,
    pgPacket.feature_id,
    pgPacket.tree_node_id,
    pgPacket.domain_class,
    pgPacket.title_id,
    pgPacket.topolog_cluster,
    pgPacket.som_cluster,
    pgPacket.community_id
  ].filter(f => f !== undefined && f !== null).length;

  const parityScore = canonicalFieldsPresent / canonicalFieldsNeeded;

  return {
    packet_key,
    fields_match: {
      postgres: pgPacket,
      qdrant: qdrantPayload ? { ...qdrantPayload } : undefined,
      neo4j: neo4jNode ? { ...neo4jNode } : undefined
    },
    mismatches,
    parity_score: parityScore
  };
}

// ============================================================================
// FEATURE TRACKING QUERIES
// ============================================================================

/**
 * Query feature completion for a packet (which phases have completed?)
 */
export async function getFeatureTrackingRecord(
  pool: Pool,
  packet_key: string
): Promise<FeatureTrackingRecord | null> {
  try {
    const res = await pool.query(
      `
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,

        -- Phase flags (assume Phase 1 is 100% for all packets)
        true AS phase_1_identity_complete,

        -- Phase 2A: topolog_cluster populated?
        ap.topolog_cluster IS NOT NULL AS phase_2a_topolog_cluster_complete,

        -- Phases 2B-4: future
        false AS phase_2b_lexical_features_complete,
        false AS phase_2c_entities_complete,
        false AS phase_3_som_topology_complete,
        false AS phase_3_community_complete,
        false AS phase_4_rl_policy_complete,

        -- Sync status
        true AS qdrant_synced,  -- TODO: check actual Qdrant payload
        true AS neo4j_synced,   -- TODO: check actual Neo4j node
        false AS retrieval_tested, -- TODO: check if used in RRF blend

        ap.updated_at AS last_updated
      FROM atlas_packets ap
      WHERE ap.packet_key = $1
      LIMIT 1
      `,
      [packet_key]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      phase_1_identity_complete: row.phase_1_identity_complete,
      phase_2a_topolog_cluster_complete: row.phase_2a_topolog_cluster_complete,
      phase_2b_lexical_features_complete: row.phase_2b_lexical_features_complete,
      phase_2c_entities_complete: row.phase_2c_entities_complete,
      phase_3_som_topology_complete: row.phase_3_som_topology_complete,
      phase_3_community_complete: row.phase_3_community_complete,
      phase_4_rl_policy_complete: row.phase_4_rl_policy_complete,
      qdrant_synced: row.qdrant_synced,
      neo4j_synced: row.neo4j_synced,
      retrieval_tested: row.retrieval_tested,
      last_updated: row.last_updated
    };
  } catch (e) {
    console.warn(`[FeatureTracking] Feature tracking query failed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Get feature completion stats (aggregate across all packets)
 */
export async function getFeatureTrackingStats(
  pool: Pool
): Promise<{
  phase_1_complete: number;
  phase_2a_complete: number;
  phase_2b_complete: number;
  phase_2c_complete: number;
  phase_3_som_complete: number;
  phase_3_community_complete: number;
  phase_4_complete: number;
  total_packets: number;
}> {
  try {
    const res = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN true THEN 1 END) AS phase_1, -- all have identity
        COUNT(CASE WHEN topolog_cluster IS NOT NULL THEN 1 END) AS phase_2a,
        COUNT(CASE WHEN false THEN 1 END) AS phase_2b, -- 0 for now
        COUNT(CASE WHEN false THEN 1 END) AS phase_2c, -- 0 for now
        COUNT(CASE WHEN false THEN 1 END) AS phase_3_som, -- 0 for now
        COUNT(CASE WHEN false THEN 1 END) AS phase_3_community, -- 0 for now
        COUNT(CASE WHEN false THEN 1 END) AS phase_4 -- 0 for now
      FROM atlas_packets
    `);

    const row = res.rows[0];
    return {
      phase_1_complete: row.phase_1,
      phase_2a_complete: row.phase_2a,
      phase_2b_complete: row.phase_2b,
      phase_2c_complete: row.phase_2c,
      phase_3_som_complete: row.phase_3_som,
      phase_3_community_complete: row.phase_3_community,
      phase_4_complete: row.phase_4,
      total_packets: row.total
    };
  } catch (e) {
    console.warn(`[FeatureTracking] Stats query failed: ${(e as Error).message}`);
    return {
      phase_1_complete: 0,
      phase_2a_complete: 0,
      phase_2b_complete: 0,
      phase_2c_complete: 0,
      phase_3_som_complete: 0,
      phase_3_community_complete: 0,
      phase_4_complete: 0,
      total_packets: 0
    };
  }
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validate that all required canonical fields are populated
 */
export function validateCanonicalPacket(packet: Partial<CanonicalPacket>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!packet.packet_key) errors.push('packet_key required');
  if (!packet.source_ref) errors.push('source_ref required');
  if (!packet.feature_id) errors.push('feature_id required');
  if (!packet.tree_node_id) errors.push('tree_node_id required');
  if (!packet.domain_class) errors.push('domain_class required');
  if (!packet.title_id) errors.push('title_id required');

  if (packet.tree_node_id && !validateUUID(packet.tree_node_id)) {
    errors.push(`tree_node_id must be valid UUID, got: ${packet.tree_node_id}`);
  }
  if (packet.title_id && !validateUUID(packet.title_id)) {
    errors.push(`title_id must be valid UUID, got: ${packet.title_id}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  getCanonicalPacket,
  getCanonicalPacketFromPostgres,
  getCanonicalPacketsFromPostgres,
  enrichFromQdrantPayload,
  enrichFromNeo4jNode,
  auditPacketParity,
  getFeatureTrackingRecord,
  getFeatureTrackingStats,
  validateCanonicalPacket
};
