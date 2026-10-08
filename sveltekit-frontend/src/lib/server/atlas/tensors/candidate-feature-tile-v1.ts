import { createHash } from 'node:crypto';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import type {
  CandidateFeatureIdentityV1,
  CandidateFeatureMatrixAdapterV1,
} from '../../retrieval/candidate-feature-matrix-adapter-v1.js';

export const CANDIDATE_FEATURE_TILE_V1_SCHEMA = 'atlas.candidate-feature-tile.v1' as const;
export const CANDIDATE_FEATURE_TILE_MAX_ROWS = 32;
export const CANDIDATE_FEATURE_TILE_COLUMNS = 16;

export interface CandidateFeatureTileV1 {
  schema: typeof CANDIDATE_FEATURE_TILE_V1_SCHEMA;
  shape: readonly [number, typeof CANDIDATE_FEATURE_TILE_COLUMNS];
  featureNames: readonly string[];
  candidateOrdinals: readonly number[];
  identities: readonly CandidateFeatureIdentityV1[];
  featureValues: Float32Array;
  presenceMask: Uint8Array;
  featureRevision: string;
  workspaceRevision: string;
  sourceMatrixChecksum: string;
  featureCrosswalkChecksum: string;
  tileChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
  rankingPromotion: false;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function matrixChecksum(adapter: CandidateFeatureMatrixAdapterV1): string {
  return sha256({
    candidatePacketKeys: Array.from(adapter.matrix.candidate_packet_keys),
    candidateFeatures: Array.from(adapter.matrix.candidate_features),
    presenceMask: Array.from(adapter.matrix.presence_mask),
    featureCount: adapter.matrix.feature_count,
    identityChecksum: adapter.identityChecksum,
    featureRevision: adapter.featureRevision,
  });
}

export function buildCandidateFeatureTileV1(input: {
  adapter: CandidateFeatureMatrixAdapterV1;
  candidateOrdinals: readonly number[];
  featureNames: readonly string[];
}): CandidateFeatureTileV1 {
  const { adapter } = input;
  const { matrix } = adapter;
  const rowCount = input.candidateOrdinals.length;
  const featureCount = CANDIDATE_FEATURE_NAMES.length;

  if (rowCount < 1 || rowCount > CANDIDATE_FEATURE_TILE_MAX_ROWS) {
    throw new Error('CANDIDATE_FEATURE_TILE_ROW_COUNT_OUT_OF_RANGE');
  }
  if (input.featureNames.length !== CANDIDATE_FEATURE_TILE_COLUMNS) {
    throw new Error('CANDIDATE_FEATURE_TILE_FEATURE_COUNT_MISMATCH');
  }
  if (new Set(input.featureNames).size !== input.featureNames.length) {
    throw new Error('CANDIDATE_FEATURE_TILE_DUPLICATE_FEATURE');
  }
  const featureIndexes = input.featureNames.map((name) => {
    const index = (CANDIDATE_FEATURE_NAMES as readonly string[]).indexOf(name);
    if (index < 0) throw new Error(`CANDIDATE_FEATURE_TILE_UNKNOWN_FEATURE:${name}`);
    return index;
  });
  if (matrix.feature_count !== featureCount || matrix.candidate_count !== adapter.identities.length ||
      matrix.candidate_packet_keys.length !== matrix.candidate_count ||
      matrix.candidate_features.length !== matrix.candidate_count * featureCount ||
      matrix.presence_mask.length !== matrix.candidate_count * featureCount) {
    throw new Error('CANDIDATE_FEATURE_TILE_SOURCE_MATRIX_SHAPE_INVALID');
  }
  if (new Set(adapter.identities.map((identity) => identity.packetKey)).size !== adapter.identities.length) {
    throw new Error('CANDIDATE_FEATURE_TILE_SOURCE_IDENTITY_DUPLICATE');
  }
  if (adapter.identities.some((identity, index) => identity.candidateOrdinal !== index ||
      identity.packetKey !== matrix.candidate_packet_keys[index])) {
    throw new Error('CANDIDATE_FEATURE_TILE_SOURCE_ORDINAL_BINDING_INVALID');
  }

  const ordinals = [...input.candidateOrdinals];
  if (new Set(ordinals).size !== ordinals.length) {
    throw new Error('CANDIDATE_FEATURE_TILE_DUPLICATE_ORDINAL');
  }
  if (ordinals.some((ordinal, index) => !Number.isSafeInteger(ordinal) || ordinal < 0 ||
      ordinal >= matrix.candidate_count || (index > 0 && ordinal <= ordinals[index - 1]!))) {
    throw new Error('CANDIDATE_FEATURE_TILE_ORDINALS_MUST_BE_VALID_ASCENDING');
  }

  const identities = ordinals.map((ordinal) => adapter.identities[ordinal]!);
  const workspaceRevision = identities[0]!.workspaceRevision;
  if (!workspaceRevision || identities.some((identity) => !identity.sourceRevision ||
      !identity.sourceRef || identity.workspaceRevision !== workspaceRevision)) {
    throw new Error('CANDIDATE_FEATURE_TILE_IDENTITY_REVISION_MISSING_OR_MIXED');
  }
  if (!adapter.featureRevision || !adapter.matrixChecksum || !adapter.identityChecksum) {
    throw new Error('CANDIDATE_FEATURE_TILE_SOURCE_REVISION_OR_CHECKSUM_MISSING');
  }

  const featureValues = new Float32Array(rowCount * CANDIDATE_FEATURE_TILE_COLUMNS);
  const presenceMask = new Uint8Array(featureValues.length);
  for (let tileRow = 0; tileRow < rowCount; tileRow++) {
    const sourceRow = ordinals[tileRow]!;
    for (let tileColumn = 0; tileColumn < CANDIDATE_FEATURE_TILE_COLUMNS; tileColumn++) {
      const sourceIndex = sourceRow * featureCount + featureIndexes[tileColumn]!;
      const tileIndex = tileRow * CANDIDATE_FEATURE_TILE_COLUMNS + tileColumn;
      const value = matrix.candidate_features[sourceIndex]!;
      const present = matrix.presence_mask[sourceIndex]!;
      if (!Number.isFinite(value) || (present !== 0 && present !== 1)) {
        throw new Error(`CANDIDATE_FEATURE_TILE_SOURCE_CELL_INVALID:${sourceRow}:${featureIndexes[tileColumn]}`);
      }
      featureValues[tileIndex] = value;
      presenceMask[tileIndex] = present;
    }
  }

  const featureCrosswalkChecksum = sha256({
    featureRevision: adapter.featureRevision,
    orderedFeatureNames: [...input.featureNames],
    canonicalFeatureNames: [...CANDIDATE_FEATURE_NAMES],
  });
  const sourceMatrixChecksum = matrixChecksum(adapter);
  const tileChecksum = sha256({
    schema: CANDIDATE_FEATURE_TILE_V1_SCHEMA,
    shape: [rowCount, CANDIDATE_FEATURE_TILE_COLUMNS],
    featureNames: [...input.featureNames],
    candidateOrdinals: ordinals,
    identities,
    featureValues: Array.from(featureValues),
    presenceMask: Array.from(presenceMask),
    featureRevision: adapter.featureRevision,
    workspaceRevision,
    sourceMatrixChecksum,
    featureCrosswalkChecksum,
  });

  return {
    schema: CANDIDATE_FEATURE_TILE_V1_SCHEMA,
    shape: [rowCount, CANDIDATE_FEATURE_TILE_COLUMNS],
    featureNames: [...input.featureNames],
    candidateOrdinals: ordinals,
    identities,
    featureValues,
    presenceMask,
    featureRevision: adapter.featureRevision,
    workspaceRevision,
    sourceMatrixChecksum,
    featureCrosswalkChecksum,
    tileChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
    rankingPromotion: false,
  };
}
