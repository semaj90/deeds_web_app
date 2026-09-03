import { z } from 'zod';

import { candidateOrdinalMapV1Schema } from '../features/canonical-candidate-v1.js';
import { candidateFeatureSnapshotV1Schema } from '../features/candidate-feature-snapshot-v1.js';
import { revisionAuthorityEnvelopeV1Schema } from '../identity/revision-authority-envelope-v1.js';

const isoTimestampRevision = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export const aceAuthoritativeRevisionV1Schema = z.string().min(1).refine(
  (value) => !isoTimestampRevision.test(value),
  'synthetic ISO timestamp revisions are not authoritative',
);

export const aceLiveDryInputV2Schema = z.object({
  schema: z.literal('atlas.ace-live-dry-input.v2'),
  expectedCandidateCount: z.number().int().positive().default(15),
  ordinalMap: candidateOrdinalMapV1Schema,
  snapshot: candidateFeatureSnapshotV1Schema,
  revisionAuthority: revisionAuthorityEnvelopeV1Schema,
  ace: z.object({
    requestId: z.string().min(1),
    selectedOrdinals: z.array(z.number().int().nonnegative()).optional(),
    tokenBudget: z.number().int().positive(),
    retrievalPolicyRevision: aceAuthoritativeRevisionV1Schema,
    acePlaybookRevision: aceAuthoritativeRevisionV1Schema,
    representationRevision: aceAuthoritativeRevisionV1Schema,
    ontologyRevision: aceAuthoritativeRevisionV1Schema.nullable().optional(),
    modelRevision: aceAuthoritativeRevisionV1Schema.nullable().optional(),
    promptTemplateRevision: aceAuthoritativeRevisionV1Schema.nullable().optional(),
    graphRevision: aceAuthoritativeRevisionV1Schema.nullable().default(null),
  }).strict(),
}).strict();

export type AceLiveDryInputV2 = z.infer<typeof aceLiveDryInputV2Schema>;
export type AceLiveDrySnapshotRowV2 = AceLiveDryInputV2['snapshot']['rows'][number];

export interface AceLiveDryCanaryValidationV2 {
  selectedRows: AceLiveDrySnapshotRowV2[];
  graphRevision: string | null;
  graphAdmissionMode: 'REQUIRED_EXACT' | 'NOT_ADMITTED';
}

export function rowCarriesAceGraphEvidenceV2(row: AceLiveDrySnapshotRowV2): boolean {
  return row.laneMask.includes('graph') ||
    row.graphAuthority !== null ||
    row.personalizedPageRank !== null ||
    row.communityAffinity !== null;
}

export function selectedAceLiveDryRowsV2(input: AceLiveDryInputV2): AceLiveDrySnapshotRowV2[] {
  const ordinals = [...new Set(input.ace.selectedOrdinals ?? input.snapshot.rows.map((row) => row.candidateOrdinal))]
    .sort((a, b) => a - b);
  return ordinals.map((ordinal) => {
    const row = input.snapshot.rows.find((candidate) => candidate.candidateOrdinal === ordinal);
    if (!row) throw new Error(`ACE_LIVE_DRY_SELECTED_ORDINAL_MISSING:${ordinal}`);
    return row;
  });
}

export function resolveAceLiveDryGraphRevisionV2(rows: readonly AceLiveDrySnapshotRowV2[]): string | null {
  const graphEvidenceRequired = rows.some(rowCarriesAceGraphEvidenceV2);
  const graphRevisions = [...new Set(rows.map((row) => row.graphRevision))];

  if (graphEvidenceRequired) {
    if (rows.some((row) => row.graphRevision === null)) {
      throw new Error('ACE_LIVE_DRY_GRAPH_EVIDENCE_REQUIRES_REVISION');
    }
    if (graphRevisions.length !== 1 || graphRevisions[0] === null) {
      throw new Error(`ACE_LIVE_DRY_GRAPH_REVISION_NOT_SINGLE_EXACT:${graphRevisions.map(String).join(',')}`);
    }
    return graphRevisions[0];
  }

  if (rows.some((row) => row.graphRevision !== null)) {
    throw new Error('ACE_LIVE_DRY_GRAPH_REVISION_WITHOUT_GRAPH_EVIDENCE');
  }
  return null;
}

export function validateAceLiveDryCanaryV2(input: AceLiveDryInputV2): AceLiveDryCanaryValidationV2 {
  if (input.ordinalMap.rowCount !== input.expectedCandidateCount ||
      input.snapshot.rowCount !== input.expectedCandidateCount) {
    throw new Error(
      `ACE_LIVE_DRY_CANDIDATE_COUNT_MISMATCH:${input.ordinalMap.rowCount}:${input.snapshot.rowCount}:${input.expectedCandidateCount}`,
    );
  }
  if (input.ordinalMap.ordinalMapChecksum !== input.snapshot.ordinalMapChecksum) {
    throw new Error(
      `ACE_LIVE_DRY_ORDINAL_MAP_CHECKSUM_MISMATCH:${input.ordinalMap.ordinalMapChecksum}:${input.snapshot.ordinalMapChecksum}`,
    );
  }
  if (input.ordinalMap.candidateSnapshotRevision !== input.snapshot.candidateSnapshotRevision) {
    throw new Error(
      `ACE_LIVE_DRY_CANDIDATE_SNAPSHOT_REVISION_MISMATCH:${input.ordinalMap.candidateSnapshotRevision}:${input.snapshot.candidateSnapshotRevision}`,
    );
  }
  if (input.ordinalMap.workspaceRevision !== input.snapshot.workspaceRevision ||
      input.ordinalMap.workspaceRevision !== input.revisionAuthority.workspaceRevision) {
    throw new Error('ACE_LIVE_DRY_WORKSPACE_REVISION_MISMATCH');
  }

  const selectedRows = selectedAceLiveDryRowsV2(input);
  if (selectedRows.length !== input.expectedCandidateCount) {
    throw new Error(`ACE_LIVE_DRY_SELECTED_COUNT_MISMATCH:${selectedRows.length}:${input.expectedCandidateCount}`);
  }
  if (selectedRows.some((row) => !row.sourceRevision.trim())) {
    throw new Error('ACE_LIVE_DRY_SOURCE_REVISION_MISSING');
  }

  const graphRevision = resolveAceLiveDryGraphRevisionV2(selectedRows);
  if (input.ace.graphRevision !== graphRevision) {
    throw new Error(`ACE_LIVE_DRY_GRAPH_REVISION_MISMATCH:${String(graphRevision)}:${String(input.ace.graphRevision)}`);
  }

  return {
    selectedRows,
    graphRevision,
    graphAdmissionMode: graphRevision === null ? 'NOT_ADMITTED' : 'REQUIRED_EXACT',
  };
}
