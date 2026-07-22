import type { VectorContract } from '$lib/server/embedding/knn-helper.js';

export interface EmbeddingGemmaProjectionContract extends VectorContract {
  sourceDimension: number;
  outputDimension: number;
  truncation: 'none' | 'prefix' | 'pad';
  canonical: boolean;
}

export const EMBEDDINGGEMMA_FULL768_V1 = 'embeddinggemma-full768-v1' as const;
export const ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1 = 'atlas-embeddinggemma-direct-slice384-v1' as const;
/**
 * Backward-compatible alias for the Atlas-defined 384 projection lane.
 * Prefer `ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1` in new contracts.
 */
export const EMBEDDINGGEMMA_PREFIX384_V1 = ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1;

export const EMBEDDINGGEMMA_FULL768_CONTRACT: EmbeddingGemmaProjectionContract = {
  modelId: EMBEDDINGGEMMA_FULL768_V1,
  modelVersion: '2026-07-21',
  sourceDimension: 768,
  outputDimension: 768,
  dimension: 768,
  normalization: 'l2',
  metric: 'cosine',
  vectorPurpose: 'content-semantic',
  truncation: 'none',
  canonical: true,
};

export const EMBEDDINGGEMMA_PREFIX384_CONTRACT: EmbeddingGemmaProjectionContract = {
  modelId: EMBEDDINGGEMMA_PREFIX384_V1,
  modelVersion: '2026-07-21',
  sourceDimension: 768,
  outputDimension: 384,
  dimension: 384,
  normalization: 'l2',
  metric: 'cosine',
  vectorPurpose: 'content-semantic',
  truncation: 'prefix',
  canonical: false,
};

export const EMBEDDINGGEMMA_PREFIX384_SNAPSHOT = {
  contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
  dimension: 384,
  sourceTable: 'atlas_packets',
  embeddingColumn: 'content_embedding_384',
  identityColumns: ['packet_key', 'source_ref'] as const,
} as const;

export function projectEmbeddingForContract(
  vector: readonly number[],
  contract: EmbeddingGemmaProjectionContract
): number[] {
  if (!Array.isArray(vector)) {
    throw new Error(`Expected embedding array for ${contract.modelId}`);
  }

  if (contract.truncation === 'none') {
    if (vector.length !== contract.dimension) {
      throw new Error(
        `Canonical embedding mismatch for ${contract.modelId}: expected ${contract.dimension}, got ${vector.length}`
      );
    }
    return Array.from(vector);
  }

  if (contract.truncation === 'prefix') {
    if (vector.length < contract.outputDimension) {
      throw new Error(
        `Derived embedding too short for ${contract.modelId}: expected at least ${contract.outputDimension}, got ${vector.length}`
      );
    }
    return Array.from(vector.slice(0, contract.outputDimension));
  }

  if (vector.length > contract.outputDimension) {
    return Array.from(vector.slice(0, contract.outputDimension));
  }

  if (vector.length < contract.outputDimension) {
    const padded = new Array(contract.outputDimension).fill(0);
    for (let i = 0; i < vector.length; i += 1) {
      padded[i] = Number(vector[i]);
    }
    return padded;
  }

  return Array.from(vector);
}
