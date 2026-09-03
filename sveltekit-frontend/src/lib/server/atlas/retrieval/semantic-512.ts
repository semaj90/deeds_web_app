import { embedQueryForLane, type EmbeddingResult } from '../../retrieval/embedding-service.js';

// This module is a derived EmbeddingGemma MRL adapter. It never becomes the
// semantic_768 storage or identity authority.
const MRL_SEMANTIC_REPRESENTATION = 'semantic_mrl_512' as const;
const LEGACY_SEMANTIC_REPRESENTATION = 'semantic_512' as const;
const MRL_SEMANTIC_DIMENSION = 512 as const;
const LEGACY_SEMANTIC_DIMENSION = MRL_SEMANTIC_DIMENSION;
const EMBEDDINGGEMMA_NATIVE_DIMENSION = 768 as const;
const LEGACY_PROJECTION_METHOD = 'embeddinggemma-mrl-prefix-renorm' as const;

export interface Semantic512EmbeddingResultV1 extends EmbeddingResult {
  representationId: typeof LEGACY_SEMANTIC_REPRESENTATION;
  nativeModelDimension: typeof EMBEDDINGGEMMA_NATIVE_DIMENSION;
  projectionMethod: typeof LEGACY_PROJECTION_METHOD;
}

export interface SemanticMrl512EmbeddingResultV1 extends EmbeddingResult {
  representationId: typeof MRL_SEMANTIC_REPRESENTATION;
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

/** Derive MRL semantic_mrl_512 from native semantic_768 without persistence. */
export function projectEmbeddingGemmaToSemanticMrl512(native768: Float32Array): Float32Array {
  return projectEmbeddingGemmaToSemantic512(native768);
}

/**
 * Legacy query-time compatibility representation.
 *
 * The canonical stored representation remains semantic_768. New callers
 * should use embedSemanticMrl512 so the derived MRL identity is explicit;
 * this function remains for historical semantic_512 callers only.
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

/** Query-time MRL adapter with the current representation identity. */
export async function embedSemanticMrl512(query: string): Promise<SemanticMrl512EmbeddingResultV1> {
  const native = await embedQueryForLane(query, 'dense_768');
  const vector = projectEmbeddingGemmaToSemanticMrl512(native.vector);
  return {
    ...native,
    vector,
    dimension: MRL_SEMANTIC_DIMENSION,
    representationId: MRL_SEMANTIC_REPRESENTATION,
    nativeModelDimension: EMBEDDINGGEMMA_NATIVE_DIMENSION,
    projectionMethod: LEGACY_PROJECTION_METHOD,
  };
}
