import assert from 'node:assert/strict';
import { test } from 'node:test';

const { GraphSnapshotV2Schema, GraphResolutionIssueV2Schema, GraphAuthorityRunV2Schema, assertAuthorityRunCanPersist, buildGraphSnapshotRevisionV1, createGraphSnapshotV2Repository } = await import('../dist/index.js');

const snapshotId = '33333333-3333-4333-8333-333333333333';
const topologyHash = 'a'.repeat(64);
const policyHash = 'b'.repeat(64);
const sourceInventoryHash = 'c'.repeat(64);
const revision = buildGraphSnapshotRevisionV1({
  snapshotId,
  workspaceRevision: `sha256:${'d'.repeat(64)}`,
  sourceInventoryRevision: `sha256:${sourceInventoryHash}`,
  identityContractVersion: 'identity-v1',
  parserContractVersion: 'parser-v1',
  sourceInventoryHash,
  topologyHash,
  policyHash,
  producerRevision: 'graph-snapshot-v2-test-v1',
});
const snapshot = {
  snapshotId, schemaVersion: 'atlas.graph.v2', sourceManifest: {}, projectionPolicy: {},
  sourceHash: sourceInventoryHash, topologyHash, policyHash, revision, eligibilityPredicate: 'packet_key IS NOT NULL'
};

const run = {
  runId: '44444444-4444-4444-8444-444444444444', snapshotId: snapshot.snapshotId, engine: 'networkx', algorithmVersion: '3.x', configuration: {},
  topologyHash: 'topology', nodeCount: 1, edgeCount: 0, resultHash: 'result', didConverge: true, ranIterations: 1,
  startedAt: '2026-07-23T00:00:00.000Z', completedAt: '2026-07-23T00:00:01.000Z'
};

test('V2 contracts require immutable snapshot identity and bounded issue state', () => {
  assert.doesNotThrow(() => GraphSnapshotV2Schema.parse(snapshot));
  assert.throws(() => GraphSnapshotV2Schema.parse({ ...snapshot, revision: { ...revision, topologyHash: 'e'.repeat(64) } }));
  assert.doesNotThrow(() => GraphResolutionIssueV2Schema.parse({ snapshotId: snapshot.snapshotId, issueFingerprint: 'f', issueType: 'MISSING_PACKET_KEY', issueStatus: 'OPEN', exclusionStage: 'identity', topologyHash: 'topology' }));
  assert.throws(() => GraphResolutionIssueV2Schema.parse({ snapshotId: snapshot.snapshotId, issueFingerprint: 'f', issueType: 'MISSING_PACKET_KEY', issueStatus: 'UNKNOWN', exclusionStage: 'identity', topologyHash: 'topology' }));
});

test('V2 authority runs require a validated matching snapshot', () => {
  assert.doesNotThrow(() => assertAuthorityRunCanPersist({ status: 'VALIDATED', topologyHash: 'topology' }, GraphAuthorityRunV2Schema.parse(run)));
  assert.throws(() => assertAuthorityRunCanPersist({ status: 'BUILDING', topologyHash: 'topology' }, GraphAuthorityRunV2Schema.parse(run)));
  assert.throws(() => assertAuthorityRunCanPersist({ status: 'VALIDATED', topologyHash: 'other' }, GraphAuthorityRunV2Schema.parse(run)));
});

test('snapshot writer persists the verified revision receipt without conflict overwrite', async () => {
  const calls = [];
  const repository = createGraphSnapshotV2Repository({
    query: async (sql, values) => { calls.push({ sql, values }); return { rowCount: 1 }; },
  });
  await repository.createBuildingSnapshot(snapshot);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /workspace_revision, source_inventory_revision, graph_revision, identity_contract_version, parser_contract_version, revision_checksum/);
  assert.doesNotMatch(calls[0].sql, /ON CONFLICT/i);
  assert.deepEqual(calls[0].values.slice(8), [
    revision.workspaceRevision,
    revision.sourceInventoryRevision,
    revision.graphRevision,
    revision.identityContractVersion,
    revision.parserContractVersion,
    revision.revisionChecksum,
  ]);
  await assert.rejects(repository.createBuildingSnapshot({ ...snapshot, revision: { ...revision, topologyHash: 'e'.repeat(64) } }));
  assert.equal(calls.length, 1);
});
