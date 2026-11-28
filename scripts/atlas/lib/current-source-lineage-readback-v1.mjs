import { createHash } from 'node:crypto';

const digest = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');
const sourceRef = (value) => String(value ?? '').trim().replaceAll('\\', '/');
const sha256Pattern = /^sha256:[a-f0-9]{64}$/i;
const digestPattern = /^[a-f0-9]{64}$/i;
const validByteLength = (value) => value !== null && value !== undefined && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

/** Validate the already-existing source-only tournament admission against its exact inputs. */
export function validateCurrentSourceAuthorityInputsV1({ admission, preflight, manifest, admissionReceiptSha256, preflightSha256, manifestSha256 }) {
  const reasons = [];
  if (admission?.schema !== 'atlas.workspace-revision-tournament-admission.v1') reasons.push('ADMISSION_SCHEMA_INVALID');
  if (admission?.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission?.authority !== true) reasons.push('ADMISSION_NOT_AUTHORITY_PROVEN');
  if (admission?.approval?.scope !== 'TOURNAMENT_SOURCE_AUTHORITY_ONLY') reasons.push('ADMISSION_SCOPE_INVALID');
  if (admission?.graphifyExecutionAuthorized !== false || admission?.projectionWritesAuthorized !== false) reasons.push('ADMISSION_WRITE_SCOPE_INVALID');
  if (admission?.writesPerformed !== false || admission?.datastoreWritesPerformed !== false) reasons.push('ADMISSION_WRITES_REPORTED');
  if (preflight?.schema !== 'atlas.workspace-revision-tournament-source-authority.v1'
    || preflight?.status !== 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION'
    || preflight?.approvalRequired !== true
    || preflight?.firstBlockingInvariant !== null) reasons.push('PREFLIGHT_NOT_READY');
  if (manifest?.schema !== 'atlas.workspace-source-snapshot-capture.v1') reasons.push('MANIFEST_SCHEMA_INVALID');
  if (!sha256Pattern.test(admissionReceiptSha256 ?? '') || !sha256Pattern.test(preflightSha256 ?? '') || !sha256Pattern.test(manifestSha256 ?? '')) reasons.push('INPUT_CHECKSUM_INVALID');
  if (admission?.validationReceiptSha256 !== preflightSha256) reasons.push('PREFLIGHT_CHECKSUM_MISMATCH');
  if (admission?.manifestSha256 !== manifestSha256 || preflight?.manifestSha256 !== manifestSha256) reasons.push('MANIFEST_CHECKSUM_MISMATCH');
  if (!sha256Pattern.test(admission?.sourceSelectionChecksum ?? '') || admission?.sourceSelectionChecksum !== preflight?.sourceSelectionChecksum) reasons.push('SOURCE_SELECTION_CHECKSUM_MISMATCH');
  if (admission?.snapshotRevision !== manifest?.snapshotRevision || preflight?.snapshotRevision !== manifest?.snapshotRevision) reasons.push('SNAPSHOT_REVISION_MISMATCH');
  if (admission?.workspaceId !== manifest?.workspaceId || preflight?.canonicalSnapshotBinding?.workspaceId !== manifest?.workspaceId) reasons.push('WORKSPACE_ID_MISMATCH');
  if (!sha256Pattern.test(admission?.workspaceRevision ?? '') || admission?.workspaceRevision !== preflight?.workspaceRevisionCandidate) reasons.push('WORKSPACE_REVISION_MISMATCH');
  if (manifest?.canonicalAuthority !== false || manifest?.datastoreWritesPerformed !== false) reasons.push('MANIFEST_AUTHORITY_OR_WRITE_SCOPE_INVALID');
  if (!Array.isArray(manifest?.sources) || Number(admission?.snapshotSourceCount) !== manifest.sources.length) reasons.push('MANIFEST_SOURCE_COUNT_MISMATCH');
  return {
    valid: reasons.length === 0,
    reasons,
    workspaceId: reasons.length === 0 ? admission.workspaceId : null,
    workspaceRevision: reasons.length === 0 ? admission.workspaceRevision : null,
    snapshotRevision: reasons.length === 0 ? admission.snapshotRevision : null,
    admissionScope: reasons.length === 0 ? admission.approval.scope : null,
  };
}

/** Compare current manifest source bytes with the latest historical source-binding frame.
 * Content equality is reported separately from current workspace-revision binding.
 */
export function compareCurrentSourceToHistoricalBindingsV1({ snapshotSources, historicalBindings, currentBindings = [], workspaceRevision }) {
  if (!Array.isArray(snapshotSources) || !Array.isArray(historicalBindings) || !Array.isArray(currentBindings) || !sha256Pattern.test(workspaceRevision ?? '')) {
    throw new Error('CURRENT_SOURCE_LINEAGE_INPUT_INVALID');
  }
  const expected = snapshotSources.filter((row) => row?.repositoryId === 'repo:root');
  const expectedByRef = new Map();
  for (const row of expected) {
    const ref = sourceRef(row.sourceRef);
    if (!ref || ref.startsWith('/') || /^[a-z]:\//i.test(ref) || ref.split('/').some((segment) => segment === '..')) {
      throw new Error('CURRENT_SOURCE_REF_OUTSIDE_REPOSITORY');
    }
    const key = ref.toLowerCase();
    const bucket = expectedByRef.get(key) ?? [];
    bucket.push({ ...row, normalizedSourceRef: ref });
    expectedByRef.set(key, bucket);
  }
  const historicalByRef = new Map();
  for (const row of historicalBindings) {
    const ref = sourceRef(row.canonical_source_ref);
    if (!ref) continue;
    const key = ref.toLowerCase();
    const bucket = historicalByRef.get(key) ?? [];
    bucket.push(row);
    historicalByRef.set(key, bucket);
  }
  const currentByRef = new Map();
  for (const row of currentBindings) {
    const ref = sourceRef(row.canonical_source_ref);
    if (!ref || String(row.workspace_revision ?? '') !== workspaceRevision) continue;
    const key = ref.toLowerCase();
    const bucket = currentByRef.get(key) ?? [];
    bucket.push(row);
    currentByRef.set(key, bucket);
  }

  const counts = { unchanged: 0, modified: 0, unmatchedCurrentSources: 0, historicalOnlyBindings: 0, ambiguous: 0, missingHashes: 0, unqualified: 0, exactCurrentBindings: 0, missingCurrentBindings: 0, currentBindingConflicts: 0, unexpectedCurrentBindings: 0, caseFoldCollisions: 0 };
  const rows = [];
  const allExpectedKeys = new Set(expectedByRef.keys());
  for (const [key, expectedRows] of expectedByRef) {
    const ref = expectedRows[0].normalizedSourceRef;
    const historicalRows = historicalByRef.get(key) ?? [];
    const currentRows = currentByRef.get(key) ?? [];
    if (expectedRows.length > 1) {
      counts.ambiguous += 1;
      counts.caseFoldCollisions += 1;
      rows.push({ sourceRef: ref, status: 'AMBIGUOUS_CASEFOLD_SOURCE_IDENTITY', historicalRows: historicalRows.length, currentRows: currentRows.length });
      continue;
    }
    if (currentRows.length === 0) counts.missingCurrentBindings += 1;
    else if (currentRows.length > 1) counts.currentBindingConflicts += 1;
    else if (currentRows.length === 1) {
      const current = currentRows[0];
      if (digestPattern.test(digest(current.content_digest))
        && digestPattern.test(digest(expectedRows[0].contentDigest))
        && digestPattern.test(digest(current.source_revision))
        && digestPattern.test(digest(expectedRows[0].sourceRevision))
        && validByteLength(current.byte_length)
        && validByteLength(expectedRows[0].byteLength)
        && digest(current.content_digest) === digest(expectedRows[0].contentDigest)
        && digest(current.source_revision) === digest(expectedRows[0].sourceRevision)
        && Number(current.byte_length) === Number(expectedRows[0].byteLength)) counts.exactCurrentBindings += 1;
      else counts.currentBindingConflicts += 1;
    }
    if (historicalRows.length > 1) {
      counts.ambiguous += 1;
      rows.push({ sourceRef: ref, status: 'AMBIGUOUS_HISTORICAL_BINDING', historicalRows: historicalRows.length, currentRows: currentRows.length });
      continue;
    }
    if (historicalRows.length === 0) {
      counts.unmatchedCurrentSources += 1;
      rows.push({ sourceRef: ref, status: 'NO_HISTORICAL_BINDING_COVERAGE', historicalRows: 0, currentRows: currentRows.length });
      continue;
    }
    const actual = historicalRows[0];
    if (!digestPattern.test(digest(actual.content_digest)) || !digestPattern.test(digest(actual.source_revision))
      || !validByteLength(actual.byte_length) || !digestPattern.test(digest(expectedRows[0].contentDigest))
      || !digestPattern.test(digest(expectedRows[0].sourceRevision)) || !validByteLength(expectedRows[0].byteLength)) {
      counts.missingHashes += 1;
      counts.unqualified += 1;
      rows.push({ sourceRef: ref, status: 'HISTORICAL_BINDING_UNQUALIFIED', historicalRows: 1, currentRows: currentRows.length });
      continue;
    }
    const matches = digest(actual.content_digest) === digest(expectedRows[0].contentDigest)
      && digest(actual.source_revision) === digest(expectedRows[0].sourceRevision)
      && Number(actual.byte_length) === Number(expectedRows[0].byteLength);
    if (matches) counts.unchanged += 1;
    else counts.modified += 1;
    rows.push({ sourceRef: ref, status: matches ? 'UNCHANGED_CONTENT_HISTORICAL_FRAME_ONLY' : 'MODIFIED_SINCE_HISTORICAL_FRAME', historicalRows: 1, currentRows: currentRows.length });
  }
  for (const key of historicalByRef.keys()) {
    if (!allExpectedKeys.has(key)) counts.historicalOnlyBindings += historicalByRef.get(key).length;
  }
  for (const [key, rowsForRef] of currentByRef) {
    if (!allExpectedKeys.has(key)) counts.unexpectedCurrentBindings += rowsForRef.length;
  }
  const sourceSetChecksum = `sha256:${createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex')}`;
  return {
    scope: 'repo:root compared to latest historical atlas_workspace_source_bindings frame',
    contentDeltaCoverageComplete: counts.unmatchedCurrentSources === 0 && counts.ambiguous === 0 && counts.unqualified === 0,
    contentDeltaCoverageNote: 'Unmatched rows are coverage gaps, not proof of file addition or removal; the historical table is not a full prior workspace manifest.',
    workspaceRevision,
    expectedRootSourceCount: expected.length,
    currentBindingRowCount: currentBindings.filter((row) => String(row.workspace_revision ?? '') === workspaceRevision).length,
    historicalBindingRowCount: historicalBindings.length,
    counts,
    rows,
    sourceSetChecksum,
    currentWorkspaceAuthorityEstablished: counts.exactCurrentBindings === expected.length && expected.length > 0
      && counts.currentBindingConflicts === 0 && counts.unexpectedCurrentBindings === 0,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
