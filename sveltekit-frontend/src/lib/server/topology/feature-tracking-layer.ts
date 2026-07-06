/**
 * @module feature-tracking-layer
 * @description Unified canonical packet getter across Postgres, Qdrant, and Neo4j.
 * Ensures all 11 canonical fields are consistently available across stores.
 * Postgres is always source of truth; Qdrant and Neo4j are read-only mirrors.
 */

import { db } from '$lib/server/db/client';
import { sql, eq, inArray } from 'drizzle-orm';
import type { Pool } from 'pg';

/**
 * The 11 canonical fields that must be present in every packet response.
 * Tier 1 (Identity): packet_key, source_ref, feature_id
 * Tier 2 (Derived): tree_node_id, domain_class, title_id
 * Tier 3 (Topology): topolog_cluster, som_cluster, community_id
 * Tier 4 (Retrieval): qdrant_point_id, retrieval_strategy
 */
export interface CanonicalPacket {
  // Tier 1: Identity (immutable, from ingestion)
  packet_key: string;
  source_ref: string;
  feature_id: string;

  // Tier 2: Derived (immutable, computed once per packet)
  tree_node_id: string | null;
  domain_class: string | null;
  title_id: string | null;

  // Tier 3: Topology (immutable after Phase N completion)
  topolog_cluster: number | null; // Maps to som_cluster in Postgres
  som_cluster: string | null;
  community_id: number | null;

  // Tier 4: Retrieval (per-query hints, computed by orchestrator)
  qdrant_point_id: string | null;
  retrieval_strategy: string | null;
}

/**
 * Parity audit result comparing packet across stores.
 */
export interface ParityAuditResult {
  packet_key: string;
  postgres_present: boolean;
  qdrant_present: boolean;
  neo4j_present: boolean;
  parity_score: number; // 0.0 (all different) to 1.0 (all match)
  mismatches: string[]; // List of fields that differ across stores
}

/**
 * Feature tracking record for phase completion.
 */
export interface FeatureTrackingRecord {
  packet_key: string;
  phase: string;
  completion_percentage: number;
  fields_populated: string[];
  fields_missing: string[];
}

/**
 * Get canonical packet from Postgres (source of truth).
 * Always returns all 11 fields with null where unavailable.
 */
export async function getCanonicalPacket(
  pool: Pool,
  packet_key: string,
  options?: { includeQdrant?: boolean; includeNeo4j?: boolean }
): Promise<CanonicalPacket | null> {
  try {
    const query = `
      SELECT
        packet_key,
        source_ref,
        feature_id,
        tree_node_id,
        domain_class,
        title_id,
        som_cluster as topolog_cluster,
        som_cluster,
        community_id,
        qdrant_point_id,
        routing_hints as retrieval_strategy
      FROM atlas_packets
      WHERE packet_key = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [packet_key]);

    if (result.rows.length === 0) {
      console.warn(`[feature-tracking] Packet not found: ${packet_key}`);
      return null;
    }

    let packet = result.rows[0] as CanonicalPacket;

    // Optionally enrich from Qdrant payload
    if (options?.includeQdrant && packet.qdrant_point_id) {
      packet = await enrichFromQdrantPayload(packet);
    }

    // Optionally enrich from Neo4j node
    if (options?.includeNeo4j) {
      packet = await enrichFromNeo4jNode(packet);
    }

    return packet;
  } catch (err) {
    console.error(`[feature-tracking] Error fetching packet ${packet_key}:`, err);
    return null;
  }
}

/**
 * Batch fetch canonical packets from Postgres.
 */
export async function getCanonicalPacketsFromPostgres(
  pool: Pool,
  packet_keys: string[],
  limit?: number
): Promise<CanonicalPacket[]> {
  try {
    if (packet_keys.length === 0) return [];

    const placeholders = packet_keys
      .map((_, i) => `$${i + 1}`)
      .join(',');

    const query = `
      SELECT
        packet_key,
        source_ref,
        feature_id,
        tree_node_id,
        domain_class,
        title_id,
        som_cluster as topolog_cluster,
        som_cluster,
        community_id,
        qdrant_point_id,
        routing_hints as retrieval_strategy
      FROM atlas_packets
      WHERE packet_key IN (${placeholders})
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await pool.query(query, packet_keys);
    return (result.rows || []) as CanonicalPacket[];
  } catch (err) {
    console.error('[feature-tracking] Error fetching batch packets:', err);
    return [];
  }
}

/**
 * Enrich packet with Qdrant payload data (read-only mirror).
 */
export async function enrichFromQdrantPayload(
  packet: CanonicalPacket,
  qdrantPayload?: Record<string, unknown>
): Promise<CanonicalPacket> {
  // In a full implementation, this would merge Qdrant payload fields.
  // For now, return packet as-is (Qdrant is read-only enrich layer).
  // Schema: qdrantPayload should match canonical field names.

  if (qdrantPayload) {
    // Merge non-null fields from Qdrant (read-only, don't override Postgres truth)
    for (const [key, value] of Object.entries(qdrantPayload)) {
      if (value !== null && value !== undefined && key in packet) {
        // Log if Qdrant differs from Postgres truth
        const pgValue = packet[key as keyof CanonicalPacket];
        if (pgValue && pgValue !== value) {
          console.warn(`[feature-tracking] Qdrant payload differs for ${packet.packet_key}.${key}`);
        }
      }
    }
  }

  return packet;
}

/**
 * Enrich packet with Neo4j node data (read-only topology mirror).
 */
export async function enrichFromNeo4jNode(
  packet: CanonicalPacket,
  neo4jNode?: Record<string, unknown>
): Promise<CanonicalPacket> {
  // In a full implementation, this would merge Neo4j properties.
  // For now, return packet as-is (Neo4j is read-only topology layer).
  // Schema: neo4jNode properties should be topology-related only.

  if (neo4jNode) {
    // Merge topology fields from Neo4j (read-only, for enrichment only)
    const topologyFields = ['topolog_cluster', 'som_cluster', 'community_id'];
    for (const field of topologyFields) {
      if (field in neo4jNode && neo4jNode[field] !== null) {
        const pgValue = packet[field as keyof CanonicalPacket];
        if (pgValue && pgValue !== neo4jNode[field]) {
          console.warn(`[feature-tracking] Neo4j topology differs for ${packet.packet_key}.${field}`);
        }
      }
    }
  }

  return packet;
}

/**
 * Audit packet parity across stores (non-blocking).
 */
export async function auditPacketParity(
  pool: Pool,
  packet_key: string,
  qdrantPayload?: Record<string, unknown>,
  neo4jNode?: Record<string, unknown>
): Promise<ParityAuditResult> {
  const packet = await getCanonicalPacket(pool, packet_key);

  if (!packet) {
    return {
      packet_key,
      postgres_present: false,
      qdrant_present: false,
      neo4j_present: false,
      parity_score: 0,
      mismatches: ['packet not found in Postgres']
    };
  }

  const mismatches: string[] = [];
  let matchCount = 1; // Postgres is always counted

  // Check Qdrant presence
  const qdrant_present = !!qdrantPayload;
  if (qdrant_present) {
    matchCount++;
    // Check for key field mismatches
    if (qdrantPayload?.packet_key !== packet.packet_key) {
      mismatches.push('packet_key mismatch in Qdrant');
    }
  }

  // Check Neo4j presence
  const neo4j_present = !!neo4jNode;
  if (neo4j_present) {
    matchCount++;
    // Check for topology field mismatches
    if (neo4jNode?.community_id !== packet.community_id) {
      mismatches.push('community_id mismatch in Neo4j');
    }
  }

  const parity_score = matchCount > 1 ? (3 - mismatches.length) / 3 : 1;

  return {
    packet_key,
    postgres_present: true,
    qdrant_present,
    neo4j_present,
    parity_score,
    mismatches
  };
}

/**
 * Get feature tracking record for a packet (phase completion tracking).
 */
export async function getFeatureTrackingRecord(
  pool: Pool,
  packet_key: string
): Promise<FeatureTrackingRecord | null> {
  const packet = await getCanonicalPacket(pool, packet_key);
  if (!packet) return null;

  const canonicalFields: (keyof CanonicalPacket)[] = [
    'packet_key',
    'source_ref',
    'feature_id',
    'tree_node_id',
    'domain_class',
    'title_id',
    'topolog_cluster',
    'som_cluster',
    'community_id',
    'qdrant_point_id',
    'retrieval_strategy'
  ];

  const populated = canonicalFields.filter(f => packet[f] !== null);
  const missing = canonicalFields.filter(f => packet[f] === null);

  return {
    packet_key,
    phase: 'LAYER-1-2',
    completion_percentage: (populated.length / canonicalFields.length) * 100,
    fields_populated: populated,
    fields_missing: missing
  };
}

/**
 * Get feature tracking statistics across all packets.
 */
export async function getFeatureTrackingStats(pool: Pool): Promise<{
  total_packets: number;
  canonical_fields_coverage: Record<string, number>;
  phase_completion_percentage: number;
}> {
  try {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(packet_key) as packet_key_coverage,
        COUNT(source_ref) as source_ref_coverage,
        COUNT(feature_id) as feature_id_coverage,
        COUNT(tree_node_id) as tree_node_id_coverage,
        COUNT(domain_class) as domain_class_coverage,
        COUNT(title_id) as title_id_coverage,
        COUNT(som_cluster) as som_cluster_coverage,
        COUNT(community_id) as community_id_coverage,
        COUNT(qdrant_point_id) as qdrant_point_id_coverage,
        COUNT(routing_hints) as retrieval_strategy_coverage
      FROM atlas_packets
    `;

    const result = await pool.query(query);
    const row = result.rows[0];
    const total = parseInt(row.total);

    const coverage: Record<string, number> = {
      packet_key: (parseInt(row.packet_key_coverage) / total) * 100,
      source_ref: (parseInt(row.source_ref_coverage) / total) * 100,
      feature_id: (parseInt(row.feature_id_coverage) / total) * 100,
      tree_node_id: (parseInt(row.tree_node_id_coverage) / total) * 100,
      domain_class: (parseInt(row.domain_class_coverage) / total) * 100,
      title_id: (parseInt(row.title_id_coverage) / total) * 100,
      som_cluster: (parseInt(row.som_cluster_coverage) / total) * 100,
      community_id: (parseInt(row.community_id_coverage) / total) * 100,
      qdrant_point_id: (parseInt(row.qdrant_point_id_coverage) / total) * 100,
      retrieval_strategy: (parseInt(row.retrieval_strategy_coverage) / total) * 100
    };

    const avgCoverage =
      Object.values(coverage).reduce((a, b) => a + b, 0) / Object.keys(coverage).length;

    return {
      total_packets: total,
      canonical_fields_coverage: coverage,
      phase_completion_percentage: avgCoverage
    };
  } catch (err) {
    console.error('[feature-tracking] Error fetching stats:', err);
    return {
      total_packets: 0,
      canonical_fields_coverage: {},
      phase_completion_percentage: 0
    };
  }
}

/**
 * Validate canonical packet structure.
 */
export function validateCanonicalPacket(packet: unknown): packet is CanonicalPacket {
  if (!packet || typeof packet !== 'object') return false;

  const p = packet as Record<string, unknown>;

  // Tier 1: Required identity fields
  if (!p.packet_key || !p.source_ref || !p.feature_id) {
    return false;
  }

  // All other fields can be null, but must exist
  const requiredFields = [
    'tree_node_id',
    'domain_class',
    'title_id',
    'topolog_cluster',
    'som_cluster',
    'community_id',
    'qdrant_point_id',
    'retrieval_strategy'
  ];

  for (const field of requiredFields) {
    if (!(field in p)) return false;
  }

  return true;
}
