/**
 * SEMANTIC_768_RUNTIME_CUTOVER — canonical runtime contract.
 *
 * Active semantic embedding lane: semantic_768 (768-dim, EmbeddingGemma native).
 * latent_128 / latent_64 are topology/routing projections — NOT embedding APIs
 * and never substitutable for semantic_768 at retrieval time.
 *
 * 384-dim and 512-dim are retired: no runtime code may read or write them.
 * Migration-only tooling that still needs 384-dim access belongs in
 * `embedding/legacy-384-migration.ts` and must never be imported from
 * retrieval, ACE, cache, or reranking paths.
 */

export const SEMANTIC_REPRESENTATION_ID = 'semantic_768' as const;
export const SEMANTIC_DIMENSION = 768 as const;
export const CANONICAL_QDRANT_COLLECTION = 'codebase_chunks_768' as const;

export const TOPOLOGY_REPRESENTATIONS = {
  latent_128: 128,
  latent_64: 64,
} as const;

export type TopologyRepresentationId = keyof typeof TOPOLOGY_REPRESENTATIONS;
export type SemanticDimension = typeof SEMANTIC_DIMENSION;
export type TopologyDimension = (typeof TOPOLOGY_REPRESENTATIONS)[TopologyRepresentationId];

/**
 * Fail-closed guard for the active semantic lane. Throws rather than
 * silently normalizing, truncating, or padding into a different dimension.
 */
export function assertSemantic768(
  vector: readonly number[] | Float32Array,
): asserts vector is readonly number[] {
  if (vector.length !== SEMANTIC_DIMENSION) {
    throw new Error(
      `SEMANTIC_768_DIMENSION_MISMATCH: expected ${SEMANTIC_DIMENSION}, received ${vector.length}`,
    );
  }
}

export interface SemanticLaneInput {
  representationId?: string;
  dimension?: number;
}

export interface ResolvedSemanticLane {
  representationId: typeof SEMANTIC_REPRESENTATION_ID;
  dimension: typeof SEMANTIC_DIMENSION;
}

/**
 * Single source of truth for resolving a caller-supplied lane request down
 * to the canonical semantic lane. Fails closed — never normalizes a 384 (or
 * any other) request back onto an accepted lane. Call this from every
 * orchestrator entry point instead of re-implementing the same branch.
 */
export function resolveSemanticLane(input: SemanticLaneInput = {}): ResolvedSemanticLane {
  const representationId = input.representationId ?? SEMANTIC_REPRESENTATION_ID;
  const dimension = input.dimension ?? SEMANTIC_DIMENSION;

  if (representationId !== SEMANTIC_REPRESENTATION_ID || dimension !== SEMANTIC_DIMENSION) {
    throw new Error(`UNSUPPORTED_SEMANTIC_LANE: ${representationId}/${dimension}`);
  }

  return { representationId: SEMANTIC_REPRESENTATION_ID, dimension: SEMANTIC_DIMENSION };
}
