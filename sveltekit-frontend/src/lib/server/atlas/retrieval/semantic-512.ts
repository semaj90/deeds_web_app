import { embedQueryForLane, type EmbeddingResult } from '$lib/server/retrieval/embedding-service.js';

// Explicit compatibility constants. This module is a reference-only MRL
// adapter and must not inherit the active semantic_768 authority constants.
const LEGACY_SEMANTIC_REPRESENTATION = 'semantic_512' as const;
const LEGACY_SEMANTIC_DIMENSION = 512 as const;
const EMBEDDINGGEMMA_NATIVE_DIMENSION = 768 as const;
const LEGACY_PROJECTION_METHOD = 'embeddinggemma-mrl-prefix-renorm' as const;

export interface Semantic512EmbeddingResultV1 extends EmbeddingResult {
  representationId: typeof LEGACY_SEMANTIC_REPRESENTATION;
  nativeModelDimension: typeof EMBEDDINGGEMMA_NATIVE_DIMENSION;
  projectionMethod: typeof LEGACY_PROJECTION_METHOD;
}

export function l2Normalize512(input: Float32Array): Float32Array {
  if (input.length !== LEGACY_SEMANTIC_DIMENSION) {
    throw new Error(`ATLAS_SEMANTIC_512_DIMENSION_MISMATCH: ${input.length}`);
  }
  let normSq = 0;
  for (let i = 0; i < input.length; i++) normSq += input[i] * input[i];
  const norm = Math.sqrt(normSq);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error('ATLAS_SEMANTIC_512_ZERO_OR_INVALID_NORM');
  }
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = input[i] / norm;
  return output;
}

export function projectEmbeddingGemmaToSemantic512(native768: Float32Array): Float32Array {
  if (native768.length !== EMBEDDINGGEMMA_NATIVE_DIMENSION) {
    throw new Error(
      `ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION_MISMATCH: expected ${EMBEDDINGGEMMA_NATIVE_DIMENSION}, got ${native768.length}`,
    );
  }
  return l2Normalize512(native768.slice(0, LEGACY_SEMANTIC_DIMENSION));
}

/**
 * Canonical persisted Parent Atlas query representation.
 *
 * The embedding model may natively produce 768 values, but Atlas does not
 * require a persisted 768 corpus. The canonical persisted/query vector is the
 * officially-supported EmbeddingGemma MRL 512 prefix, re-normalized before it
 * is handed to Qdrant or cuVS cosine search.
 */
export async function embedSemantic512(query: string): Promise<Semantic512EmbeddingResultV1> {
  const native = await embedQueryForLane(query, 'dense_768');
  const vector = projectEmbeddingGemmaToSemantic512(native.vector);
  return {
    ...native,
    vector,
    dimension: LEGACY_SEMANTIC_DIMENSION,
    representationId: LEGACY_SEMANTIC_REPRESENTATION,
    nativeModelDimension: EMBEDDINGGEMMA_NATIVE_DIMENSION,
    projectionMethod: LEGACY_PROJECTION_METHOD,
  };
}
