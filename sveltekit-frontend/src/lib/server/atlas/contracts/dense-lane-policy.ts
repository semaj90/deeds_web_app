/**
 * Dense Lane Policy — Two-Axis Representation Classification
 *
 * Prevents the canonical 768 lane from collapsing into legacy projections:
 * - representationName: What vector is this (semantic_768, semantic_384, latent_64)?
 * - role: What is it FOR (semantic authority, online retrieval, recall reference, routing)?
 * - lifecycle: Is it ACTIVE, REFERENCE_ONLY, MIGRATION_SOURCE, or SUPERSEDED?
 */

export enum DenseRepresentationName {
  SEMANTIC_768 = 'semantic_768',      // canonical dense 768-dim semantic lane
  SEMANTIC_384 = 'semantic_384',      // legacy / experimental 384-dim projection
  LATENT_64 = 'latent_64',            // autoencoder compression, routing only
}

export enum DenseRole {
  SEMANTIC_AUTHORITY = 'semantic_authority',      // Use this for semantic search ranking
  ONLINE_RETRIEVAL = 'online_retrieval',          // Use this for fast retrieval (prefilter, ANN)
  RECALL_REFERENCE = 'recall_reference',          // Historical, for analysis only
  ROUTING = 'routing',                            // SOM topology routing, not search
}

export enum DenseLifecycle {
  ACTIVE = 'active',                              // Actively produced and indexed
  REFERENCE_ONLY = 'reference_only',              // Available but not updated
  MIGRATION_SOURCE = 'migration_source',          // Being replaced (freeze new writes)
  SUPERSEDED = 'superseded',                      // No longer produced
}

type ISO8601 = string;

export interface DenseLanePolicy {
  representationName: DenseRepresentationName;
  role: DenseRole;
  lifecycle: DenseLifecycle;

  // Technical metadata
  nativeDimension: number;            // 768, 384, or 64
  producerModel: string;              // 'embeddinggemma:latest' or 'autoencoder_v2'
  createdAt: ISO8601;
  retiredAt?: ISO8601;                // When lifecycle changed to SUPERSEDED
}

/**
 * Canonical Dense Lane Policies (as of 2026-07-27)
 */
export const CANONICAL_DENSE_LANES: Record<DenseRepresentationName, DenseLanePolicy> = {
  [DenseRepresentationName.SEMANTIC_768]: {
    representationName: DenseRepresentationName.SEMANTIC_768,
    role: DenseRole.SEMANTIC_AUTHORITY,
    lifecycle: DenseLifecycle.ACTIVE,
    nativeDimension: 768,
    producerModel: 'embeddinggemma:latest',
    createdAt: '2026-06-01T00:00:00Z',
  },

  [DenseRepresentationName.SEMANTIC_384]: {
    representationName: DenseRepresentationName.SEMANTIC_384,
    role: DenseRole.RECALL_REFERENCE,
    // Reclassified MIGRATION_SOURCE (was REFERENCE_ONLY): under REFERENCE_ONLY it was ambiguous
    // whether callers could still treat this lane as admissible for current proof gates.
    // `resolve-embedding-lane.ts` already blocks it at read time (LEGACY_DIMENSION_EXPLICIT_ONLY),
    // and the live `codebase_chunks_384_hybrid` Qdrant collection was confirmed empty (0 points)
    // and was, until this session, being queried by `rrf-integration.ts` in a way that crashed
    // the canonical 768 lane's results too (fixed separately). MIGRATION_SOURCE (not SUPERSEDED)
    // because scripts/atlas/{backfill-content-embedding-384,backfill-hybrid-collection,
    // audit-embedding-provenance-384}.mjs still exist and target this dimension — treat new
    // writes here as frozen, not the lane itself as fully retired, until those scripts are
    // themselves reviewed/archived.
    lifecycle: DenseLifecycle.MIGRATION_SOURCE,
    nativeDimension: 384,
    producerModel: 'embeddinggemma:latest (legacy projection)',
    createdAt: '2026-07-15T00:00:00Z',
  },

  [DenseRepresentationName.LATENT_64]: {
    representationName: DenseRepresentationName.LATENT_64,
    role: DenseRole.ROUTING,
    lifecycle: DenseLifecycle.REFERENCE_ONLY,  // Not actively produced yet
    nativeDimension: 64,
    producerModel: 'autoencoder_v1 (768->64)',
    createdAt: '2026-07-20T00:00:00Z',
  },
};

/**
 * Policy decision rule:
 * - Semantic search ranking (XGBoost features): Use SEMANTIC_AUTHORITY (semantic_768)
 * - Fast ANN prefilter (Qdrant HNSW): Prefer SEMANTIC_AUTHORITY (semantic_768)
 * - Topology routing (SOM neighbors): Use ROUTING (latent_64 when available, else semantic_768)
 * - Historical analysis (why a lane existed): Use RECALL_REFERENCE
 *
 * Do NOT collapse legacy projections into the canonical embedding lane.
 * Preserve explicit lineage through the retrieval pipeline.
 */
export function isPolicyActive(policy: DenseLanePolicy): boolean {
  return policy.lifecycle === DenseLifecycle.ACTIVE;
}

export function isSynonymous(
  rep1: DenseRepresentationName,
  rep2: DenseRepresentationName
): boolean {
  // semantic_384 and semantic_768 are NOT synonymous — one is legacy/reference-only.
  return rep1 === rep2;
}
