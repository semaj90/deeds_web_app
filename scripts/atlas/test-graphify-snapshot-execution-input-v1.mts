#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import {
  GRAPHIFY_SNAPSHOT_EXECUTION_FORBIDDEN_LIVE_FIELDS_V1,
  validateGraphifySnapshotExecutionInputV1,
} from './lib/graphify-snapshot-execution-input-v1.mts';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const snapshotRevision = `sha256:${'b'.repeat(64)}`;
const sourceCohortChecksum = `sha256:${'c'.repeat(64)}`;
const selectionChecksum = `sha256:${'d'.repeat(64)}`;
const materializedRoot = path.resolve('.tmp/workspace-source-snapshots', snapshotRevision.slice(7));

const valid = validateGraphifySnapshotExecutionInputV1({
  workspaceRevision,
  snapshotRevision,
  materializedRoot,
  sourceCount: 25267,
  repositoryCount: 7,
  sourceCohortChecksum,
  selectionChecksum,
  admissionReceiptRef: 'docs/reports/workspace-revision-tournament-admission-v1.json',
});
assert.equal(valid.valid, true);
assert.equal(valid.blockers.length, 0);
assert.equal(valid.input?.workspaceRevision, workspaceRevision);

for (const forbidden of GRAPHIFY_SNAPSHOT_EXECUTION_FORBIDDEN_LIVE_FIELDS_V1) {
  const rejected = validateGraphifySnapshotExecutionInputV1({
    workspaceRevision,
    snapshotRevision,
    materializedRoot,
    sourceCount: 25267,
    repositoryCount: 7,
    sourceCohortChecksum,
    selectionChecksum,
    admissionReceiptRef: 'docs/reports/workspace-revision-tournament-admission-v1.json',
    [forbidden]: forbidden === 'discoverRepositories' ? true : 'forbidden',
  });
  assert.equal(rejected.valid, false, `${forbidden} must be rejected`);
  assert.ok(rejected.blockers.some((value) => value.startsWith('SNAPSHOT_EXECUTION_INPUT_UNKNOWN_FIELDS:')));
}

const wrongRoot = validateGraphifySnapshotExecutionInputV1({
  workspaceRevision,
  snapshotRevision,
  materializedRoot: path.resolve('.tmp/workspace-source-snapshots/not-the-snapshot'),
  sourceCount: 25267,
  repositoryCount: 7,
  sourceCohortChecksum,
  selectionChecksum,
  admissionReceiptRef: 'docs/reports/workspace-revision-tournament-admission-v1.json',
});
assert.equal(wrongRoot.valid, false);
assert.ok(wrongRoot.blockers.includes('SNAPSHOT_EXECUTION_MATERIALIZED_ROOT_NOT_REVISION_ADDRESSED'));

const badReceipt = validateGraphifySnapshotExecutionInputV1({
  workspaceRevision,
  snapshotRevision,
  materializedRoot,
  sourceCount: 25267,
  repositoryCount: 7,
  sourceCohortChecksum,
  selectionChecksum,
  admissionReceiptRef: '../escape.json',
});
assert.equal(badReceipt.valid, false);
assert.ok(badReceipt.blockers.includes('SNAPSHOT_EXECUTION_ADMISSION_RECEIPT_REF_INVALID'));

console.log(JSON.stringify({
  schema: 'atlas.graphify-snapshot-execution-input-smoke.v1',
  status: 'PASSED',
  tests: 11,
  proves: [
    'frozen snapshot execution envelope accepts only admitted inputs',
    'workspaceRoot/liveRoot/current HEAD/repository discovery fields are structurally rejected',
    'materialized root must be revision-addressed by snapshotRevision',
    'admission receipt reference must remain repository-relative and traversal-free',
  ],
  writesPerformed: false,
}, null, 2));
