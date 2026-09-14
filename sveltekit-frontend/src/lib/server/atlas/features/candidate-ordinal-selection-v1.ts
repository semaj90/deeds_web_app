import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';

export const CANDIDATE_ORDINAL_SELECTION_V1 = 'atlas.candidate-ordinal-selection.v1' as const;

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

export const candidateOrdinalSelectionV1Schema = z.object({
  schema: z.literal(CANDIDATE_ORDINAL_SELECTION_V1),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  selectedOrdinals: z.array(z.number().int().nonnegative()).min(1),
  selectionChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
}).strict();

export type CandidateOrdinalSelectionV1 = z.infer<typeof candidateOrdinalSelectionV1Schema>;

export function materializeCandidateOrdinalSelectionV1(input: {
  requestId: string;
  ordinalMap: CandidateOrdinalMapV1;
  selectedOrdinals: readonly number[];
}): CandidateOrdinalSelectionV1 {
  if (!input.requestId.trim()) throw new Error('CANDIDATE_ORDINAL_SELECTION_REQUEST_ID_REQUIRED');
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(map);

  const selectedOrdinals = [...input.selectedOrdinals];
  if (selectedOrdinals.length === 0) throw new Error('CANDIDATE_ORDINAL_SELECTION_EMPTY');
  if (new Set(selectedOrdinals).size !== selectedOrdinals.length) {
    throw new Error('CANDIDATE_ORDINAL_SELECTION_DUPLICATE_ORDINAL');
  }
  for (const ordinal of selectedOrdinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= map.rowCount) {
      throw new Error(`CANDIDATE_ORDINAL_SELECTION_OUT_OF_RANGE:${ordinal}`);
    }
  }

  const payload = {
    schema: CANDIDATE_ORDINAL_SELECTION_V1,
    requestId: input.requestId,
    workspaceRevision: map.workspaceRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    selectedOrdinals,
    identityAuthority: false as const,
    canonicalOwnerChanged: false as const,
  };

  return candidateOrdinalSelectionV1Schema.parse({
    ...payload,
    selectionChecksum: checksum(payload),
  });
}

export function verifyCandidateOrdinalSelectionV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  selection: CandidateOrdinalSelectionV1;
}): void {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(map);
  const selection = candidateOrdinalSelectionV1Schema.parse(input.selection);

  if (selection.workspaceRevision !== map.workspaceRevision) {
    throw new Error('CANDIDATE_ORDINAL_SELECTION_WORKSPACE_MISMATCH');
  }
  if (selection.candidateSnapshotRevision !== map.candidateSnapshotRevision) {
    throw new Error('CANDIDATE_ORDINAL_SELECTION_SNAPSHOT_MISMATCH');
  }
  if (selection.ordinalMapChecksum !== map.ordinalMapChecksum) {
    throw new Error('CANDIDATE_ORDINAL_SELECTION_MAP_CHECKSUM_MISMATCH');
  }

  const { selectionChecksum, ...payload } = selection;
  const actual = checksum(payload);
  if (actual !== selectionChecksum) {
    throw new Error(`CANDIDATE_ORDINAL_SELECTION_CHECKSUM_MISMATCH:${actual}:${selectionChecksum}`);
  }
}
