import { createHash } from 'node:crypto';
import {
  REPAIR_FEATURE_PRESENCE_STATES,
  REPAIR_OVERLAY_FEATURE_NAMES,
  type RepairFeaturePresenceState,
  type RepairOverlayFeatureName,
  type RepairOverlayFeatureStatesV1,
  type RepairOverlayRowInputV1,
} from './repair-candidate-feature-matrix-v1.js';

export const REPAIR_FEATURE_PRODUCER_ARTIFACT_SCHEMA =
  'atlas.repair-feature-producer-artifact.v1' as const;
export const REPAIR_FEATURE_PRODUCER_SET_SCHEMA =
  'atlas.repair-feature-producer-set.v1' as const;

export type RepairFeatureProducerStateV1 = Exclude<RepairFeaturePresenceState, 'UNAVAILABLE'>;

export type RepairFeatureDerivationV1 =
  | 'OBSERVED_SCALAR'
  | 'MRL_PREFIX_L2_RENORMALIZE'
  | 'NESTED_AUTOENCODER_QUERY_PROJECTION'
  | 'GRAPH_DERIVED'
  | 'STRUCTURAL_DERIVED'
  | 'TOPOLOGY_DERIVED'
  | 'OTHER_DERIVED';

export interface RepairFeatureProducerRowV1 {
  candidateOrdinal: number;
  value: number;
  inputRowChecksum?: string | null;
}

export interface BuildRepairFeatureProducerArtifactInputV1 {
  featureName: RepairOverlayFeatureName;
  state: RepairFeatureProducerStateV1;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidateRowCount: number;
  producerId: string;
  producerRevision: string;
  derivation: RepairFeatureDerivationV1;
  inputChecksum: string;
  representationId?: string | null;
  representationRevision?: string | null;
  sourceRepresentationId?: string | null;
  sourceRepresentationRevision?: string | null;
  rows: readonly RepairFeatureProducerRowV1[];
}

export interface RepairFeatureProducerArtifactV1
  extends BuildRepairFeatureProducerArtifactInputV1 {
  schema: typeof REPAIR_FEATURE_PRODUCER_ARTIFACT_SCHEMA;
  rows: readonly RepairFeatureProducerRowV1[];
  rowOrdinalChecksum: string;
  outputChecksum: string;
  artifactChecksum: string;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
  mutationAuthority: false;
}

export interface RepairFeatureProducerSummaryV1 {
  featureName: RepairOverlayFeatureName;
  state: RepairFeatureProducerStateV1;
  producerId: string;
  producerRevision: string;
  derivation: RepairFeatureDerivationV1;
  representationId: string | null;
  representationRevision: string | null;
  sourceRepresentationId: string | null;
  sourceRepresentationRevision: string | null;
  inputChecksum: string;
  outputChecksum: string;
  artifactChecksum: string;
  rowCount: number;
}

export interface RepairFeatureProducerSetV1 {
  schema: typeof REPAIR_FEATURE_PRODUCER_SET_SCHEMA;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidateRowCount: number;
  producerCount: number;
  producers: readonly RepairFeatureProducerSummaryV1[];
  overlayRows: readonly RepairOverlayRowInputV1[];
  overlayFeatureStates: RepairOverlayFeatureStatesV1;
  producerSetChecksum: string;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
  mutationAuthority: false;
}

function stable(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(',')}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function assertSha256(value: string, code: string): void {
  if (!/^sha256:[0-9a-f]{64}$/i.test(value)) throw new Error(code);
}

function validateArtifactShape(artifact: RepairFeatureProducerArtifactV1): void {
  if (artifact.schema !== REPAIR_FEATURE_PRODUCER_ARTIFACT_SCHEMA) {
    throw new Error('REPAIR_FEATURE_ARTIFACT_SCHEMA_INVALID');
  }
  if (!REPAIR_OVERLAY_FEATURE_NAMES.includes(artifact.featureName)) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_FEATURE_INVALID:${artifact.featureName}`);
  }
  if (
    !REPAIR_FEATURE_PRESENCE_STATES.includes(artifact.state) ||
    artifact.state === 'UNAVAILABLE'
  ) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_STATE_INVALID:${artifact.featureName}`);
  }
  assertSha256(
    artifact.candidateSnapshotRevision,
    `REPAIR_FEATURE_ARTIFACT_CANDIDATE_SNAPSHOT_INVALID:${artifact.featureName}`,
  );
  assertSha256(
    artifact.ordinalMapChecksum,
    `REPAIR_FEATURE_ARTIFACT_ORDINAL_MAP_INVALID:${artifact.featureName}`,
  );
  assertSha256(
    artifact.inputChecksum,
    `REPAIR_FEATURE_ARTIFACT_INPUT_CHECKSUM_INVALID:${artifact.featureName}`,
  );
  assertSha256(
    artifact.outputChecksum,
    `REPAIR_FEATURE_ARTIFACT_OUTPUT_CHECKSUM_INVALID:${artifact.featureName}`,
  );
  assertSha256(
    artifact.artifactChecksum,
    `REPAIR_FEATURE_ARTIFACT_CHECKSUM_INVALID:${artifact.featureName}`,
  );
  if (!Number.isInteger(artifact.candidateRowCount) || artifact.candidateRowCount <= 0) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_ROW_COUNT_INVALID:${artifact.featureName}`);
  }
  if (!artifact.producerId.trim() || !artifact.producerRevision.trim()) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_PRODUCER_INVALID:${artifact.featureName}`);
  }

  const ordinals = artifact.rows.map((row) => row.candidateOrdinal);
  if (new Set(ordinals).size !== ordinals.length) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_DUPLICATE_ORDINAL:${artifact.featureName}`);
  }
  for (const row of artifact.rows) {
    if (
      !Number.isInteger(row.candidateOrdinal) ||
      row.candidateOrdinal < 0 ||
      row.candidateOrdinal >= artifact.candidateRowCount
    ) {
      throw new Error(
        `REPAIR_FEATURE_ARTIFACT_ORDINAL_OUT_OF_RANGE:${artifact.featureName}:${row.candidateOrdinal}`,
      );
    }
    if (!Number.isFinite(row.value)) {
      throw new Error(
        `REPAIR_FEATURE_ARTIFACT_VALUE_NON_FINITE:${artifact.featureName}:${row.candidateOrdinal}`,
      );
    }
    if (row.inputRowChecksum != null) {
      assertSha256(
        row.inputRowChecksum,
        `REPAIR_FEATURE_ARTIFACT_ROW_INPUT_CHECKSUM_INVALID:${artifact.featureName}:${row.candidateOrdinal}`,
      );
    }
  }

  if (
    (artifact.state === 'PROVEN' || artifact.state === 'DERIVED') &&
    artifact.rows.length !== artifact.candidateRowCount
  ) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_COMPLETE_STATE_INCOMPLETE:${artifact.featureName}`);
  }
  if (
    artifact.state === 'PARTIAL' &&
    (artifact.rows.length === 0 || artifact.rows.length === artifact.candidateRowCount)
  ) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_PARTIAL_STATE_NOT_PARTIAL:${artifact.featureName}`);
  }

  const sortedRows = [...artifact.rows].sort(
    (a, b) => a.candidateOrdinal - b.candidateOrdinal,
  );
  const expectedOrdinalChecksum = digest(sortedRows.map((row) => row.candidateOrdinal));
  if (artifact.rowOrdinalChecksum !== expectedOrdinalChecksum) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_ORDINAL_CHECKSUM_MISMATCH:${artifact.featureName}`);
  }

  const expectedOutputChecksum = digest(
    sortedRows.map((row) => ({
      candidateOrdinal: row.candidateOrdinal,
      value: row.value,
      inputRowChecksum: row.inputRowChecksum ?? null,
    })),
  );
  if (artifact.outputChecksum !== expectedOutputChecksum) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_OUTPUT_CHECKSUM_MISMATCH:${artifact.featureName}`);
  }

  const body = {
    schema: artifact.schema,
    featureName: artifact.featureName,
    state: artifact.state,
    candidateSnapshotRevision: artifact.candidateSnapshotRevision,
    ordinalMapChecksum: artifact.ordinalMapChecksum,
    candidateRowCount: artifact.candidateRowCount,
    producerId: artifact.producerId,
    producerRevision: artifact.producerRevision,
    derivation: artifact.derivation,
    inputChecksum: artifact.inputChecksum,
    representationId: artifact.representationId ?? null,
    representationRevision: artifact.representationRevision ?? null,
    sourceRepresentationId: artifact.sourceRepresentationId ?? null,
    sourceRepresentationRevision: artifact.sourceRepresentationRevision ?? null,
    rows: sortedRows,
    rowOrdinalChecksum: artifact.rowOrdinalChecksum,
    outputChecksum: artifact.outputChecksum,
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };
  if (artifact.artifactChecksum !== digest(body)) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_CHECKSUM_MISMATCH:${artifact.featureName}`);
  }
}

export function buildRepairFeatureProducerArtifactV1(
  input: BuildRepairFeatureProducerArtifactInputV1,
): RepairFeatureProducerArtifactV1 {
  if (!REPAIR_OVERLAY_FEATURE_NAMES.includes(input.featureName)) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_FEATURE_INVALID:${input.featureName}`);
  }
  if (input.state === 'UNAVAILABLE') {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_STATE_INVALID:${input.featureName}`);
  }
  assertSha256(
    input.candidateSnapshotRevision,
    `REPAIR_FEATURE_ARTIFACT_CANDIDATE_SNAPSHOT_INVALID:${input.featureName}`,
  );
  assertSha256(
    input.ordinalMapChecksum,
    `REPAIR_FEATURE_ARTIFACT_ORDINAL_MAP_INVALID:${input.featureName}`,
  );
  assertSha256(
    input.inputChecksum,
    `REPAIR_FEATURE_ARTIFACT_INPUT_CHECKSUM_INVALID:${input.featureName}`,
  );
  if (!Number.isInteger(input.candidateRowCount) || input.candidateRowCount <= 0) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_ROW_COUNT_INVALID:${input.featureName}`);
  }
  if (!input.producerId.trim() || !input.producerRevision.trim()) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_PRODUCER_INVALID:${input.featureName}`);
  }

  const rows = [...input.rows]
    .map((row) => ({ ...row, inputRowChecksum: row.inputRowChecksum ?? null }))
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  const ordinals = rows.map((row) => row.candidateOrdinal);
  if (new Set(ordinals).size !== ordinals.length) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_DUPLICATE_ORDINAL:${input.featureName}`);
  }
  for (const row of rows) {
    if (
      !Number.isInteger(row.candidateOrdinal) ||
      row.candidateOrdinal < 0 ||
      row.candidateOrdinal >= input.candidateRowCount
    ) {
      throw new Error(
        `REPAIR_FEATURE_ARTIFACT_ORDINAL_OUT_OF_RANGE:${input.featureName}:${row.candidateOrdinal}`,
      );
    }
    if (!Number.isFinite(row.value)) {
      throw new Error(
        `REPAIR_FEATURE_ARTIFACT_VALUE_NON_FINITE:${input.featureName}:${row.candidateOrdinal}`,
      );
    }
    if (row.inputRowChecksum != null) {
      assertSha256(
        row.inputRowChecksum,
        `REPAIR_FEATURE_ARTIFACT_ROW_INPUT_CHECKSUM_INVALID:${input.featureName}:${row.candidateOrdinal}`,
      );
    }
  }

  if (
    (input.state === 'PROVEN' || input.state === 'DERIVED') &&
    rows.length !== input.candidateRowCount
  ) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_COMPLETE_STATE_INCOMPLETE:${input.featureName}`);
  }
  if (
    input.state === 'PARTIAL' &&
    (rows.length === 0 || rows.length === input.candidateRowCount)
  ) {
    throw new Error(`REPAIR_FEATURE_ARTIFACT_PARTIAL_STATE_NOT_PARTIAL:${input.featureName}`);
  }

  const rowOrdinalChecksum = digest(ordinals);
  const outputChecksum = digest(
    rows.map((row) => ({
      candidateOrdinal: row.candidateOrdinal,
      value: row.value,
      inputRowChecksum: row.inputRowChecksum ?? null,
    })),
  );
  const body = {
    schema: REPAIR_FEATURE_PRODUCER_ARTIFACT_SCHEMA,
    featureName: input.featureName,
    state: input.state,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    candidateRowCount: input.candidateRowCount,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    derivation: input.derivation,
    inputChecksum: input.inputChecksum,
    representationId: input.representationId ?? null,
    representationRevision: input.representationRevision ?? null,
    sourceRepresentationId: input.sourceRepresentationId ?? null,
    sourceRepresentationRevision: input.sourceRepresentationRevision ?? null,
    rows,
    rowOrdinalChecksum,
    outputChecksum,
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };
  const artifact: RepairFeatureProducerArtifactV1 = {
    ...body,
    artifactChecksum: digest(body),
  };
  validateArtifactShape(artifact);
  return artifact;
}

export function buildRepairFeatureProducerSetV1(input: {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidateRowCount: number;
  artifacts: readonly RepairFeatureProducerArtifactV1[];
}): RepairFeatureProducerSetV1 {
  assertSha256(input.candidateSnapshotRevision, 'REPAIR_FEATURE_SET_CANDIDATE_SNAPSHOT_INVALID');
  assertSha256(input.ordinalMapChecksum, 'REPAIR_FEATURE_SET_ORDINAL_MAP_INVALID');
  if (!Number.isInteger(input.candidateRowCount) || input.candidateRowCount <= 0) {
    throw new Error('REPAIR_FEATURE_SET_ROW_COUNT_INVALID');
  }
  if (input.artifacts.length === 0) throw new Error('REPAIR_FEATURE_SET_EMPTY');

  const states = Object.fromEntries(
    REPAIR_OVERLAY_FEATURE_NAMES.map((name) => [name, 'UNAVAILABLE']),
  ) as RepairOverlayFeatureStatesV1;
  const valuesByOrdinal = new Map<
    number,
    Partial<Record<RepairOverlayFeatureName, number>>
  >();
  const seenFeatures = new Set<RepairOverlayFeatureName>();
  const summaries: RepairFeatureProducerSummaryV1[] = [];

  for (const artifact of input.artifacts) {
    validateArtifactShape(artifact);
    if (artifact.candidateSnapshotRevision !== input.candidateSnapshotRevision) {
      throw new Error(`REPAIR_FEATURE_SET_CANDIDATE_SNAPSHOT_MISMATCH:${artifact.featureName}`);
    }
    if (artifact.ordinalMapChecksum !== input.ordinalMapChecksum) {
      throw new Error(`REPAIR_FEATURE_SET_ORDINAL_MAP_MISMATCH:${artifact.featureName}`);
    }
    if (artifact.candidateRowCount !== input.candidateRowCount) {
      throw new Error(`REPAIR_FEATURE_SET_ROW_COUNT_MISMATCH:${artifact.featureName}`);
    }
    if (seenFeatures.has(artifact.featureName)) {
      throw new Error(`REPAIR_FEATURE_SET_DUPLICATE_FEATURE:${artifact.featureName}`);
    }
    seenFeatures.add(artifact.featureName);
    states[artifact.featureName] = artifact.state;

    for (const row of artifact.rows) {
      const values = valuesByOrdinal.get(row.candidateOrdinal) ?? {};
      values[artifact.featureName] = row.value;
      valuesByOrdinal.set(row.candidateOrdinal, values);
    }

    summaries.push({
      featureName: artifact.featureName,
      state: artifact.state,
      producerId: artifact.producerId,
      producerRevision: artifact.producerRevision,
      derivation: artifact.derivation,
      representationId: artifact.representationId ?? null,
      representationRevision: artifact.representationRevision ?? null,
      sourceRepresentationId: artifact.sourceRepresentationId ?? null,
      sourceRepresentationRevision: artifact.sourceRepresentationRevision ?? null,
      inputChecksum: artifact.inputChecksum,
      outputChecksum: artifact.outputChecksum,
      artifactChecksum: artifact.artifactChecksum,
      rowCount: artifact.rows.length,
    });
  }

  summaries.sort((a, b) => a.featureName.localeCompare(b.featureName));
  const overlayRows: RepairOverlayRowInputV1[] = [...valuesByOrdinal.entries()]
    .sort(([a], [b]) => a - b)
    .map(([candidateOrdinal, values]) => ({ candidateOrdinal, values }));

  const body = {
    schema: REPAIR_FEATURE_PRODUCER_SET_SCHEMA,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    candidateRowCount: input.candidateRowCount,
    producerCount: summaries.length,
    producers: summaries,
    overlayRows,
    overlayFeatureStates: states,
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };

  return {
    ...body,
    producerSetChecksum: digest(body),
  };
}
