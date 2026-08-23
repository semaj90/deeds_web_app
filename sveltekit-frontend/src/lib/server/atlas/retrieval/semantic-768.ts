import { embedQueryForLane, type EmbeddingResult } from '$lib/server/retrieval/embedding-service.js';
import {
  ATLAS_CANONICAL_SEMANTIC_DIMENSION,
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
  ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
} from './qdrant-semantic-projection.js';

export interface Semantic768EmbeddingResultV1 extends EmbeddingResult {
  representationId: typeof ATLAS_CANONICAL_SEMANTIC_REPRESENTATION;
  nativeModelDimension: typeof ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION;
}

export async function embedSemantic768(query: string): Promise<Semantic768EmbeddingResultV1> {
  const result = await embedQueryForLane(query, 'dense_768');
  if (result.vector.length !== ATLAS_CANONICAL_SEMANTIC_DIMENSION) {
    throw new Error(`ATLAS_SEMANTIC_768_DIMENSION_MISMATCH:${result.vector.length}`);
  }
  return {
    ...result,
    dimension: ATLAS_CANONICAL_SEMANTIC_DIMENSION,
    representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    nativeModelDimension: ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
  };
}
