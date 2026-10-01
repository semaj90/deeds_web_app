import { z } from 'zod';

import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapChecksum,
  candidateOrdinalMapV1Schema,
  compareUtf8,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  candidateFeatureSnapshotChecksum,
  candidateFeatureSnapshotV1Schema,
} from '../features/candidate-feature-snapshot-v1.js';
import { CandidateFeatureRowV1Schema } from '../features/candidate-feature-row-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revisionSha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const selectedCandidateInputV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: revisionSha256,
  workspaceRevision: revisionSha256,
  score: z.number().finite(),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

const selectedCandidateV1Schema = selectedCandidateInputV1Schema;

export const searchRuntimeSelectedCandidateSetV1Schema = z.object({
  schema: z.literal('atlas.search-runtime-selected-candidate-set.v1'),
  requestId: z.string().min(1),
  queryDigest: sha256,
  workspaceRevision: revisionSha256,
  candidateSnapshotRevision: z.string().min(1),
  parentOrdinalMapChecksum: sha256,
  parentOrdinalMapRowCount: z.number().int().positive(),
  parentOrdinalMapProducerRevision: z.string().min(1),
  retrievalPolicyRevision: z.string().min(1),
  selectedCandidates: z.array(selectedCandidateV1Schema),
  selectedCount: z.number().int().positive(),
  selectionChecksum: sha256,
  identityAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();
export type SearchRuntimeSelectedCandidateSetV1 = z.infer<typeof searchRuntimeSelectedCandidateSetV1Schema>;

export const searchRuntimeSelectedFeatureRowsV1Schema = z.object({
  schema: z.literal('atlas.search-runtime-selected-feature-rows.v1'),
  requestId: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  parentOrdinalMapChecksum: sha256,
  parentOrdinalMapRowCount: z.number().int().positive(),
  featureRevision: z.string().min(1),
  featureSnapshotChecksum: sha256,
  selectionChecksum: sha256,
  selectedOrdinals: z.array(z.number().int().nonnegative()).min(1),
  rows: z.array(CandidateFeatureRowV1Schema).min(1),
  selectedRowsChecksum: sha256,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();
export type SearchRuntimeSelectedFeatureRowsV1 = z.infer<typeof searchRuntimeSelectedFeatureRowsV1Schema>;

type SelectedCandidateSetBodyV1 = Omit<SearchRuntimeSelectedCandidateSetV1, 'selectionChecksum'>;

function checksumBody(body: SelectedCandidateSetBodyV1): string {
  return candidateOrdinalMapChecksum(body);
}

/**
 * Binds request-scoped SearchRuntime hits to the original coordinates and
 * identity in a sealed CandidateOrdinalMapV1. This receipt never assigns or
 * compacts ordinals; selected candidates retain their parent-map ordinals.
 */
export function buildSearchRuntimeSelectedCandidateSetV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  requestId: string;
  queryDigest: string;
  retrievalPolicyRevision: string;
  selectedCandidates: readonly z.input<typeof selectedCandidateInputV1Schema>[];
}): SearchRuntimeSelectedCandidateSetV1 {
  const ordinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (input.selectedCandidates.length === 0) throw new Error('SELECTED_CANDIDATE_SET_EMPTY');

  const seenOrdinals = new Set<number>();
  const seenCanonicalIds = new Set<string>();
  const selectedCandidates = input.selectedCandidates.map((raw) => {
    const selected = selectedCandidateInputV1Schema.parse(raw);
    if (seenOrdinals.has(selected.candidateOrdinal) || seenCanonicalIds.has(selected.canonicalId)) {
      throw new Error('SELECTED_CANDIDATE_SET_DUPLICATE_IDENTITY');
    }
    seenOrdinals.add(selected.candidateOrdinal);
    seenCanonicalIds.add(selected.canonicalId);

    const parent = ordinalMap.candidates[selected.candidateOrdinal];
    if (!parent || parent.candidateOrdinal !== selected.candidateOrdinal) {
      throw new Error(`SELECTED_CANDIDATE_PARENT_ORDINAL_UNKNOWN:${selected.candidateOrdinal}`);
    }
    if (parent.canonicalId !== selected.canonicalId
      || parent.packetKey !== selected.packetKey
      || parent.sourceRef !== selected.sourceRef
      || parent.sourceRevision !== selected.sourceRevision
      || parent.workspaceRevision !== selected.workspaceRevision
      || selected.workspaceRevision !== ordinalMap.workspaceRevision) {
      throw new Error(`SELECTED_CANDIDATE_PARENT_IDENTITY_MISMATCH:${selected.candidateOrdinal}`);
    }

    return {
      ...selected,
      evidenceRefs: [...new Set(selected.evidenceRefs)].sort(compareUtf8),
    };
  }).sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);

  const body: SelectedCandidateSetBodyV1 = {
    schema: 'atlas.search-runtime-selected-candidate-set.v1',
    requestId: input.requestId,
    queryDigest: input.queryDigest,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    parentOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    parentOrdinalMapRowCount: ordinalMap.rowCount,
    parentOrdinalMapProducerRevision: ordinalMap.producerRevision,
    retrievalPolicyRevision: input.retrievalPolicyRevision,
    selectedCandidates,
    selectedCount: selectedCandidates.length,
    identityAuthority: false,
    writesPerformed: false,
  };
  const receipt = searchRuntimeSelectedCandidateSetV1Schema.parse({
    ...body,
    selectionChecksum: checksumBody(body),
  });
  verifySearchRuntimeSelectedCandidateSetV1(receipt, ordinalMap);
  return receipt;
}

export function verifySearchRuntimeSelectedCandidateSetV1(
  input: z.input<typeof searchRuntimeSelectedCandidateSetV1Schema>,
  ordinalMapInput: z.input<typeof candidateOrdinalMapV1Schema>,
): void {
  const receipt = searchRuntimeSelectedCandidateSetV1Schema.parse(input);
  const ordinalMap = candidateOrdinalMapV1Schema.parse(ordinalMapInput);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (receipt.parentOrdinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || receipt.workspaceRevision !== ordinalMap.workspaceRevision
    || receipt.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || receipt.parentOrdinalMapRowCount !== ordinalMap.rowCount
    || receipt.parentOrdinalMapProducerRevision !== ordinalMap.producerRevision) {
    throw new Error('SELECTED_CANDIDATE_PARENT_MAP_BINDING_MISMATCH');
  }
  if (receipt.selectedCount !== receipt.selectedCandidates.length) {
    throw new Error('SELECTED_CANDIDATE_COUNT_MISMATCH');
  }
  const body: SelectedCandidateSetBodyV1 = {
    schema: receipt.schema,
    requestId: receipt.requestId,
    queryDigest: receipt.queryDigest,
    workspaceRevision: receipt.workspaceRevision,
    candidateSnapshotRevision: receipt.candidateSnapshotRevision,
    parentOrdinalMapChecksum: receipt.parentOrdinalMapChecksum,
    parentOrdinalMapRowCount: receipt.parentOrdinalMapRowCount,
    parentOrdinalMapProducerRevision: receipt.parentOrdinalMapProducerRevision,
    retrievalPolicyRevision: receipt.retrievalPolicyRevision,
    selectedCandidates: receipt.selectedCandidates,
    selectedCount: receipt.selectedCount,
    identityAuthority: receipt.identityAuthority,
    writesPerformed: receipt.writesPerformed,
  };
  if (checksumBody(body) !== receipt.selectionChecksum) {
    throw new Error('SELECTED_CANDIDATE_SELECTION_CHECKSUM_MISMATCH');
  }
  const seenOrdinals = new Set<number>();
  const seenCanonicalIds = new Set<string>();
  let previousOrdinal = -1;
  for (const selected of receipt.selectedCandidates) {
    if (seenOrdinals.has(selected.candidateOrdinal) || seenCanonicalIds.has(selected.canonicalId)) {
      throw new Error('SELECTED_CANDIDATE_SET_DUPLICATE_IDENTITY');
    }
    if (selected.candidateOrdinal <= previousOrdinal) {
      throw new Error('SELECTED_CANDIDATE_SET_ORDER_INVALID');
    }
    seenOrdinals.add(selected.candidateOrdinal);
    seenCanonicalIds.add(selected.canonicalId);
    previousOrdinal = selected.candidateOrdinal;
    const parent = ordinalMap.candidates[selected.candidateOrdinal];
    if (!parent || parent.canonicalId !== selected.canonicalId
      || parent.packetKey !== selected.packetKey
      || parent.sourceRef !== selected.sourceRef
      || parent.sourceRevision !== selected.sourceRevision
      || parent.workspaceRevision !== selected.workspaceRevision) {
      throw new Error(`SELECTED_CANDIDATE_PARENT_IDENTITY_MISMATCH:${selected.candidateOrdinal}`);
    }
  }
}

/**
 * Joins request-scoped retrieval hits to rows in the already-materialized full
 * feature snapshot. The snapshot remains full-cohort; the returned slice keeps
 * parent ordinals and binds both source checksums. No ordinal is reassigned.
 */
export function buildSearchRuntimeSelectedFeatureRowsV1(input: {
  selection: z.input<typeof searchRuntimeSelectedCandidateSetV1Schema>;
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  featureSnapshot: z.input<typeof candidateFeatureSnapshotV1Schema>;
}): SearchRuntimeSelectedFeatureRowsV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const featureSnapshot = candidateFeatureSnapshotV1Schema.parse(input.featureSnapshot);
  const selection = searchRuntimeSelectedCandidateSetV1Schema.parse(input.selection);
  verifySearchRuntimeSelectedCandidateSetV1(selection, ordinalMap);

  if (featureSnapshot.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || featureSnapshot.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || featureSnapshot.workspaceRevision !== ordinalMap.workspaceRevision
    || featureSnapshot.rowCount !== ordinalMap.rowCount
    || featureSnapshot.rows.length !== ordinalMap.rowCount) {
    throw new Error('SELECTED_FEATURE_SNAPSHOT_PARENT_BINDING_MISMATCH');
  }

  const snapshotPayload = {
    candidateSnapshotRevision: featureSnapshot.candidateSnapshotRevision,
    ordinalMapChecksum: featureSnapshot.ordinalMapChecksum,
    workspaceRevision: featureSnapshot.workspaceRevision,
    featureRevision: featureSnapshot.featureRevision,
    rows: featureSnapshot.rows,
  };
  const featureSnapshotChecksum = candidateFeatureSnapshotChecksum(snapshotPayload);
  if (featureSnapshot.snapshotChecksum !== featureSnapshotChecksum) {
    throw new Error('SELECTED_FEATURE_SNAPSHOT_CHECKSUM_MISMATCH');
  }

  const rows = selection.selectedCandidates.map((selected) => {
    const candidate = ordinalMap.candidates[selected.candidateOrdinal];
    const row = featureSnapshot.rows[selected.candidateOrdinal];
    if (!candidate || !row || row.candidateOrdinal !== selected.candidateOrdinal) {
      throw new Error(`SELECTED_FEATURE_ROW_ORDINAL_MISMATCH:${selected.candidateOrdinal}`);
    }
    if (row.canonicalId !== selected.canonicalId
      || row.packetKey !== selected.packetKey
      || row.sourceRef !== candidate.sourceRef
      || row.sourceRevision !== selected.sourceRevision
      || row.workspaceRevision !== selected.workspaceRevision
      || row.featureRevision !== featureSnapshot.featureRevision
      || row.treeNodeId !== candidate.treeNodeId
      || row.symbolVersionId !== candidate.symbolVersionId) {
      throw new Error(`SELECTED_FEATURE_ROW_IDENTITY_REVISION_MISMATCH:${selected.candidateOrdinal}`);
    }
    return CandidateFeatureRowV1Schema.parse(row);
  });
  const selectedOrdinals = rows.map((row) => row.candidateOrdinal);
  const selectedRowsChecksum = candidateFeatureSnapshotChecksum({
    schema: 'atlas.search-runtime-selected-feature-rows.v1',
    requestId: selection.requestId,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    parentOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    featureSnapshotChecksum,
    selectionChecksum: selection.selectionChecksum,
    rows,
  });
  return searchRuntimeSelectedFeatureRowsV1Schema.parse({
    schema: 'atlas.search-runtime-selected-feature-rows.v1',
    requestId: selection.requestId,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    parentOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    parentOrdinalMapRowCount: ordinalMap.rowCount,
    featureRevision: featureSnapshot.featureRevision,
    featureSnapshotChecksum,
    selectionChecksum: selection.selectionChecksum,
    selectedOrdinals,
    rows,
    selectedRowsChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function verifySearchRuntimeSelectedFeatureRowsV1(input: {
  receipt: z.input<typeof searchRuntimeSelectedFeatureRowsV1Schema>;
  selection: z.input<typeof searchRuntimeSelectedCandidateSetV1Schema>;
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  featureSnapshot: z.input<typeof candidateFeatureSnapshotV1Schema>;
}): void {
  const receipt = searchRuntimeSelectedFeatureRowsV1Schema.parse(input.receipt);
  const expected = buildSearchRuntimeSelectedFeatureRowsV1({
    selection: input.selection,
    ordinalMap: input.ordinalMap,
    featureSnapshot: input.featureSnapshot,
  });
  if (receipt.requestId !== expected.requestId
    || receipt.candidateSnapshotRevision !== expected.candidateSnapshotRevision
    || receipt.parentOrdinalMapChecksum !== expected.parentOrdinalMapChecksum
    || receipt.parentOrdinalMapRowCount !== expected.parentOrdinalMapRowCount
    || receipt.featureRevision !== expected.featureRevision
    || receipt.featureSnapshotChecksum !== expected.featureSnapshotChecksum
    || receipt.selectionChecksum !== expected.selectionChecksum
    || receipt.selectedRowsChecksum !== expected.selectedRowsChecksum) {
    throw new Error('SELECTED_FEATURE_ROWS_RECEIPT_BINDING_MISMATCH');
  }
}
