import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';
import {
  candidateOrdinalSelectionV1Schema,
  verifyCandidateOrdinalSelectionV1,
  type CandidateOrdinalSelectionV1,
} from './candidate-ordinal-selection-v1.js';
import {
  CandidateFeatureRowV1Schema,
  type CandidateFeatureRowV1,
} from './candidate-feature-row-v1.js';

export const CANDIDATE_FEATURE_SELECTION_SNAPSHOT_V1 =
  'atlas.candidate-feature-selection-snapshot.v1' as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`)
    .join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export const candidateFeatureSelectionSnapshotV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_SELECTION_SNAPSHOT_V1),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  selectionChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  featureRevision: z.string().min(1),
  rowCount: z.number().int().positive(),
  rows: z.array(CandidateFeatureRowV1Schema).min(1),
  snapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();

export type CandidateFeatureSelectionSnapshotV1 = z.infer<
  typeof candidateFeatureSelectionSnapshotV1Schema
>;

function assertRowIdentity(row: CandidateFeatureRowV1, map: CandidateOrdinalMapV1): void {
  const candidate = map.candidates[row.candidateOrdinal];
  if (!candidate) throw new Error(`FEATURE_SELECTION_ROW_ORDINAL_NOT_IN_MAP:${row.candidateOrdinal}`);
  const pairs: Array<[string, unknown, unknown]> = [
    ['canonicalId', row.canonicalId, candidate.canonicalId],
    ['packetKey', row.packetKey, candidate.packetKey],
    ['treeNodeId', row.treeNodeId, candidate.treeNodeId],
    ['symbolVersionId', row.symbolVersionId, candidate.symbolVersionId],
    ['workspaceRevision', row.workspaceRevision, candidate.workspaceRevision],
    ['sourceRevision', row.sourceRevision, candidate.sourceRevision],
    ['graphRevision', row.graphRevision, candidate.graphRevision],
    ['semanticRevision', row.semanticRevision, candidate.semanticRevision],
    ['degradedIdentity', row.degradedIdentity, candidate.degradedIdentity],
  ];
  for (const [field, actual, expected] of pairs) {
    if (actual !== expected) {
      throw new Error(`FEATURE_SELECTION_ROW_IDENTITY_REVISION_MISMATCH:${row.candidateOrdinal}:${field}`);
    }
  }
}

export function materializeCandidateFeatureSelectionSnapshotV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  selection: CandidateOrdinalSelectionV1;
  rows: readonly CandidateFeatureRowV1[];
  featureRevision: string;
  producerRevision: string;
}): CandidateFeatureSelectionSnapshotV1 {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const selection = candidateOrdinalSelectionV1Schema.parse(input.selection);
  verifyCandidateOrdinalSelectionV1({ ordinalMap: map, selection });

  const rows = input.rows.map((row) => CandidateFeatureRowV1Schema.parse(row));
  if (rows.length !== selection.selectedOrdinals.length) {
    throw new Error(`FEATURE_SELECTION_ROW_COUNT_MISMATCH:${rows.length}:${selection.selectedOrdinals.length}`);
  }

  const rowsByOrdinal = new Map<number, CandidateFeatureRowV1>();
  for (const row of rows) {
    if (!selection.selectedOrdinals.includes(row.candidateOrdinal)) {
      throw new Error(`FEATURE_SELECTION_ROW_NOT_SELECTED:${row.candidateOrdinal}`);
    }
    if (rowsByOrdinal.has(row.candidateOrdinal)) {
      throw new Error(`FEATURE_SELECTION_DUPLICATE_ORDINAL:${row.candidateOrdinal}`);
    }
    if (row.featureRevision !== input.featureRevision) {
      throw new Error(`FEATURE_SELECTION_FEATURE_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }
    assertRowIdentity(row, map);
    rowsByOrdinal.set(row.candidateOrdinal, row);
  }

  const orderedRows = selection.selectedOrdinals.map((ordinal) => {
    const row = rowsByOrdinal.get(ordinal);
    if (!row) throw new Error(`FEATURE_SELECTION_MISSING_ORDINAL:${ordinal}`);
    return row;
  });

  const payload = {
    schema: CANDIDATE_FEATURE_SELECTION_SNAPSHOT_V1,
    requestId: selection.requestId,
    workspaceRevision: map.workspaceRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    selectionChecksum: selection.selectionChecksum,
    featureRevision: input.featureRevision,
    rowCount: orderedRows.length,
    rows: orderedRows,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
    producerRevision: input.producerRevision,
  };

  return candidateFeatureSelectionSnapshotV1Schema.parse({
    ...payload,
    snapshotChecksum: checksum(payload),
  });
}

export function verifyCandidateFeatureSelectionSnapshotV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  selection: CandidateOrdinalSelectionV1;
  snapshot: CandidateFeatureSelectionSnapshotV1;
}): void {
  const snapshot = candidateFeatureSelectionSnapshotV1Schema.parse(input.snapshot);
  const rebuilt = materializeCandidateFeatureSelectionSnapshotV1({
    ordinalMap: input.ordinalMap,
    selection: input.selection,
    rows: snapshot.rows,
    featureRevision: snapshot.featureRevision,
    producerRevision: snapshot.producerRevision,
  });
  if (rebuilt.snapshotChecksum !== snapshot.snapshotChecksum) {
    throw new Error(`FEATURE_SELECTION_SNAPSHOT_CHECKSUM_MISMATCH:${rebuilt.snapshotChecksum}:${snapshot.snapshotChecksum}`);
  }
}
