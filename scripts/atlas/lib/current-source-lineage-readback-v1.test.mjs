import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareCurrentSourceToHistoricalBindingsV1,
  validateCurrentSourceAuthorityInputsV1,
} from './current-source-lineage-readback-v1.mjs';

const sha = (char) => `sha256:${char.repeat(64)}`;

function inputs() {
  const manifest = {
    schema: 'atlas.workspace-source-snapshot-capture.v1',
    workspaceId: 'ws-1',
    snapshotRevision: sha('a'),
    canonicalAuthority: false,
    datastoreWritesPerformed: false,
    sources: [{ repositoryId: 'repo:root' }, { repositoryId: 'repo:nested' }],
  };
  const preflight = {
    schema: 'atlas.workspace-revision-tournament-source-authority.v1',
    status: 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION',
    approvalRequired: true,
    firstBlockingInvariant: null,
    manifestSha256: sha('b'),
    snapshotRevision: sha('a'),
    workspaceRevisionCandidate: sha('c'),
    sourceSelectionChecksum: sha('f'),
    canonicalSnapshotBinding: { workspaceId: 'ws-1' },
  };
  const admission = {
    schema: 'atlas.workspace-revision-tournament-admission.v1',
    status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
    authority: true,
    approval: { scope: 'TOURNAMENT_SOURCE_AUTHORITY_ONLY' },
    graphifyExecutionAuthorized: false,
    projectionWritesAuthorized: false,
    writesPerformed: false,
    datastoreWritesPerformed: false,
    snapshotSourceCount: 2,
    validationReceiptSha256: sha('d'),
    manifestSha256: sha('b'),
    sourceSelectionChecksum: sha('f'),
    snapshotRevision: sha('a'),
    workspaceId: 'ws-1',
    workspaceRevision: sha('c'),
  };
  return { admission, preflight, manifest };
}

test('validates exact scope and digest bindings for an admitted source-only frame', () => {
  const { admission, preflight, manifest } = inputs();
  const result = validateCurrentSourceAuthorityInputsV1({
    admission, preflight, manifest,
    admissionReceiptSha256: sha('e'), preflightSha256: sha('d'), manifestSha256: sha('b'),
  });
  assert.equal(result.valid, true);
  assert.equal(result.workspaceRevision, sha('c'));
});

test('fails closed when input checksum, source count, or write scope differs', () => {
  const { admission, preflight, manifest } = inputs();
  admission.snapshotSourceCount = 99;
  admission.projectionWritesAuthorized = true;
  const result = validateCurrentSourceAuthorityInputsV1({
    admission, preflight, manifest,
    admissionReceiptSha256: sha('e'), preflightSha256: sha('d'), manifestSha256: sha('f'),
  });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('MANIFEST_SOURCE_COUNT_MISMATCH'));
  assert.ok(result.reasons.includes('MANIFEST_CHECKSUM_MISMATCH'));
  assert.ok(result.reasons.includes('ADMISSION_WRITE_SCOPE_INVALID'));
});

test('separates content equivalence from current-revision binding and reports delta categories', () => {
  const current = sha('c');
  const digest = (n) => n.repeat(64);
  const delta = compareCurrentSourceToHistoricalBindingsV1({
    workspaceRevision: current,
    snapshotSources: [
      { repositoryId: 'repo:root', sourceRef: 'same.ts', sourceRevision: `sha256:${digest('1')}`, contentDigest: digest('1'), byteLength: 1 },
      { repositoryId: 'repo:root', sourceRef: 'changed.ts', sourceRevision: `sha256:${digest('2')}`, contentDigest: digest('2'), byteLength: 2 },
      { repositoryId: 'repo:root', sourceRef: 'added.ts', sourceRevision: `sha256:${digest('3')}`, contentDigest: digest('3'), byteLength: 3 },
      { repositoryId: 'repo:nested', sourceRef: 'ignored.ts', sourceRevision: `sha256:${digest('4')}`, contentDigest: digest('4'), byteLength: 4 },
    ],
    historicalBindings: [
      { canonical_source_ref: 'same.ts', content_digest: digest('1'), source_revision: `sha256:${digest('1')}`, byte_length: 1 },
      { canonical_source_ref: 'changed.ts', content_digest: digest('5'), source_revision: `sha256:${digest('5')}`, byte_length: 5 },
      { canonical_source_ref: 'removed.ts', content_digest: digest('6'), source_revision: `sha256:${digest('6')}`, byte_length: 6 },
    ],
    currentBindings: [],
  });
  assert.deepEqual(delta.counts, {
    unchanged: 1, modified: 1, unmatchedCurrentSources: 1, historicalOnlyBindings: 1, ambiguous: 0, missingHashes: 0, unqualified: 0,
    exactCurrentBindings: 0, missingCurrentBindings: 3, currentBindingConflicts: 0, unexpectedCurrentBindings: 0, caseFoldCollisions: 0,
  });
  assert.equal(delta.currentWorkspaceAuthorityEstablished, false);
  assert.equal(delta.contentDeltaCoverageComplete, false);
  assert.equal(delta.rows.find((row) => row.sourceRef === 'added.ts').status, 'NO_HISTORICAL_BINDING_COVERAGE');
  assert.equal(delta.canonicalAuthority, false);
  assert.equal(delta.writesPerformed, false);
});

test('rejects root-source paths that escape the repository', () => {
  assert.throws(() => compareCurrentSourceToHistoricalBindingsV1({
    workspaceRevision: sha('c'),
    snapshotSources: [{ repositoryId: 'repo:root', sourceRef: '../outside.txt' }],
    historicalBindings: [],
  }), /CURRENT_SOURCE_REF_OUTSIDE_REPOSITORY/);
});
