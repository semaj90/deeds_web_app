import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { resolveAdmissionSnapshotManifestPathV1 } from './admission-snapshot-manifest-path-v1.mjs';

const root = path.resolve('repo-root');

test('uses the explicit admitted snapshot manifest path', () => {
  const result = resolveAdmissionSnapshotManifestPathV1(root, {
    manifestPath: path.join(root, '.tmp', 'run-a', 'snapshot.json'),
    snapshotRevision: `sha256:${'a'.repeat(64)}`,
  });

  assert.equal(result.manifestPath, path.join(root, '.tmp', 'run-a', 'snapshot.json'));
  assert.equal(result.relativePath, '.tmp/run-a/snapshot.json');
});

test('retains the legacy snapshot-revision path when manifestPath is absent', () => {
  const result = resolveAdmissionSnapshotManifestPathV1(root, {
    snapshotRevision: `sha256:${'b'.repeat(64)}`,
  });

  assert.equal(result.relativePath, `docs/reports/workspace-source-snapshots/${'b'.repeat(64)}.json`);
});

test('rejects a configured manifest outside the repository instead of falling back', () => {
  assert.throws(() => resolveAdmissionSnapshotManifestPathV1(root, {
    manifestPath: path.resolve(root, '..', 'outside.json'),
    snapshotRevision: `sha256:${'c'.repeat(64)}`,
  }), /ADMISSION_SNAPSHOT_MANIFEST_OUTSIDE_REPOSITORY/);
});

test('rejects missing snapshot identity and path', () => {
  assert.throws(() => resolveAdmissionSnapshotManifestPathV1(root, {}), /ADMISSION_SNAPSHOT_MANIFEST_PATH_MISSING/);
});
