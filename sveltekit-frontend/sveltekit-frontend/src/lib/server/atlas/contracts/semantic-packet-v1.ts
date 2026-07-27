/**
 * SemanticPacketV1 — Canonical Contract
 *
 * Consolidates all existing packet implementations (HyperRagPacketRpc,
 * TaskSemanticPacket, phase18 envelope, Postgres atlas_packets) into one
 * versioned identity contract.
 *
 * Session 142 Reframing: Single source of truth for packet identity,
 * content, knowledge, resolution, authority, and representation across
 * Postgres → Qdrant → Redis → HyperRAG RPC → ACE context → Agent.
 */

import { z } from 'zod';

/**
 * Identity Section — Deterministic packet identity (immutable across layers)
 *
 * packet_key is SHA256 of (source_ref + tree_node_id + title_id).
 * MUST remain identical across Postgres → Qdrant → Redis → RPC → Agent.
 */
export const semanticPacketIdentitySchema = z.object({
  packet_key: z.string().describe('SHA256 deterministic identity (source_ref + tree_node_id + title_id)'),
  packet_id: z.string().nullable().describe('Postgres row UUID (atlas_packets.id)'),
  packet_ulid: z.string().nullable().describe('Sortable event identity (ULID format)'),
  tree_node_id: z.string().nullable().describe('Structural AST identity from tree-sitter'),
  source_ref: z.string().nullable().describe('Source file path (e.g., src/lib/server/...)'),
  title_id: z.string().nullable().describe('Semantic grouping key'),
  content_hash: z.string().nullable().describe('SHA256 of content for integrity verification'),
});

export type SemanticPacketIdentity = z.infer<typeof semanticPacketIdentitySchema>;

/**
 * Content Section — Text, embeddings, summaries, tags (Multi-Representation)
 *
 * CRITICAL: Do NOT concatenate 384 and 768 embeddings.
 * They are separate semantic spaces with different models, training, normalization.
 * Treat as named representations: semantic_384 (canonical), legacy_768 (recall), latent_64 (routing).
 * Fuse scores/ranks, NOT raw coordinates.
 *
 * Reference: Heterogeneous multivector retrieval architecture.
 * semantic_384: Canonical online retrieval, Qdrant HNSW.
 * legacy_768: Recall compatibility lane, existing Qdrant collection.
 * latent_64: Clustering, centroid routing, compressed ANN experiment.
 * topology_4d: Visualization, drift detection, low-dimensional ordering.
 */
export const semanticPacketContentSchema = z.object({
  summary: z.string().nullable().describe('LOD0 summary (80-200 tokens)'),
  gemma4_summary: z.string().nullable().describe('Gemma4-generated summary'),

  // Multi-representation vectors (named, versioned, separately indexed)
  semantic_384: z.object({
    values: z.array(z.number()).describe('384-dim canonical semantic vector'),
    model_version: z.string().default('embeddinggemma:384:v4').describe('e.g., embeddinggemma:384:v4'),
    normalized: z.boolean().default(true).describe('L2 normalized'),
    qdrant_point_id: z.string().nullable().describe('Qdrant codebase_packets_v4 collection point ID'),
    collection: z.string().default('codebase_packets_v4').describe('Qdrant collection name'),
  }).nullable(),

  legacy_768: z.object({
    values: z.array(z.number()).nullable().describe('768-dim legacy vector (reference only, not for queries)'),
    model_version: z.string().nullable().describe('e.g., legacy_768:v2'),
    normalized: z.boolean().default(true),
    qdrant_point_id: z.string().nullable().describe('Qdrant codebase_chunks_768 collection point ID'),
    collection: z.string().nullable().describe('Qdrant collection name'),
    status: z.enum(['ACTIVE', 'REFERENCE_ONLY', 'MIGRATION_SOURCE', 'SUPERSEDED']).default('REFERENCE_ONLY').describe('Authority and use guidance'),
  }).nullable(),

  latent_64: z.object({
    values: z.array(z.number()).nullable().describe('64-dim autoencoder latent (routing, clustering only)'),
    model_version: z.string().nullable().describe('e.g., ae64:v3'),
    geometry: z.object({
      kmeans_cluster_id: z.number().nullable(),
      centroid_distance: z.number().nullable(),
      som_cell_id: z.number().nullable(),
      som_x: z.number().nullable(),
      som_y: z.number().nullable(),
      hilbert_order: z.number().nullable().describe('Space-filling curve ordering for SOM locality'),
    }).nullable(),
  }).nullable(),

  // 4D topology projection (visualization, drift detection)
  topology_4d: z.array(z.number()).nullable().describe('4-dim topology/visualization projection'),

  tags: z.array(z.string()).default([]).describe('Semantic tags (feature names, domain labels)'),
});

export type SemanticPacketContent = z.infer<typeof semanticPacketContentSchema>;

/**
 * Knowledge Section — Feature identity, classification, topology
 */
export const semanticPacketKnowledgeSchema = z.object({
  feature_id: z.string().nullable().describe('Feature classification (e.g., auth.sessions)'),
  feature_label: z.string().nullable().describe('Human-readable feature name'),
  ontology_label: z.string().nullable().describe('Domain ontology classification'),
  topology_label: z.string().nullable().describe('Graph topology classification'),
  domain_class: z.string().nullable().describe('Domain-specific classification enum'),
});

export type SemanticPacketKnowledge = z.infer<typeof semanticPacketKnowledgeSchema>;

/**
 * Resolution Section — Verification status, confidence, audit trail
 */
export const semanticPacketResolutionSchema = z.object({
  status: z.enum(['unresolved', 'candidate', 'verified', 'disputed']).default('unresolved'),
  confidence: z.number().min(0).max(1).default(0.5).describe('Confidence [0, 1]'),
  verified_at: z.string().nullable().describe('ISO timestamp of verification'),
  verification_command: z.string().nullable().describe('Command to re-verify (e.g., npm run test)'),
  required_verification: z.boolean().default(false).describe('Manual verification required'),
});

export type SemanticPacketResolution = z.infer<typeof semanticPacketResolutionSchema>;

/**
 * Authority Section — Ranking scores across multiple dimensions
 */
export const semanticPacketAuthoritySchema = z.object({
  karpathy_blend_score: z.number().min(0).nullable().describe('Karpathy hybrid rank (0.4·PR + 0.3·attn + 0.3·authority)'),
  pagerank_score: z.number().min(0).nullable().describe('Neo4j PageRank authority'),
  authority_class: z.enum(['high', 'medium', 'low']).nullable().describe('Authority classification'),
});

export type SemanticPacketAuthority = z.infer<typeof semanticPacketAuthoritySchema>;

/**
 * Representations Section — Where this packet lives across storage layers
 */
export const semanticPacketRepresentationsSchema = z.object({
  qdrant_point_id: z.string().nullable().describe('Qdrant codebase_chunks_768 point ID'),
  postgres_row_id: z.string().nullable().describe('Postgres atlas_packets row UUID'),
  redis_key: z.string().nullable().describe('Redis bifrost:packet:{key} cache key'),
  cold_storage_uri: z.string().nullable().describe('SeaweedFS URI if archived'),
});

export type SemanticPacketRepresentations = z.infer<typeof semanticPacketRepresentationsSchema>;

/**
 * Routing Section — Derived features for retrieval & clustering (NOT identity)
 *
 * These fields are ROUTING ONLY (for som_cluster, kmeans_cluster, directory_path).
 * They are NOT identity and MUST NOT be used for deduplication or joining.
 */
export const semanticPacketRoutingSchema = z.object({
  som_cluster: z.string().nullable().describe('SOM (Self-Organizing Map) cell assignment'),
  kmeans_cluster: z.number().nullable().describe('K-Means cluster ID'),
  cluster_key: z.string().nullable().describe('Derived cluster key (not identity)'),
  directory_path: z.string().nullable().describe('Parent directory path'),
  neo4j_neighbors: z.array(z.string()).default([]).describe('Neo4j neighbor IDs (k-hop bounded)'),
  community_id: z.number().nullable().describe('Graph community assignment'),
});

export type SemanticPacketRouting = z.infer<typeof semanticPacketRoutingSchema>;

/**
 * SemanticPacketV1 — Complete packet contract
 *
 * Union of identity + content + knowledge + resolution + authority + representations + routing.
 * This is the canonical shape for all packet operations.
 */
export const semanticPacketV1Schema = z.object({
  // Identity (immutable, canonical)
  ...semanticPacketIdentitySchema.shape,

  // Content (text, embeddings, tags)
  ...semanticPacketContentSchema.shape,

  // Knowledge (feature, ontology, topology classification)
  ...semanticPacketKnowledgeSchema.shape,

  // Resolution (status, confidence, verification)
  ...semanticPacketResolutionSchema.shape,

  // Authority (ranking, pagerank, authority class)
  ...semanticPacketAuthoritySchema.shape,

  // Representations (where it lives: Postgres, Qdrant, Redis, etc.)
  ...semanticPacketRepresentationsSchema.shape,

  // Routing (NOT identity: SOM, KMeans, directory, topology)
  ...semanticPacketRoutingSchema.shape,

  // Metadata
  created_at: z.string().nullable().describe('ISO timestamp of packet creation'),
  updated_at: z.string().nullable().describe('ISO timestamp of last update'),
  packet_type: z.enum(['chrom97', 'neschrom97', 'task', 'fact']).default('chrom97'),
  schema_version: z.string().default('1.0.0'),
});

export type SemanticPacketV1 = z.infer<typeof semanticPacketV1Schema>;

/**
 * Contract Validation Result — Audit envelope for any validation pass/fail
 */
export const contractValidationResultSchema = z.object({
  is_valid: z.boolean(),
  validation_errors: z.array(z.string()).default([]),
  validated_at: z.string().describe('ISO timestamp'),
  validated_by: z.string().nullable().describe('Component that performed validation'),
  trace_id: z.string().nullable().describe('Observability trace ID'),
  gate_name: z.string().nullable().describe('Which gate (e.g., G1, G4, identity_immutability)'),
});

export type ContractValidationResult = z.infer<typeof contractValidationResultSchema>;

/**
 * Derived Parameters — Query-time and model parameters (NOT persistent in packet)
 *
 * Three classes of parameters (reference: heterogeneous multivector architecture):
 * 1. Static indexed: computed offline, stable until rebuild (kmeans_cluster_id, pagerank_percentile)
 * 2. Query dynamic: computed per query, kept in request memory (query_centroid_similarity, logistic_probability)
 * 3. Learned model: stored in model registry, loaded into process/GPU (logistic coefficients, XGBoost trees)
 *
 * DO NOT permanently write query-specific relevance into canonical packet.
 * It depends on a particular query and should not persist across sessions.
 */
export const derivedParametersSchema = z.object({
  // Static indexed parameters (in packet, stable)
  domain_class: z.string().nullable().describe('Domain classification enum'),
  feature_id: z.string().nullable().describe('Feature identity'),
  ontology_id: z.string().nullable().describe('Ontology classification'),
  global_pagerank_percentile: z.number().min(0).max(100).nullable().describe('PageRank percentile [0-100]'),

  // Query dynamic parameters (request memory, short TTL in Redis)
  query_dynamic: z.object({
    cosine_384: z.number().nullable().describe('Query to semantic_384 cosine similarity'),
    cosine_768: z.number().nullable().describe('Query to legacy_768 cosine similarity (recall)'),
    bm25_score: z.number().nullable().describe('BM25 exact term match score'),
    bm42_score: z.number().nullable().describe('BM42 sparse vector score'),
    centroid_similarity: z.number().nullable().describe('Query to cluster centroid similarity'),
    graph_path_score: z.number().nullable().describe('Neo4j shortest path or k-hop relevance'),
    logistic_probability: z.number().min(0).max(1).nullable().describe('Logistic regression domain probability'),
    xgboost_score: z.number().nullable().describe('XGBoost nonlinear fusion score (final reranking)'),
  }).nullable(),

  // Query-time ranks (computed from scores above)
  query_ranks: z.object({
    semantic_384_rank: z.number().nullable().describe('Rank in semantic_384 lane'),
    legacy_768_rank: z.number().nullable().describe('Rank in legacy_768 lane'),
    bm25_rank: z.number().nullable().describe('Rank in BM25 lexical lane'),
    graph_rank: z.number().nullable().describe('Rank in graph expansion lane'),
  }).nullable(),

  // Learned model parameters (stored in model registry, loaded at runtime)
  model_parameters: z.object({
    logistic_version: z.string().nullable().describe('e.g., logreg_router_v4'),
    xgboost_version: z.string().nullable().describe('e.g., phase18_xgb_v3'),
    fusion_strategy: z.enum(['rrf', 'learned_fusion', 'score_calibration']).nullable().describe('How to combine multi-lane scores'),
    calibration_model_id: z.string().nullable().describe('Reference to artifact path for calibration curves'),
  }).nullable(),
});

export type DerivedParameters = z.infer<typeof derivedParametersSchema>;

/**
 * Rank Fusion — Recommended Approach for Multi-Lane Retrieval
 *
 * Do NOT concatenate or mix raw scores from different semantic spaces.
 * Instead, fuse RANKS using Reciprocal Rank Fusion (RRF):
 *
 * rrf_score(packet) = sum over lanes (1 / (k + rank_in_lane))
 *
 * Where k is typically 60, and rank_in_lane is the position in each lane's top-K.
 */
export const rankFusionSchema = z.object({
  packet_key: z.string().describe('Canonical packet identity'),
  rrf_rank_384: z.number().describe('Reciprocal rank in semantic_384 lane'),
  rrf_rank_768: z.number().describe('Reciprocal rank in legacy_768 lane'),
  rrf_rank_bm25: z.number().describe('Reciprocal rank in BM25 lexical lane'),
  rrf_rank_graph: z.number().describe('Reciprocal rank in graph expansion lane'),
  fused_rrf_score: z.number().describe('Final RRF fusion score'),
  fusion_explanation: z.string().nullable().describe('Why this packet ranked high (primary_reason, supporting_path)'),
});

export type RankFusion = z.infer<typeof rankFusionSchema>;

/**
 * Validation functions
 */

export function validateSemanticPacket(input: unknown): ContractValidationResult {
  try {
    semanticPacketV1Schema.parse(input);
    return {
      is_valid: true,
      validation_errors: [],
      validated_at: new Date().toISOString(),
      validated_by: 'semanticPacketV1',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      is_valid: false,
      validation_errors: [errorMessage],
      validated_at: new Date().toISOString(),
      validated_by: 'semanticPacketV1',
    };
  }
}

export function validatePacketKeyImmutability(stored: SemanticPacketV1, retrieved: SemanticPacketV1): ContractValidationResult {
  if (stored.packet_key !== retrieved.packet_key) {
    return {
      is_valid: false,
      validation_errors: [
        `packet_key mismatch: stored=${stored.packet_key}, retrieved=${retrieved.packet_key}`,
      ],
      validated_at: new Date().toISOString(),
      validated_by: 'packet_key_immutability_gate',
      gate_name: 'identity_immutability',
    };
  }
  return {
    is_valid: true,
    validation_errors: [],
    validated_at: new Date().toISOString(),
    validated_by: 'packet_key_immutability_gate',
    gate_name: 'identity_immutability',
  };
}

/**
 * Type-safe builders for cross-layer conversions
 */

export function fromHyperRagPacketRpcPacket(input: {
  packet_key: string;
  source_ref: string;
  feature_id: string | null;
  feature_label: string | null;
  [key: string]: unknown;
}): SemanticPacketV1 {
  return {
    packet_key: input.packet_key,
    packet_id: null,
    packet_ulid: null,
    tree_node_id: null,
    source_ref: input.source_ref,
    title_id: null,
    content_hash: null,
    summary: null,
    gemma4_summary: null,
    embedding: null,
    embedding_model: null,
    tags: [],
    feature_id: input.feature_id,
    feature_label: input.feature_label,
    ontology_label: null,
    topology_label: null,
    domain_class: null,
    status: 'unresolved',
    confidence: 0.5,
    verified_at: null,
    verification_command: null,
    required_verification: false,
    karpathy_blend_score: null,
    pagerank_score: null,
    authority_class: null,
    qdrant_point_id: null,
    postgres_row_id: null,
    redis_key: null,
    cold_storage_uri: null,
    som_cluster: null,
    kmeans_cluster: null,
    cluster_key: null,
    directory_path: null,
    neo4j_neighbors: [],
    community_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    packet_type: 'chrom97',
    schema_version: '1.0.0',
  };
}

export function fromTaskSemanticPacket(input: {
  packetId: string;
  taskId: number;
  sourceRef: string;
  featureId: string | null;
  summary: string;
  [key: string]: unknown;
}): SemanticPacketV1 {
  return {
    packet_key: input.packetId,
    packet_id: input.packetId,
    packet_ulid: null,
    tree_node_id: null,
    source_ref: input.sourceRef,
    title_id: null,
    content_hash: null,
    summary: input.summary,
    gemma4_summary: null,
    embedding: null,
    embedding_model: null,
    tags: [],
    feature_id: input.featureId,
    feature_label: null,
    ontology_label: null,
    topology_label: null,
    domain_class: null,
    status: 'candidate',
    confidence: 0.6,
    verified_at: null,
    verification_command: null,
    required_verification: false,
    karpathy_blend_score: null,
    pagerank_score: null,
    authority_class: null,
    qdrant_point_id: null,
    postgres_row_id: null,
    redis_key: null,
    cold_storage_uri: null,
    som_cluster: null,
    kmeans_cluster: null,
    cluster_key: null,
    directory_path: null,
    neo4j_neighbors: [],
    community_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    packet_type: 'task',
    schema_version: '1.0.0',
  };
}
