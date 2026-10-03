import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import type { SemanticCandidateSnapshotV1 } from './semantic-candidate-snapshot-v1.js';

export const CANDIDATE_POPULATION_FREEZE_SCHEMA = 'atlas.candidate-population-freeze.v1' as const;

export type CandidatePopulationFreezeV1 = {
  schema: typeof CANDIDATE_POPULATION_FREEZE_SCHEMA;
  workspaceRevision: string;
  sourceAuthorityReceiptChecksum: string;
  candidateSnapshotRevision: string;
  candidateOrdinalMapChecksum: string;
  representationId: 'semantic_768';
  representationRevision: string;
  tensorChecksum: string;
  rowIdentityChecksum: string;
  rowCount: number;
  lineageQualified: true;
  semanticComplete: true;
  downstreamAllowed: true;
  freezeChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

const SHA256 = /^sha256:[0-9a-f]{64}$/i;

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`CANDIDATE_POPULATION_FREEZE_${field.toUpperCase()}_REQUIRED`);
  return normalized;
}

function checksum(value: unknown): string {
  return canonicalSha256V1(value);
}

/**
 * Build a non-writing population-freeze receipt from the existing ordinal map
 * and semantic snapshot. This does not make either input canonical. A separate
 * source-authority receipt must prove the current cohort before the freeze is
 * allowed to feed KNN, KMeans, or SOM.
 */
export function buildCandidatePopulationFreezeV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  semanticSnapshot: SemanticCandidateSnapshotV1;
  workspaceRevision: string;
  sourceAuthorityReceiptChecksum: string;
  lineageQualified: boolean;
  semanticComplete: boolean;
}): CandidatePopulationFreezeV1 {
  assertCandidateOrdinalMapIntegrityV1(input.ordinalMap);
  const workspaceRevision = required(input.workspaceRevision, 'workspace_revision');
  const sourceAuthorityReceiptChecksum = required(input.sourceAuthorityReceiptChecksum, 'source_authority_receipt_checksum');
  if (!SHA256.test(sourceAuthorityReceiptChecksum)) throw new Error('CANDIDATE_POPULATION_FREEZE_SOURCE_AUTHORITY_CHECKSUM_INVALID');
  if (!input.lineageQualified) throw new Error('CANDIDATE_POPULATION_FREEZE_LINEAGE_REQUIRED');
  if (!input.semanticComplete) throw new Error('CANDIDATE_POPULATION_FREEZE_SEMANTIC_MATRIX_INCOMPLETE');
  if (input.ordinalMap.workspaceRevision !== workspaceRevision) throw new Error('CANDIDATE_POPULATION_FREEZE_WORKSPACE_REVISION_MISMATCH');
  if (input.semanticSnapshot.workspaceRevision !== workspaceRevision) throw new Error('CANDIDATE_POPULATION_FREEZE_SNAPSHOT_WORKSPACE_REVISION_MISMATCH');
  if (input.semanticSnapshot.candidateOrdinalMapChecksum !== input.ordinalMap.ordinalMapChecksum) throw new Error('CANDIDATE_POPULATION_FREEZE_ORDINAL_MAP_MISMATCH');
  if (input.semanticSnapshot.representationId !== 'semantic_768' || input.semanticSnapshot.dimension !== 768) throw new Error('CANDIDATE_POPULATION_FREEZE_REPRESENTATION_INVALID');
  if (!Number.isInteger(input.semanticSnapshot.rowCount) || input.semanticSnapshot.rowCount < 1 || input.semanticSnapshot.rows.length !== input.semanticSnapshot.rowCount) {
    throw new Error('CANDIDATE_POPULATION_FREEZE_ROW_COUNT_INVALID');
  }
  if (input.semanticSnapshot.rowCount !== input.ordinalMap.rowCount) throw new Error('CANDIDATE_POPULATION_FREEZE_ROW_COUNT_MISMATCH');

  const identity = {
    schema: CANDIDATE_POPULATION_FREEZE_SCHEMA,
    workspaceRevision,
    sourceAuthorityReceiptChecksum,
    candidateSnapshotRevision: input.semanticSnapshot.candidateSnapshotRevision,
    candidateOrdinalMapChecksum: input.ordinalMap.ordinalMapChecksum,
    representationId: input.semanticSnapshot.representationId,
    representationRevision: input.semanticSnapshot.representationRevision,
    tensorChecksum: input.semanticSnapshot.tensorChecksum,
    rowIdentityChecksum: input.semanticSnapshot.rowIdentityChecksum,
    rowCount: input.semanticSnapshot.rowCount,
    lineageQualified: true,
    semanticComplete: true,
  } as const;

  return {
    ...identity,
    downstreamAllowed: true,
    freezeChecksum: checksum(identity),
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function assertCandidatePopulationFreezeV1(value: CandidatePopulationFreezeV1): void {
  if (value.schema !== CANDIDATE_POPULATION_FREEZE_SCHEMA) throw new Error('CANDIDATE_POPULATION_FREEZE_SCHEMA_MISMATCH');
  if (!value.lineageQualified || !value.semanticComplete || !value.downstreamAllowed) throw new Error('CANDIDATE_POPULATION_FREEZE_NOT_ADMITTED');
  if (value.canonicalAuthority || value.writesPerformed) throw new Error('CANDIDATE_POPULATION_FREEZE_MUTATION_OR_AUTHORITY_FORBIDDEN');
  const { freezeChecksum: _freezeChecksum, downstreamAllowed: _downstreamAllowed, canonicalAuthority: _canonicalAuthority, writesPerformed: _writesPerformed, ...identity } = value;
  if (checksum(identity) !== value.freezeChecksum) throw new Error('CANDIDATE_POPULATION_FREEZE_CHECKSUM_MISMATCH');
}
