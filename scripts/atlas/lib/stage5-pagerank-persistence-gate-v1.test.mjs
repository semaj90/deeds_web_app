import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePageRankReferenceV1, decidePageRankPersistenceV1 } from './stage5-pagerank-persistence-gate-v1.mjs';
import { STAGE5_PAGERANK_CONFIGURATION_V1, computePageRankV1 } from './stage5-pagerank-core-v1.mjs';

const topologyHash = 'a'.repeat(64);
const snapshotId = 'snapshot-1';
const source = 'frozen_snapshot_json';
const frozenSnapshot = {
  graphSnapshot: {
    snapshotId,
    topologyHash,
    sourceManifest: {
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      sourceInventorySnapshotId: 'inventory-1',
    },
  },
};
const localScores = new Map([['node-a', 0.75], ['node-b', 0.25]]);
const reference = {
  status: 'NETWORKX_REFERENCE_PROVEN',
  engine: 'networkx',
  snapshot_id: snapshotId,
  topology_hash: topologyHash,
  configuration: STAGE5_PAGERANK_CONFIGURATION_V1,
  scores: [
    { nodeKey: 'node-a', pagerankRaw: 0.75 },
    { nodeKey: 'node-b', pagerankRaw: 0.25 },
  ],
};

test('parity requires exact snapshot, topology and all node scores', () => {
  assert.equal(comparePageRankReferenceV1({ localScores, reference, snapshotId, topologyHash }).status, 'PARITY_PROVEN');
  assert.equal(comparePageRankReferenceV1({ localScores, reference: { ...reference, snapshot_id: 'other' }, snapshotId, topologyHash }).status, 'PARITY_NOT_PROVEN');
  assert.equal(comparePageRankReferenceV1({ localScores, reference: { ...reference, scores: [{ nodeKey: 'node-a', pagerankRaw: 0.4 }] }, snapshotId, topologyHash }).status, 'PARITY_NOT_PROVEN');
  assert.ok(comparePageRankReferenceV1({ localScores, reference, snapshotId, topologyHash, tolerance: Number.NaN }).reasons.includes('NETWORKX_REFERENCE_TOLERANCE_INVALID'));
});

test('persistence requires apply, successful validation, parity, and revision-bound frozen input', () => {
  const passed = { validationPassed: true, parity: { status: 'PARITY_PROVEN' }, source, frozenSnapshot };
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: false }).writesAllowed, false);
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, validationPassed: false }).writesAllowed, false);
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, parity: { status: 'PARITY_NOT_PROVEN' } }).writesAllowed, false);
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true }).status, 'READY_TO_APPLY');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { graphSnapshot: { ...frozenSnapshot.graphSnapshot, sourceManifest: {} } } }).status, 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED');
});

test('PageRank redistributes dangling mass and treats duplicate edges as one directed edge', () => {
  const edges = [{ source: 'a', target: 'b' }, { source: 'a', target: 'b' }];
  const scores = computePageRankV1({ nodes: ['c', 'b', 'a'], edges });
  assert.ok(Math.abs([...scores.values()].reduce((sum, score) => sum + score, 0) - 1) < 1e-12);
  assert.deepEqual([...scores.keys()], ['a', 'b', 'c']);
  assert.deepEqual([...scores], [...computePageRankV1({ nodes: ['a', 'b', 'c'], edges: [edges[0]] })]);
  assert.throws(() => computePageRankV1({ nodes: ['a'], edges: [{ source: 'a', target: 'missing' }] }), /PAGERANK_EDGE_ENDPOINT_UNKNOWN/);
});

test('NetworkX parity rejects receipts with different algorithm parameters', () => {
  const mismatched = { ...reference, configuration: { ...STAGE5_PAGERANK_CONFIGURATION_V1, max_iter: STAGE5_PAGERANK_CONFIGURATION_V1.max_iter + 1 } };
  assert.ok(comparePageRankReferenceV1({ localScores, reference: mismatched, snapshotId, topologyHash }).reasons.includes('NETWORKX_REFERENCE_CONFIGURATION_MISMATCH'));
  const reordered = { ...reference, configuration: Object.fromEntries(Object.entries(STAGE5_PAGERANK_CONFIGURATION_V1).reverse()) };
  assert.equal(comparePageRankReferenceV1({ localScores, reference: reordered, snapshotId, topologyHash }).status, 'PARITY_PROVEN');
});
