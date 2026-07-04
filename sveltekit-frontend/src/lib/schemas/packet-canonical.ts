import { z } from 'zod';

/**
 * CANONICAL PACKET SCHEMA
 *
 * This is the immutable contract for all packets flowing through the system.
 * Every packet MUST validate against this schema before:
 * - Writing to Postgres
 * - Upserting to Qdrant
 * - Creating Neo4j nodes
 * - Caching in Redis
 *
 * Violations are hard stops (no silent coercion).
 */

// ── Core Identity (immutable) ────────────────────────────────────────────

export const PacketIdentitySchema = z.object({
  packet_id: z.string().uuid().optional().describe('Canonical packet UUID when present'),
  packet_key: z.string().min(1).describe('Stable deterministic key (e.g., "ace:chunk:auth:001")'),
  source_ref: z.string().min(1).describe('Canonical source path (e.g., "src/lib/server/auth.ts")'),
  source_id: z.string().uuid().describe('UUID, unique within source_ref'),
  feature_id: z.string().min(1).describe('Feature category (e.g., "auth.sessions")'),
  feature_label: z.string().min(1).describe('Human-readable feature label'),
  title_id: z.string().min(1).optional().describe('Derived semantic grouping key from summary meaning'),
});

// ── Source Location (deterministic) ──────────────────────────────────────

export const SourceLocationSchema = z.object({
  relative_path: z.string().min(1).describe('Relative path from repo root'),
  line_start: z.number().int().nonnegative().optional().describe('Start line (0-indexed)'),
  line_end: z.number().int().nonnegative().optional().describe('End line (0-indexed)'),
  chunk_hash: z.string().length(64).optional().describe('SHA256 of chunk content'),
  chunk_index: z.number().int().nonnegative().optional().describe('Chunk sequence number'),
});

// ── Extraction Payload (layer 1) ─────────────────────────────────────────

export const EntitySchema = z.object({
  type: z.enum(['PERSON', 'ORG', 'LOCATION', 'DATE', 'FUNCTION', 'TYPE', 'EVENT', 'CLAIM', 'SIGNAL']),
  value: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  span_start: z.number().int().nonnegative().optional(),
  span_end: z.number().int().nonnegative().optional(),
});

export const RelationSchema = z.object({
  type: z.enum(['DEPENDS_ON', 'USED_BY', 'IMPLEMENTS', 'EXTENDS', 'IMPORTS', 'EXPORTS', 'CALLS', 'REFERENCES']),
  target: z.string().min(1).describe('Target packet_key or source_ref'),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const ExtractionPayloadSchema = z.object({
  entities: z.array(EntitySchema).default([]),
  events: z.array(z.object({ type: z.string(), timestamp: z.string().datetime().optional() })).default([]),
  claims: z.array(z.object({ claim: z.string(), evidence: z.string().optional() })).default([]),
  relations: z.array(RelationSchema).default([]),
  crime_signals: z.array(z.object({ signal: z.string(), severity: z.enum(['LOW', 'MEDIUM', 'HIGH']) })).default([]),
});

// ── Embedding & Topology (layer 2) ───────────────────────────────────────

export const EmbeddingSchema = z.object({
  dimension: z.literal(384).describe('embeddinggemma standard: 384-dim'),
  model: z.string().default('embeddinggemma:latest'),
  normalized: z.boolean().default(true).describe('L2 normalization applied'),
  vector: z.instanceof(Float32Array).optional().describe('Raw vector (not stored in JSON)'),
});

export const TopologySchema = z.object({
  som_cluster: z.number().int().min(0).max(399).describe('SOM cell ID (20×20 grid)'),
  som_bmu_row: z.number().int().min(0).max(19).describe('SOM row coordinate'),
  som_bmu_col: z.number().int().min(0).max(19).describe('SOM column coordinate'),
  kmeans_cluster: z.number().int().min(0).describe('K-means cluster assignment'),
  community_id: z.union([z.string(), z.number()]).optional().describe('Community detection label for graph fan-out'),
  som_row: z.number().int().min(0).max(19).optional().describe('SOM row alias for runtime fan-out'),
  som_col: z.number().int().min(0).max(19).optional().describe('SOM column alias for runtime fan-out'),
  latent_64: z.array(z.number()).length(64).optional().describe('64-d latent vector for topology projection'),
  manifold_4d: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
  }).optional().describe('4D manifold coordinates for routing and ranking'),
  ontology_tags: z.array(z.string()).default([]).describe('Domain/semantic tags'),
});

// ── Semantic Labels & Fan-out ────────────────────────────────────────────

export const SemanticLabelSchema = z.object({
  used_concepts: z.array(z.string().min(1)).default([]).describe('Canonical semantic concepts derived from summary, AST, and lexical labels'),
  lexical_nouns: z.array(z.string().min(1)).default([]).describe('Lexical noun phrases'),
  lexical_verbs: z.array(z.string().min(1)).default([]).describe('Lexical verbs'),
  lexical_adverbs_ly: z.array(z.string().min(1)).default([]).describe('Lexical adverbs ending in -ly'),
  relationship_hints: z.array(z.string().min(1)).default([]).describe('Graph relation hints for Neo4j / ACL fan-out'),
  routing_hints: z.array(z.string().min(1)).default([]).describe('Cache and retrieval routing hints'),
});

export const FanoutLayoutSchema = z.object({
  adjacency_packet_keys: z.array(z.string().min(1)).default([]).describe('Neighbor packet keys for graph expansion'),
  adjacency_feature_ids: z.array(z.string().min(1)).default([]).describe('Neighbor feature IDs for grouped fan-out'),
  adjacency_source_refs: z.array(z.string().min(1)).default([]).describe('Neighbor source refs for locality-aware expansion'),
  packed_arrays: z.object({
    packet_keys: z.array(z.string().min(1)).default([]),
    feature_ids: z.array(z.string().min(1)).default([]),
    source_refs: z.array(z.string().min(1)).default([]),
    title_ids: z.array(z.string().min(1)).default([]),
  }).default({
    packet_keys: [],
    feature_ids: [],
    source_refs: [],
    title_ids: [],
  }).describe('Columnar packed arrays for batch joins and mmap-style fan-out'),
  columnar_tables: z.array(z.string().min(1)).default([]).describe('Columnar table names participating in fan-out'),
  mmap_vector_refs: z.array(z.string().min(1)).default([]).describe('Read-only vector references suitable for mmap-backed loading'),
});

// ── Validation & Metadata (bookkeeping) ──────────────────────────────────

export const ValidationSchema = z.object({
  validation_status: z.enum(['PASS', 'SOFT_WARN', 'HARD_FAIL']).default('PASS'),
  gan_validated: z.boolean().default(false).describe('GAN validation gate passed'),
  gan_errors: z.array(z.string()).default([]),
  gan_warnings: z.array(z.string()).default([]),
  confidence_score: z.number().min(0).max(1).describe('Overall extraction confidence'),
  extraction_method: z.string().default('langextract_v2'),
  trace_id: z.string().min(1).describe('Execution lineage (trace:YYYY-MM-DD:phase:step:N)'),
});

// ── Summary (layer 3, LLM-generated) ─────────────────────────────────────

export const SummarySchema = z.object({
  summary_text: z.string().optional().describe('Human-readable summary (Gemma4 output)'),
  summary_embedding: z.instanceof(Float32Array).optional().describe('Embedding of summary (384-dim)'),
  summary_model: z.string().optional(),
  summary_generated_at: z.string().datetime().optional(),
}).strict();

// ── CANONICAL PACKET (full schema) ───────────────────────────────────────

export const CanonicalPacketSchema = z.object({
  // Identity
  ...PacketIdentitySchema.shape,

  // Location
  ...SourceLocationSchema.shape,

  // Extraction
  ...ExtractionPayloadSchema.shape,

  // Embedding
  ...EmbeddingSchema.shape,

  // Topology
  ...TopologySchema.shape,

  // Phase 8 semantic labels & fan-out
  ...SemanticLabelSchema.shape,
  ...FanoutLayoutSchema.shape,

  // Validation
  ...ValidationSchema.shape,

  // Summary
  ...SummarySchema.shape,

  // Timestamps
  created_at: z.string().datetime().describe('Packet creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp'),
  indexed_at: z.string().datetime().optional().describe('Qdrant indexing timestamp'),
});

// ── Type Exports ─────────────────────────────────────────────────────────

export type Entity = z.infer<typeof EntitySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type ExtractionPayload = z.infer<typeof ExtractionPayloadSchema>;
export type Embedding = z.infer<typeof EmbeddingSchema>;
export type Topology = z.infer<typeof TopologySchema>;
export type Validation = z.infer<typeof ValidationSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type CanonicalPacket = z.infer<typeof CanonicalPacketSchema>;

// ── Partial Schemas (for intermediate stages) ────────────────────────────

export const PacketAfterLayer1Schema = PacketIdentitySchema.merge(SourceLocationSchema).merge(ExtractionPayloadSchema).merge(ValidationSchema);
export const PacketAfterLayer2Schema = PacketAfterLayer1Schema.merge(EmbeddingSchema).merge(TopologySchema);
export const PacketAfterLayer3Schema = PacketAfterLayer2Schema
  .merge(SummarySchema)
  .merge(SemanticLabelSchema)
  .merge(FanoutLayoutSchema);

export type PacketAfterLayer1 = z.infer<typeof PacketAfterLayer1Schema>;
export type PacketAfterLayer2 = z.infer<typeof PacketAfterLayer2Schema>;
export type PacketAfterLayer3 = z.infer<typeof PacketAfterLayer3Schema>;

// ── Validation Helpers ───────────────────────────────────────────────────

export function validatePacket(data: unknown): { ok: boolean; packet?: CanonicalPacket; error?: string } {
  const result = CanonicalPacketSchema.safeParse(data);
  if (result.success) {
    return { ok: true, packet: result.data };
  } else {
    return { ok: false, error: result.error.message };
  }
}

export function validatePacketAfterLayer1(data: unknown): { ok: boolean; packet?: PacketAfterLayer1; error?: string } {
  const result = PacketAfterLayer1Schema.safeParse(data);
  if (result.success) {
    return { ok: true, packet: result.data };
  } else {
    return { ok: false, error: result.error.message };
  }
}

// ── Examples ─────────────────────────────────────────────────────────────

export const PACKET_EXAMPLE_LAYER_1: PacketAfterLayer1 = {
  packet_key: 'ace:chunk:auth:001',
  source_ref: 'src/lib/server/auth.ts',
  source_id: '550e8400-e29b-41d4-a716-446655440000',
  feature_id: 'auth.sessions',
  feature_label: 'Authentication Sessions',
  relative_path: 'src/lib/server/auth.ts',
  line_start: 42,
  line_end: 89,
  chunk_hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
  entities: [
    { type: 'FUNCTION', value: 'validateSession', confidence: 0.99 },
    { type: 'TYPE', value: 'Lucia', confidence: 0.95 },
  ],
  events: [],
  claims: [{ claim: 'Sessions validated server-side', evidence: 'Lucia pattern' }],
  relations: [{ type: 'DEPENDS_ON', target: 'src/lib/server/db/client.ts', confidence: 0.9 }],
  crime_signals: [],
  validation_status: 'PASS',
  gan_validated: false,
  gan_errors: [],
  gan_warnings: [],
  confidence_score: 0.97,
  extraction_method: 'langextract_v2',
  trace_id: 'trace:2026-06-28:phase85:p9:001',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const PACKET_EXAMPLE_LAYER_2: PacketAfterLayer2 = {
  ...PACKET_EXAMPLE_LAYER_1,
  dimension: 384,
  model: 'embeddinggemma:latest',
  normalized: true,
  som_cluster: 42,
  som_bmu_row: 2,
  som_bmu_col: 1,
  kmeans_cluster: 7,
  community_id: 4,
  som_row: 2,
  som_col: 1,
  latent_64: new Array(64).fill(0),
  ontology_tags: ['auth', 'session', 'validation'],
  indexed_at: new Date().toISOString(),
};

export const PACKET_EXAMPLE_LAYER_3: PacketAfterLayer3 = {
  ...PACKET_EXAMPLE_LAYER_2,
  summary_text: 'Authentication session validation follows Lucia convention: session created via createSession(user), validated server-side in middleware, stored in Postgres via sql client. Depends on db/client for connection pool.',
  summary_model: 'gemma4-legal-iq4xs-direct.gguf',
  summary_generated_at: new Date().toISOString(),
  used_concepts: ['authentication', 'session', 'validation', 'lucia', 'postgres'],
  lexical_nouns: ['session', 'middleware', 'client', 'connection', 'pool'],
  lexical_verbs: ['create', 'validate', 'store'],
  lexical_adverbs_ly: ['server-side'],
  relationship_hints: ['CALLS', 'DEPENDS_ON', 'VALIDATES'],
  routing_hints: ['retrieval', 'fanout', 'neo4j', 'bitfrost'],
  adjacency_packet_keys: ['ace:chunk:auth:001'],
  adjacency_feature_ids: ['auth.sessions'],
  adjacency_source_refs: ['src/lib/server/auth.ts'],
  packed_arrays: {
    packet_keys: ['ace:chunk:auth:001'],
    feature_ids: ['auth.sessions'],
    source_refs: ['src/lib/server/auth.ts'],
    title_ids: ['auth.session.validation'],
  },
  columnar_tables: ['atlas_packets', 'atlas_feature_envelopes'],
  mmap_vector_refs: ['codebase_chunks_768:auth.sessions:001'],
};
