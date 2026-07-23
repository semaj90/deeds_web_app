import assert from 'node:assert/strict';
import { test } from 'node:test';

const { GraphSnapshotV2Schema, GraphResolutionIssueV2Schema, GraphAuthorityRunV2Schema, assertAuthorityRunCanPersist } = await import('../dist/index.js');

const snapshot = {
  snapshotId: '33333333-3333-4333-8333-333333333333', schemaVersion: 'atlas.graph.v2', sourceManifest: {}, projectionPolicy: {},
  sourceHash: 'source', topologyHash: 'topology', policyHash: 'policy', eligibilityPredicate: 'packet_key IS NOT NULL'
};

const run = {
  runId: '44444444-4444-4444-8444-444444444444', snapshotId: snapshot.snapshotId, engine: 'networkx', algorithmVersion: '3.x', configuration: {},
  topologyHash: 'topology', nodeCount: 1, edgeCount: 0, resultHash: 'result', didConverge: true, ranIterations: 1,
  startedAt: '2026-07-23T00:00:00.000Z', completedAt: '2026-07-23T00:00:01.000Z'
};

test('V2 contracts require immutable snapshot identity and bounded issue state', () => {
  assert.doesNotThrow(() => GraphSnapshotV2Schema.parse(snapshot));
  assert.doesNotThrow(() => GraphResolutionIssueV2Schema.parse({ snapshotId: snapshot.snapshotId, issueFingerprint: 'f', issueType: 'MISSING_PACKET_KEY', issueStatus: 'OPEN', exclusionStage: 'identity', topologyHash: 'topology' }));
  assert.throws(() => GraphResolutionIssueV2Schema.parse({ snapshotId: snapshot.snapshotId, issueFingerprint: 'f', issueType: 'MISSING_PACKET_KEY', issueStatus: 'UNKNOWN', exclusionStage: 'identity', topologyHash: 'topology' }));
});

test('V2 authority runs require a validated matching snapshot', () => {
  assert.doesNotThrow(() => assertAuthorityRunCanPersist({ status: 'VALIDATED', topologyHash: 'topology' }, GraphAuthorityRunV2Schema.parse(run)));
  assert.throws(() => assertAuthorityRunCanPersist({ status: 'BUILDING', topologyHash: 'topology' }, GraphAuthorityRunV2Schema.parse(run)));
  assert.throws(() => assertAuthorityRunCanPersist({ status: 'VALIDATED', topologyHash: 'other' }, GraphAuthorityRunV2Schema.parse(run)));
});
