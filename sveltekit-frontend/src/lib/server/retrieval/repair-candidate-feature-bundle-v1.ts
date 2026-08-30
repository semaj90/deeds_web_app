import { createHash } from 'node:crypto';
import { buildRepairCandidateFeatureMatrixV1, type BuildRepairCandidateFeatureMatrixInputV1, type RepairCandidateFeatureMatrixV1 } from './repair-candidate-feature-matrix-v1.js';
import type { RepairFeatureProducerSetV1 } from './repair-feature-producer-v1.js';

export const REPAIR_CANDIDATE_FEATURE_BUNDLE_SCHEMA = 'atlas.repair-candidate-feature-bundle.v1' as const;

export interface RepairCandidateFeatureBundleV1 {
  schema: typeof REPAIR_CANDIDATE_FEATURE_BUNDLE_SCHEMA;
  matrix: RepairCandidateFeatureMatrixV1;
  producerSet: RepairFeatureProducerSetV1;
  producerSetChecksum: string;
  bundleChecksum: string;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
  mutationAuthority: false;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function verifyProducerSetChecksum(producerSet: RepairFeatureProducerSetV1): void {
  if (!/^sha256:[0-9a-f]{64}$/i.test(producerSet.producerSetChecksum)) {
    throw new Error('REPAIR_BUNDLE_PRODUCER_SET_CHECKSUM_INVALID');
  }
  if (producerSet.producerCount !== producerSet.producers.length) {
    throw new Error('REPAIR_BUNDLE_PRODUCER_SET_COUNT_MISMATCH');
  }
  const body = {
    schema: producerSet.schema,
    candidateSnapshotRevision: producerSet.candidateSnapshotRevision,
    ordinalMapChecksum: producerSet.ordinalMapChecksum,
    candidateRowCount: producerSet.candidateRowCount,
    producerCount: producerSet.producerCount,
    producers: producerSet.producers,
    overlayRows: producerSet.overlayRows,
    overlayFeatureStates: producerSet.overlayFeatureStates,
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };
  if (digest(body) !== producerSet.producerSetChecksum) {
    throw new Error('REPAIR_BUNDLE_PRODUCER_SET_CHECKSUM_MISMATCH');
  }
}

export function buildRepairCandidateFeatureBundleV1(input: {
  matrixInput: Omit<BuildRepairCandidateFeatureMatrixInputV1, 'overlayRows' | 'overlayFeatureStates'>;
  producerSet: RepairFeatureProducerSetV1;
}): RepairCandidateFeatureBundleV1 {
  const { matrixInput, producerSet } = input;
  verifyProducerSetChecksum(producerSet);
  if (producerSet.candidateSnapshotRevision !== matrixInput.candidateSnapshotRevision) throw new Error('REPAIR_BUNDLE_CANDIDATE_SNAPSHOT_MISMATCH');
  if (producerSet.ordinalMapChecksum !== matrixInput.ordinalMapChecksum) throw new Error('REPAIR_BUNDLE_ORDINAL_MAP_MISMATCH');
  if (producerSet.candidateRowCount !== matrixInput.identities.length) throw new Error('REPAIR_BUNDLE_ROW_COUNT_MISMATCH');

  const matrix = buildRepairCandidateFeatureMatrixV1({
    ...matrixInput,
    overlayRows: producerSet.overlayRows,
    overlayFeatureStates: producerSet.overlayFeatureStates,
  });

  const body = {
    schema: REPAIR_CANDIDATE_FEATURE_BUNDLE_SCHEMA,
    matrixManifestChecksum: matrix.manifestChecksum,
    producerSetChecksum: producerSet.producerSetChecksum,
    candidateSnapshotRevision: matrix.candidateSnapshotRevision,
    ordinalMapChecksum: matrix.ordinalMapChecksum,
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };

  return {
    schema: REPAIR_CANDIDATE_FEATURE_BUNDLE_SCHEMA,
    matrix,
    producerSet,
    producerSetChecksum: producerSet.producerSetChecksum,
    bundleChecksum: digest(body),
    canonicalAuthority: false,
    retrievalVote: false,
    rankingPromotion: false,
    mutationAuthority: false,
  };
}
