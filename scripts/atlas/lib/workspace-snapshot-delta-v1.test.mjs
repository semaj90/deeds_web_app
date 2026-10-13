import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVerifiedWorkspaceSnapshotsV1 } from './workspace-snapshot-delta-v1.mjs';

const source = (name, content = 'a'.repeat(64)) => ({
  sourceIdentityKey: `repo:root:${name}`,
  sourceRef: name,
  sourceRevision: `sha256:${content}`,
  contentDigest: content,
  byteLength: 12,
});

const snapshot = (sources, overrides = {}) => ({
  schema: 'atlas.workspace-source-snapshot-capture.v1',
  snapshotRevision: 'sha256:snapshot',
  workspaceRevision: null,
  workspaceId: 'workspace',
  repositoryRoot: 'C:/workspace',
  policy: { revision: 'policy-v1' },
  repositories: [{ relativePath: '', kind: 'ROOT' }],
  sources,
  status: 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK',
  canonicalAuthority: false,
  datastoreWritesPerformed: false,
  ...overrides,
});

test('reports exact adds, modifications, and deletions between verified snapshots', () => {
  const before = snapshot([source('keep.ts'), source('change.ts'), source('remove.ts')]);
  const after = snapshot([source('keep.ts'), source('change.ts', 'b'.repeat(64)), source('add.ts')]);
  const result = compareVerifiedWorkspaceSnapshotsV1(before, after);
  assert.equal(result.status, 'SNAPSHOT_DELTA_VERIFIED_NOT_ADMITTED');
  assert.deepEqual(result.changes.map(({ operation, sourceRef }) => [operation, sourceRef]), [
    ['ADD', 'add.ts'], ['MODIFY', 'change.ts'], ['DELETE', 'remove.ts'],
  ]);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('treats renames as an explicit delete and add without guessing identity continuity', () => {
  const result = compareVerifiedWorkspaceSnapshotsV1(
    snapshot([source('old.ts')]),
    snapshot([source('new.ts')]),
  );
  assert.deepEqual(result.changes.map(({ operation, sourceRef }) => [operation, sourceRef]), [
    ['ADD', 'new.ts'], ['DELETE', 'old.ts'],
  ]);
});

test('requires full capture when policy or repository membership changes', () => {
  const before = snapshot([source('a.ts')]);
  assert.equal(compareVerifiedWorkspaceSnapshotsV1(before, snapshot([source('a.ts')], {
    policy: { revision: 'policy-v2' },
  })).reason, 'SOURCE_SELECTION_POLICY_CHANGED');
  assert.equal(compareVerifiedWorkspaceSnapshotsV1(before, snapshot([source('a.ts')], {
    repositories: [{ relativePath: '', kind: 'ROOT' }, { relativePath: 'vendor/x', kind: 'NESTED' }],
  })).reason, 'REPOSITORY_SET_CHANGED');
});

test('fails closed on unverified receipts, duplicate identities, and identity-path conflicts', () => {
  const before = snapshot([source('a.ts')]);
  assert.equal(compareVerifiedWorkspaceSnapshotsV1(before, snapshot([source('a.ts')], {
    status: 'CAPTURE_BLOCKED',
  })).reason, 'SNAPSHOT_RECEIPT_NOT_VERIFIED');
  assert.equal(compareVerifiedWorkspaceSnapshotsV1(snapshot([source('a.ts'), source('a.ts')]), before).reason,
    'SNAPSHOT_SOURCE_IDENTITY_DUPLICATE');
  assert.equal(compareVerifiedWorkspaceSnapshotsV1(before, snapshot([{ ...source('b.ts'), sourceIdentityKey: 'repo:root:a.ts' }])).reason,
    'SOURCE_IDENTITY_PATH_CONFLICT');
});
