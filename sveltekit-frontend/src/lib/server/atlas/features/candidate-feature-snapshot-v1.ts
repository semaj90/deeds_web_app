import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';
import {
  CandidateFeatureRowV1Schema,
  type CandidateFeatureRowV1,
} from './candidate-feature-row-v1.js';

export const CANDIDATE_FEATURE_SNAPSHOT_SCHEMA = 'atlas.candidate-feature-snapshot.v1' as const;

const revision = z.string().min(1);

export const candidateFeatureSnapshotV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_SNAPSHOT_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: revision,
  featureRevision: revision,
  rowCount: z.number().int().nonnegative(),
  rows: z.array(CandidateFeatureRowV1Schema),
  snapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  producerRevision: revision,
}).strict();
export type CandidateFeatureSnapshotV1 = z.infer<typeof candidateFeatureSnapshotV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(',')}}`;
}

export function candidateFeatureSnapshotChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function assertRowMatchesCandidate(row: CandidateFeatureRowV1, map: CandidateOrdinalMapV1): void {
  const candidate = map.candidates[row.candidateOrdinal];
  if (!candidate) throw new Error(`FEATURE_ROW_ORDINAL_NOT_IN_MAP:${row.candidateOrdinal}`);

  const identityPairs: Array<[string, unknown, unknown]> = [
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

  for (const [field, actual, expected] of identityPairs) {
    if (actual !== expected) {
      throw new Error(`FEATURE_ROW_IDENTITY_REVISION_MISMATCH:${row.candidateOrdinal}:${field}`);
    }
  }
}

/**
 * FEAT-01/02 reference materializer. It only joins already-produced lane
 * features by CandidateOrdinal. It does not query stores, synthesize missing
 * scores, or create identity.
 */
export function materializeCandidateFeatureSnapshot(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly z.input<typeof CandidateFeatureRowV1Schema>[];
  featureRevision: string;
  producerRevision: string;
}): CandidateFeatureSnapshotV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const rows = input.rows.map((row) => CandidateFeatureRowV1Schema.parse(row));

  if (rows.length !== ordinalMap.rowCount) {
    throw new Error(`FEATURE_SNAPSHOT_ROW_COUNT_MISMATCH:rows=${rows.length}:ordinals=${ordinalMap.rowCount}`);
  }

  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.candidateOrdinal)) {
      throw new Error(`FEATURE_ROW_DUPLICATE_ORDINAL:${row.candidateOrdinal}`);
    }
    seen.add(row.candidateOrdinal);
    if (row.featureRevision !== input.featureRevision) {
      throw new Error(`FEATURE_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }
    assertRowMatchesCandidate(row, ordinalMap);
  }

  for (let ordinal = 0; ordinal < ordinalMap.rowCount; ordinal++) {
    if (!seen.has(ordinal)) throw new Error(`FEATURE_ROW_MISSING_ORDINAL:${ordinal}`);
  }

  const orderedRows = [...rows].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  const payload = {
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    featureRevision: input.featureRevision,
    rows: orderedRows,
  };

  return candidateFeatureSnapshotV1Schema.parse({
    schema: CANDIDATE_FEATURE_SNAPSHOT_SCHEMA,
    ...payload,
    rowCount: orderedRows.length,
    snapshotChecksum: candidateFeatureSnapshotChecksum(payload),
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: input.producerRevision,
  });
}

export function selectCandidateFeatureRows(
  snapshotInput: z.input<typeof candidateFeatureSnapshotV1Schema>,
  allowedOrdinals: readonly number[],
): CandidateFeatureRowV1[] {
  const snapshot = candidateFeatureSnapshotV1Schema.parse(snapshotInput);
  const unique = [...new Set(allowedOrdinals)];
  return unique.map((ordinal) => {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= snapshot.rowCount) {
      throw new Error(`FEATURE_SELECTION_ORDINAL_OUT_OF_RANGE:${ordinal}`);
    }
    const row = snapshot.rows[ordinal];
    if (!row || row.candidateOrdinal !== ordinal) {
      throw new Error(`FEATURE_SNAPSHOT_ORDINAL_CORRUPT:${ordinal}`);
    }
    return row;
  });
}
