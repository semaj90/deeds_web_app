import { z } from 'zod';

/**
 * Canonical Packet Topology Envelope
 * Single source of truth for packet shape across all stores:
 * - Postgres (canonical source)
 * - Qdrant (vector mirror)
 * - Redis/BitFrost (hot cache)
 * - Neo4j (topology mirror)
 * - ACP/gRPC (validated transport)
 *
 * All handoffs between stores validate against this schema.
 * No shape divergence per lane.
 */
export const PacketTopologyEnvelopeSchema = z.object({
  // canonical identity (immutable)
  packet_id: z.string().uuid('Postgres row UUID (internal only)'),
  packet_ulid: z.string().optional().describe('Sortable event ID for replay ordering'),
  packet_key: z.string()
    .regex(/^sha256:[a-f0-9]{64}$|^[a-f0-9]{64}$/)
    .describe('Cross-system join key for cache, mirrors, and RPC'),

  // semantic grouping (derived from summary, immutable after first set)
  title_id: z.string().min(1).describe('Semantic grouping key from summary meaning'),
  feature_id: z.string().min(1).describe('Feature layer identifier (immutable)'),
  source_ref: z.string().min(1).describe('File path or source reference (immutable)'),
  directory_path: z.string().optional().describe('Directory context for routing'),

  // topology labels (NOT identity — used for routing and locality, not joins)
  community_id: z.number().int().nonnegative().nullable().optional()
    .describe('Louvain community ID (routing hint)'),
  som_row: z.number().int().min(0).max(19).nullable().optional()
    .describe('SOM 20×20 grid row coordinate'),
  som_col: z.number().int().min(0).max(19).nullable().optional()
    .describe('SOM 20×20 grid column coordinate'),
  som_cluster: z.string().nullable().optional()
    .describe('SOM cluster ID (derived from row:col)'),
  kmeans_cluster_id: z.number().int().nonnegative().nullable().optional()
    .describe('K-Means cluster assignment'),

  // derived latent/manifold representations
  latent_64: z.array(z.number()).length(64).nullable().optional()
    .describe('64-dim autoencoder latent (optional, derived)'),
  manifold_4d: z.object({
    x: z.number().describe('SOM column (X-axis)'),
    y: z.number().describe('SOM row (Y-axis)'),
    z: z.number().describe('K-Means cluster (Z-axis / depth)'),
    t: z.union([z.number(), z.string()]).describe('Timestamp (time axis)')
  }).nullable().optional()
    .describe('4D topology coordinates for retrieval locality'),

  // retrieval mirrors (derived, read-only)
  qdrant_point_id: z.string().nullable().optional()
    .describe('Qdrant vector point ID (mirror only)'),
  neo4j_neighbors: z.array(z.string()).default([])
    .describe('Neo4j neighbor packet_keys (topology expansion)'),
  page_rank_score: z.number().nonnegative().nullable().optional()
    .describe('PageRank authority score (derived)'),

  // lexical enrichment (from feature materialization)
  summary: z.string().nullable().optional()
    .describe('Human-readable summary'),
  lexical_nouns: z.array(z.string()).default([])
    .describe('Extracted nouns from feature label'),
  lexical_verbs: z.array(z.string()).default([])
    .describe('Extracted verbs from feature label'),
  lexical_adverbs_ly: z.array(z.string()).default([])
    .describe('Extracted adverbs ending in -ly'),
  routing_hints: z.array(z.string()).default([])
    .describe('Cache layer hints (L1/L2/L3/L4)'),
  used_concepts: z.array(z.string()).default([])
    .describe('Derived concepts for retrieval scoring'),

  // lineage (immutable append-only)
  supersedes: z.array(z.string()).default([])
    .describe('packet_keys that this packet replaces'),
  superseded_by: z.string().nullable().optional()
    .describe('packet_key of the replacement packet'),

  // audit trail (immutable once set)
  created_at: z.string().datetime()
    .describe('Packet creation timestamp'),
  updated_at: z.string().datetime().optional()
    .describe('Last update timestamp'),

  // extraction/synthesis metadata (optional, diagnostic)
  confidence: z.number().min(0).max(1).nullable().optional()
    .describe('Extraction confidence score'),
  extraction_method: z.string().optional()
    .describe('Which extractor/synthesizer produced this'),
  provenance: z.record(z.unknown()).optional()
    .describe('Extraction context (summary rank, feature label, etc.)')
}).strict();

export type PacketTopologyEnvelope = z.infer<typeof PacketTopologyEnvelopeSchema>;

/**
 * Validate a packet envelope against the canonical schema.
 * Throws if validation fails (hard fail on shape mismatch).
 * Used at all store handoffs: Postgres → Qdrant, Qdrant → Redis, Redis → ACP/gRPC.
 */
export function validatePacketEnvelope(input: unknown): PacketTopologyEnvelope {
  return PacketTopologyEnvelopeSchema.parse(input);
}

/**
 * Safe validation (returns null on failure instead of throwing).
 * Use for defensive reads from mirrors (Qdrant, Redis, Neo4j).
 */
export function tryValidatePacketEnvelope(input: unknown): PacketTopologyEnvelope | null {
  try {
    return PacketTopologyEnvelopeSchema.parse(input);
  } catch {
    return null;
  }
}

/**
 * Batch validation for multiple packets.
 * Collects errors and returns { valid, invalid, errors }.
 */
export function validatePacketBatch(packets: unknown[]): {
  valid: PacketTopologyEnvelope[];
  invalid: Array<{ index: number; error: string }>;
  errors: string[];
} {
  const valid: PacketTopologyEnvelope[] = [];
  const invalid: Array<{ index: number; error: string }> = [];
  const errors: string[] = [];

  for (let i = 0; i < packets.length; i++) {
    const result = tryValidatePacketEnvelope(packets[i]);
    if (result) {
      valid.push(result);
    } else {
      const error = PacketTopologyEnvelopeSchema.safeParse(packets[i]);
      if (!error.success) {
        invalid.push({ index: i, error: error.error.message });
      }
    }
  }

  if (invalid.length > 0) {
    errors.push(`${invalid.length} packets failed validation`);
  }

  return { valid, invalid, errors };
}

/**
 * Coerce a partial packet into canonical shape.
 * Used for envelope reconstruction from partial mirror data.
 */
export function coerceToPacketEnvelope(partial: Partial<PacketTopologyEnvelope>): PacketTopologyEnvelope {
  return PacketTopologyEnvelopeSchema.parse({
    packet_id: partial.packet_id || 'missing-id',
    packet_key: partial.packet_key || 'missing-key',
    title_id: partial.title_id || 'untitled',
    feature_id: partial.feature_id || 'unknown-feature',
    source_ref: partial.source_ref || 'unknown-source',
    created_at: partial.created_at || new Date().toISOString(),
    ...partial
  });
}
