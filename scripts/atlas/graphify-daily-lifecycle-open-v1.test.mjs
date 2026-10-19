import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./graphify-daily-lifecycle-open-v1.mjs', import.meta.url), 'utf8');

test('workspace revision mismatch is rejected before opening a Graphify run', () => {
  const materialize = source.indexOf('const materialized = materializeWorkspaceRevisionOriginV1({');
  const revisionGate = source.indexOf('GRAPHIFY_ADMITTED_WORKSPACE_REVISION_MISMATCH');
  const openRun = source.indexOf('const opened = await openGraphifyRunV1({');

  assert.ok(materialize >= 0);
  assert.ok(revisionGate > materialize);
  assert.ok(openRun > revisionGate);
});

test('materialized non-Git snapshots are rejected before opening a Graphify run', () => {
  const snapshotGuard = source.indexOf('GRAPHIFY_SNAPSHOT_MATERIALIZED_ROOT_REQUIRES_SNAPSHOT_NATIVE_COORDINATOR');
  const openRun = source.indexOf('const opened = await openGraphifyRunV1({');

  assert.ok(snapshotGuard >= 0);
  assert.ok(openRun > snapshotGuard);
});
