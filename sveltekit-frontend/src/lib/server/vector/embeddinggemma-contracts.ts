import type { VectorContract } from '$lib/server/embedding/knn-helper.js';
import { SEMANTIC_DIMENSION } from '$lib/server/embedding/embedding-contract-768.js';

/**
 * Canonical EmbeddingGemma representation contracts.
 *
 * Model-native semantic authority is 768 dimensions. EmbeddingGemma's trained
 * Matryoshka representation widths are 512, 256, and 128, each derived from
 * semantic_768 by prefix truncation followed by L2 renormalization.
 *
 * 384 is NOT an EmbeddingGemma MRL width. The 384 contract retained below is
 * an Atlas historical direct-slice representation for migration/replay only.
 * It is never query-compatible and never canonical.
 */
export const EMBEDDINGGEMMA_FULL768_V1 = 'embeddinggemma-full768-v1' as const;
export const ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1 =
  'atlas-embeddinggemma-direct-slice384-v1' as const;

export const EMBEDDINGGEMMA_MRL_DIMENSIONS = [512, 256, 128] as const;
export type EmbeddingGemmaMrlDimension = (typeof EMBEDDINGGEMMA_MRL_DIMENSIONS)[number];

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
  lifecycle: 'ACTIVE' | 'REFERENCE_ONLY' | 'LEGACY_MIGRATION_ONLY';
}

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
  lifecycle: 'ACTIVE',
};

function createMrlContract(outputDimension: EmbeddingGemmaMrlDimension): EmbeddingGemmaProjectionContract {
  const representation = `semantic_mrl_${outputDimension}`;
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
    lifecycle: 'REFERENCE_ONLY',
  };
}

export const EMBEDDINGGEMMA_MRL512_CONTRACT = createMrlContract(512);
export const EMBEDDINGGEMMA_MRL256_CONTRACT = createMrlContract(256);
export const EMBEDDINGGEMMA_MRL128_CONTRACT = createMrlContract(128);

/**
 * Historical Atlas 768->384 direct slice. This is not EmbeddingGemma MRL.
 * Kept only so frozen snapshots and migration reports remain decodable.
 */
export const EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT: EmbeddingGemmaProjectionContract = {
  modelId: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
  modelVersion: '2026-07-21',
  modelRevision: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
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
  lifecycle: 'LEGACY_MIGRATION_ONLY',
};

export const EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_SNAPSHOT = {
  contractVersion: ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
  dimension: 384,
  sourceTable: 'atlas_packets',
  embeddingColumn: 'content_embedding_384',
  identityColumns: ['packet_key', 'source_ref'] as const,
  lifecycle: 'LEGACY_MIGRATION_ONLY',
} as const;

function assertFiniteVector(vector: readonly number[], label: string): void {
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) {
      throw new Error(`${label}: non-finite value at ${index}`);
    }
  }
}

function l2Renormalize(vector: readonly number[], label: string): number[] {
  assertFiniteVector(vector, label);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) throw new Error(`${label}: zero or invalid norm`);
  return vector.map((value) => value / norm);
}

/**
 * Runtime-safe projection helper. Canonical/native and official MRL contracts
 * are accepted. Legacy 384 direct slicing is deliberately rejected here so a
 * normal retrieval caller cannot accidentally recreate the retired lane.
 */
export function projectEmbeddingForContract(
  vector: readonly number[],
  contract: EmbeddingGemmaProjectionContract,
): number[] {
  if (!Array.isArray(vector)) throw new Error(`Expected embedding array for ${contract.modelId}`);
  if (vector.length !== SEMANTIC_DIMENSION) {
    throw new Error(
      `EmbeddingGemma source mismatch for ${contract.modelId}: expected ${SEMANTIC_DIMENSION}, got ${vector.length}`,
    );
  }

  if (contract.lifecycle === 'LEGACY_MIGRATION_ONLY' || contract.truncation === 'legacy_direct_slice') {
    throw new Error('LEGACY_384_PROJECTION_REQUIRES_EXPLICIT_MIGRATION_HELPER');
  }

  if (contract.truncation === 'none') return Array.from(vector);

  if (contract.truncation === 'mrl_prefix') {
    if (!(EMBEDDINGGEMMA_MRL_DIMENSIONS as readonly number[]).includes(contract.outputDimension)) {
      throw new Error(`UNSUPPORTED_EMBEDDINGGEMMA_MRL_DIMENSION: ${contract.outputDimension}`);
    }
    return l2Renormalize(
      vector.slice(0, contract.outputDimension).map(Number),
      `semantic_mrl_${contract.outputDimension}`,
    );
  }

  throw new Error(`UNSUPPORTED_EMBEDDINGGEMMA_PROJECTION: ${contract.projectionKind}`);
}

/**
 * Explicit legacy-only helper for deterministic replay/migration tools.
 * Never import this into retrieval, ACE, ranking, cache, or online ingestion.
 */
export function projectLegacyDirectSlice384ForMigration(vector: readonly number[]): number[] {
  if (!Array.isArray(vector) || vector.length !== SEMANTIC_DIMENSION) {
    throw new Error(`LEGACY_384_SOURCE_DIMENSION_MISMATCH: expected ${SEMANTIC_DIMENSION}, got ${vector?.length ?? 0}`);
  }
  assertFiniteVector(vector, 'legacy_384');
  return vector.slice(0, 384).map(Number);
}
