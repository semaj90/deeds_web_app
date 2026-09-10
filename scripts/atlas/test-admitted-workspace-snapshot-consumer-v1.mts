#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildAdmittedSnapshotConsumptionPlanV1 } from './lib/admitted-workspace-snapshot-consumer-v1.mts';

const hash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const sourceRevisionA = `sha256:${'a'.repeat(64)}`;
const sourceRevisionB = `sha256:${'b'.repeat(64)}`;
const workspaceRevision = `sha256:${'c'.repeat(64)}`;
const snapshotBody = {
  workspaceId: '625743d2-092b-4fa8-abe0-9dc094920c80',
  repositoryRoot: 'C:/repo',
  policy: { revision: 'atlas.workspace-snapshot-capture.v1' },
  repositories: [
    { relativePath: '', kind: 'ROOT', head: '1'.repeat(40) },
    { relativePath: 'nested', kind: 'NESTED_GIT_REPOSITORY', head: '2'.repeat(40) },
  ],
  sources: [
    {
      sourceRef: 'src/a.ts',
      repositoryId: 'repo:root',
      repositoryRelativePath: 'src/a.ts',
      sourceIdentityKey: 'repo:root:src/a.ts',
      sourceRevision: sourceRevisionA,
      contentDigest: 'a'.repeat(64),
      byteLength: 10,
      repositoryPath: '',
    },
    {
      sourceRef: 'nested/src/a.ts',
      repositoryId: 'repo:nested',
      repositoryRelativePath: 'src/a.ts',
      sourceIdentityKey: 'repo:nested:src/a.ts',
      sourceRevision: sourceRevisionB,
      contentDigest: 'b'.repeat(64),
      byteLength: 20,
      repositoryPath: 'nested',
    },
  ],
  violations: [],
  sourceMembershipChecksum: hash(['repo:nested:src/a.ts', 'repo:root:src/a.ts'].sort()),
  sourceContentChecksum: 'unused-by-consumption-plan',
};
const snapshotRevision = hash(snapshotBody);
const snapshot = {
  schema: 'atlas.workspace-source-snapshot-capture.v1',
  ...snapshotBody,
  snapshotRevision,
  workspaceRevision: null,
  status: 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK',
  canonicalAuthority: false,
  datastoreWritesPerformed: false,
};

const admission = {
  schema: 'atlas.workspace-revision-tournament-admission.v1',
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
  authority: true,
  workspaceRevision,
  snapshotRevision,
  sourceCount: 2,
  sourceSelectionChecksum: snapshotBody.sourceMembershipChecksum,
  graphifyExecutionAuthorized: false,
  projectionWritesAuthorized: false,
};

const ready = buildAdmittedSnapshotConsumptionPlanV1({ admission, snapshot });
assert.equal(ready.status, 'ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED');
assert.equal(ready.executionAuthorizedByAdmission, false);
assert.equal(ready.bindings.length, 2);
assert.equal(ready.materializedPathCount, 2);
assert.deepEqual(ready.blockers, []);
assert.notEqual(ready.coordinatorSourceSelectionChecksum, ready.snapshotMembershipChecksum);
assert.match(ready.canonicalTupleChecksum ?? '', /^sha256:[a-f0-9]{64}$/);

const authorized = buildAdmittedSnapshotConsumptionPlanV1({
  admission: { ...admission, graphifyExecutionAuthorized: true },
  snapshot,
});
assert.equal(authorized.status, 'ADMITTED_SNAPSHOT_CONSUMPTION_READY_AUTHORIZED');

const badSnapshotRevision = buildAdmittedSnapshotConsumptionPlanV1({
  admission: { ...admission, snapshotRevision: `sha256:${'d'.repeat(64)}` },
  snapshot,
});
assert.ok(badSnapshotRevision.blockers.includes('ADMISSION_SNAPSHOT_REVISION_MISMATCH'));
assert.equal(badSnapshotRevision.status, 'ADMITTED_SNAPSHOT_CONSUMPTION_BLOCKED');

const badCount = buildAdmittedSnapshotConsumptionPlanV1({
  admission: { ...admission, sourceCount: 3 },
  snapshot,
});
assert.ok(badCount.blockers.includes('ADMISSION_SOURCE_COUNT_MISMATCH'));

const duplicateMaterializedPath = buildAdmittedSnapshotConsumptionPlanV1({
  admission,
  snapshot: {
    ...snapshot,
    sources: [snapshot.sources[0], { ...snapshot.sources[1], sourceRef: snapshot.sources[0].sourceRef }],
  },
});
assert.ok(duplicateMaterializedPath.blockers.includes('DUPLICATE_MATERIALIZED_SOURCE_PATH'));

const badIdentity = buildAdmittedSnapshotConsumptionPlanV1({
  admission,
  snapshot: {
    ...snapshot,
    sources: [{ ...snapshot.sources[0], sourceIdentityKey: 'repo:wrong:src/a.ts' }, snapshot.sources[1]],
  },
});
assert.ok(badIdentity.blockers.includes('SOURCE_0_IDENTITY_KEY_MISMATCH'));

console.log(JSON.stringify({
  schema: 'atlas.admitted-workspace-snapshot-consumer-smoke.v1',
  status: 'PASSED',
  tests: 6,
  proves: [
    'admitted snapshot can be converted to repository-qualified bindings without live-origin rescan',
    'source authority does not imply Graphify execution authorization',
    'snapshot/admission revision mismatch fails closed',
    'source-count mismatch fails closed',
    'workspace-relative materialized source_ref paths must remain unique',
    'sourceIdentityKey must exactly equal repositoryId:repositoryRelativePath',
  ],
  writesPerformed: false,
}, null, 2));
