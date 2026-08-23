import { embedQueryForLane, type EmbeddingResult } from '$lib/server/retrieval/embedding-service.js';
import {
  ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
} from './qdrant-semantic-projection.js';

export const SEMANTIC_512_REPRESENTATION = 'semantic_512' as const;
export const SEMANTIC_512_DIMENSION = 512 as const;
export const SEMANTIC_512_PROJECTION_METHOD = 'embeddinggemma-mrl-prefix-512-renorm-v1' as const;

export interface Semantic512EmbeddingResultV1 extends EmbeddingResult {
  representationId: typeof SEMANTIC_512_REPRESENTATION;
  nativeModelDimension: typeof ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION;
  projectionMethod: typeof SEMANTIC_512_PROJECTION_METHOD;
}

export function l2Normalize512(input: Float32Array): Float32Array {
  if (input.length !== SEMANTIC_512_DIMENSION) {
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
  if (native768.length !== ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION) {
    throw new Error(
      `ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION_MISMATCH: expected ${ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION}, got ${native768.length}`,
    );
  }
  return l2Normalize512(native768.slice(0, SEMANTIC_512_DIMENSION));
}

/**
 * Derived MRL routing/search representation.
 *
 * The native EmbeddingGemma representation remains semantic_768. This helper
 * produces an explicitly revisioned 512-value prefix for an admitted derived
 * lane; it must not be treated as the native semantic owner or mixed with the
 * semantic_768 Qdrant collection.
 */
export async function embedSemantic512(query: string): Promise<Semantic512EmbeddingResultV1> {
  const native = await embedQueryForLane(query, 'dense_768');
  const vector = projectEmbeddingGemmaToSemantic512(native.vector);
  return {
    ...native,
    vector,
    dimension: SEMANTIC_512_DIMENSION,
    representationId: SEMANTIC_512_REPRESENTATION,
    nativeModelDimension: ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
    projectionMethod: SEMANTIC_512_PROJECTION_METHOD,
  };
}
