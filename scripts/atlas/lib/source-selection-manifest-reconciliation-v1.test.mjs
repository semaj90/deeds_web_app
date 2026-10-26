import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { reconcileSelectedSourceManifestV1 } from './source-selection-manifest-reconciliation-v1.mjs';

const checksum = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const digest = (value) => checksum(value).slice('sha256:'.length);

function fixture() {
  const sourceRevision = checksum('source-a');
  const contentDigest = digest('source-a');
  const archiveRevision = checksum('archive');
  const archiveDigest = digest('archive');
  const snapshot = {
    snapshotRevision: `sha256:${'a'.repeat(64)}`,
    sources: [
      { repositoryId: 'repo:root', repositoryRelativePath: 'src/a.ts', sourceRef: 'src/a.ts', sourceRevision, contentDigest, byteLength: 10 },
      { repositoryId: 'repo:root', repositoryRelativePath: '.archive/old.ts', sourceRef: '.archive/old.ts', sourceRevision: archiveRevision, contentDigest: archiveDigest, byteLength: 20 },
    ],
  };
  const sourceSelectionChecksum = checksum(JSON.stringify(['repo:root:src/a.ts']));
  const selectionPlan = {
    schema: 'atlas.graphify-source-selection-plan.v1',
    status: 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED',
    workspaceRevisionCandidate: checksum('workspace-candidate'),
    snapshotRevision: snapshot.snapshotRevision,
    sourceCount: 1,
    sourceSelectionChecksum,
    bindings: [{ repositoryId: 'repo:root', repositoryRelativePath: 'src/a.ts', sourceRef: 'src/a.ts', codeSourceRevision: sourceRevision, contentHash: contentDigest, byteLength: 10 }],
  };
  const admission = {
    status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
    authority: true,
    workspaceRevision: selectionPlan.workspaceRevisionCandidate,
    snapshotRevision: snapshot.snapshotRevision,
    sourceCount: 1,
    sourceSelectionChecksum,
  };
  return { admission, selectionPlan, snapshot };
}

test('compares execution membership to selected snapshot sources, excluding unselected files', () => {
  const result = reconcileSelectedSourceManifestV1(fixture());
  assert.equal(result.valid, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceRef, 'src/a.ts');
});

test('rejects a selection binding whose digest differs from the frozen snapshot', () => {
  const input = fixture();
  input.selectionPlan.bindings[0].contentHash = digest('forged');
  const result = reconcileSelectedSourceManifestV1(input);
  assert.equal(result.valid, false);
  assert.equal(result.checks.everyBindingMatchesSnapshot, false);
});

test('rejects malformed source digests and unsafe byte lengths', () => {
  const input = fixture();
  input.selectionPlan.bindings[0].codeSourceRevision = 'sha256:short';
  input.selectionPlan.bindings[0].contentHash = 'not-a-digest';
  input.selectionPlan.bindings[0].byteLength = Number.MAX_SAFE_INTEGER + 1;
  const result = reconcileSelectedSourceManifestV1(input);
  assert.equal(result.valid, false);
  assert.equal(result.checks.sourceDigestsValid, false);
  assert.equal(result.checks.sourceByteLengthsValid, false);
});

test('rejects duplicate selected source identities', () => {
  const input = fixture();
  input.selectionPlan.bindings.push({ ...input.selectionPlan.bindings[0] });
  input.selectionPlan.sourceCount = 2;
  input.admission.sourceCount = 2;
  input.selectionPlan.sourceSelectionChecksum = checksum(JSON.stringify(['repo:root:src/a.ts', 'repo:root:src/a.ts']));
  input.admission.sourceSelectionChecksum = input.selectionPlan.sourceSelectionChecksum;
  const result = reconcileSelectedSourceManifestV1(input);
  assert.equal(result.valid, false);
  assert.equal(result.checks.uniqueSourceIdentities, false);
});

test('rejects a source reference reused across repository identities', () => {
  const input = fixture();
  const binding = {
    ...input.selectionPlan.bindings[0],
    repositoryId: 'repo:vendor',
  };
  input.snapshot.sources.push({
    repositoryId: 'repo:vendor',
    repositoryRelativePath: binding.repositoryRelativePath,
    sourceRef: binding.sourceRef,
    sourceRevision: binding.codeSourceRevision,
    contentDigest: binding.contentHash,
    byteLength: binding.byteLength,
  });
  input.selectionPlan.bindings.push(binding);
  input.selectionPlan.sourceCount = 2;
  input.admission.sourceCount = 2;
  input.selectionPlan.sourceSelectionChecksum = checksum(JSON.stringify([
    'repo:root:src/a.ts',
    'repo:vendor:src/a.ts',
  ]));
  input.admission.sourceSelectionChecksum = input.selectionPlan.sourceSelectionChecksum;
  const result = reconcileSelectedSourceManifestV1(input);
  assert.equal(result.valid, false);
  assert.equal(result.checks.uniqueSourceRefs, false);
});

test('rejects a selection plan from a different snapshot revision', () => {
  const input = fixture();
  input.selectionPlan.snapshotRevision = `sha256:${'b'.repeat(64)}`;
  const result = reconcileSelectedSourceManifestV1(input);
  assert.equal(result.valid, false);
  assert.equal(result.checks.snapshotRevisionMatches, false);
});

test('rejects an admitted workspace revision that differs from the plan candidate', () => {
  const input = fixture();
  input.admission.workspaceRevision = checksum('different-workspace');
  const result = reconcileSelectedSourceManifestV1(input);
  assert.equal(result.valid, false);
  assert.equal(result.checks.admissionWorkspaceMatchesCandidate, false);
});
