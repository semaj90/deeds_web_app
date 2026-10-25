import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { validateCanonicalGraphifySnapshotBindingV1 } from './canonical-graphify-snapshot-binding-v1.mjs';

const root = 'C:/repo';
const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
const snapshot = { workspaceId, snapshotRevision: `sha256:${'a'.repeat(64)}` };
const manifestPath = resolve(root, 'docs/reports/workspace-source-snapshots', `${'a'.repeat(64)}.json`);

test('accepts an exact canonical workspace and immutable snapshot location', () => {
  assert.deepEqual(validateCanonicalGraphifySnapshotBindingV1({ snapshot, expectedWorkspaceId: workspaceId, manifestPath, root }), {
    valid: true,
    reason: null,
    workspaceId,
    canonicalManifestPath: manifestPath,
  });
});

test('rejects scratch workspace namespaces', () => {
  const result = validateCanonicalGraphifySnapshotBindingV1({
    snapshot: { ...snapshot, workspaceId: 'scratch-ns7-20261025T065105Z' }, expectedWorkspaceId: workspaceId, manifestPath, root,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'SNAPSHOT_WORKSPACE_ID_NOT_CANONICAL_UUID');
});

test('rejects a different canonical workspace', () => {
  const result = validateCanonicalGraphifySnapshotBindingV1({
    snapshot: { ...snapshot, workspaceId: '8b2d0f13-2fe5-4e44-8b25-19ea1637c29a' }, expectedWorkspaceId: workspaceId, manifestPath, root,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'SNAPSHOT_WORKSPACE_ID_MISMATCH');
});

test('rejects snapshots outside the canonical admission store', () => {
  const result = validateCanonicalGraphifySnapshotBindingV1({
    snapshot, expectedWorkspaceId: workspaceId, manifestPath: `${root}/.tmp/snapshot.json`, root,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'SNAPSHOT_MANIFEST_NOT_IN_CANONICAL_ADMISSION_STORE');
});
