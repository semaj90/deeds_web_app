import type { VectorContract } from '$lib/server/embedding/knn-helper.js';
// NOTE: this file's SEMANTIC_DIMENSION usage represents EmbeddingGemma's native
// model output width (used for both the "full768" contract and as the
// pre-slice source dimension for the 384 prefix), not the canonical persisted
// semantic_512 representation. Aliased to the native-dimension constant
// (768) rather than the canonical-persisted constant (512) to preserve this
// file's actual meaning — see CLAUDE.md task deviation note.
import { ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION as SEMANTIC_DIMENSION } from '$lib/server/atlas/retrieval/qdrant-semantic-projection.js';

export interface EmbeddingGemmaProjectionContract extends VectorContract {
  modelRevision: string;
  sourceDimension: number;
  outputDimension: number;
  truncation: 'none' | 'mrl_prefix' | 'legacy_direct_slice' | 'pad';
  projectionKind: 'none' | 'mrl_prefix' | 'direct_slice' | 'learned_autoencoder';
  encoderFamily: 'embeddinggemma';
  queryEncoderRole: 'QUERY';
  candidateEncoderRole: 'DOCUMENT';
  representationFamily: 'semantic_768' | 'semantic_mrl' | 'legacy_384';
  renormalizeAfterProjection: boolean;
  queryCompatible: boolean;
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
  modelRevision: EMBEDDINGGEMMA_FULL768_V1,
  sourceDimension: SEMANTIC_DIMENSION,
  outputDimension: SEMANTIC_DIMENSION,
  dimension: SEMANTIC_DIMENSION,
  normalization: 'l2',
  metric: 'cosine',
  vectorPurpose: 'content-semantic',
  truncation: 'none',
  projectionKind: 'none',
  encoderFamily: 'embeddinggemma',
  queryEncoderRole: 'QUERY',
  candidateEncoderRole: 'DOCUMENT',
  representationFamily: 'semantic_768',
  renormalizeAfterProjection: false,
  queryCompatible: true,
  canonical: true,
};

export const EMBEDDINGGEMMA_PREFIX384_CONTRACT: EmbeddingGemmaProjectionContract = {
  modelId: EMBEDDINGGEMMA_PREFIX384_V1,
  modelVersion: '2026-07-21',
  modelRevision: EMBEDDINGGEMMA_PREFIX384_V1,
  sourceDimension: SEMANTIC_DIMENSION,
  outputDimension: 384,
  dimension: 384,
  normalization: 'l2',
  metric: 'cosine',
  vectorPurpose: 'content-semantic',
  truncation: 'legacy_direct_slice',
  projectionKind: 'direct_slice',
  encoderFamily: 'embeddinggemma',
  queryEncoderRole: 'QUERY',
  candidateEncoderRole: 'DOCUMENT',
  representationFamily: 'legacy_384',
  renormalizeAfterProjection: false,
  queryCompatible: false,
  canonical: false,
};

export const EMBEDDINGGEMMA_PREFIX384_SNAPSHOT = {
  contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
  dimension: 384,
  sourceTable: 'atlas_packets',
  embeddingColumn: 'content_embedding_384',
  identityColumns: ['packet_key', 'source_ref'] as const,
} as const;

function createMrlContract(outputDimension: 512 | 256 | 128): EmbeddingGemmaProjectionContract {
  const representation = `semantic_mrl_${outputDimension}` as const;
  return {
    modelId: representation,
    modelVersion: '2026-07-21',
    modelRevision: EMBEDDINGGEMMA_FULL768_V1,
    sourceDimension: SEMANTIC_DIMENSION,
    outputDimension,
    dimension: outputDimension,
    normalization: 'l2',
    metric: 'cosine',
    vectorPurpose: 'content-semantic',
    truncation: 'mrl_prefix',
    projectionKind: 'mrl_prefix',
    encoderFamily: 'embeddinggemma',
    queryEncoderRole: 'QUERY',
    candidateEncoderRole: 'DOCUMENT',
    representationFamily: 'semantic_mrl',
    renormalizeAfterProjection: true,
    queryCompatible: true,
    canonical: false,
  };
}

export const EMBEDDINGGEMMA_MRL512_CONTRACT = createMrlContract(512);
export const EMBEDDINGGEMMA_MRL256_CONTRACT = createMrlContract(256);
export const EMBEDDINGGEMMA_MRL128_CONTRACT = createMrlContract(128);

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

  if (contract.truncation === 'mrl_prefix' || contract.truncation === 'legacy_direct_slice') {
    if (vector.length < contract.outputDimension) {
      throw new Error(
        `Derived embedding too short for ${contract.modelId}: expected at least ${contract.outputDimension}, got ${vector.length}`
      );
    }
    const projected = vector.slice(0, contract.outputDimension).map(Number);
    if (!contract.renormalizeAfterProjection) return projected;
    const norm = Math.sqrt(projected.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error(`Cannot renormalize zero embedding for ${contract.modelId}`);
    }
    return projected.map((value) => value / norm);
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
