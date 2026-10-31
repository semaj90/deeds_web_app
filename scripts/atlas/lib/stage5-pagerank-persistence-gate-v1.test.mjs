import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { comparePageRankReferenceV1, decidePageRankPersistenceV1 } from './stage5-pagerank-persistence-gate-v1.mjs';
import { STAGE5_PAGERANK_CONFIGURATION_V1, computePageRankV1 } from './stage5-pagerank-core-v1.mjs';
const { buildGraphSnapshotRevisionV1 } = await import('../../../packages/parent-atlas/src/core/graph-snapshot-revision-v1.ts');

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const stableJson = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
};

const topologyHash = 'a'.repeat(64);
const snapshotId = '33333333-3333-4333-8333-333333333333';
const source = 'frozen_snapshot_json';
const revision = buildGraphSnapshotRevisionV1({
  snapshotId,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
  sourceInventoryRevision: `sha256:${'c'.repeat(64)}`,
  sourceInventoryHash: 'c'.repeat(64),
  topologyHash,
  policyHash: 'e'.repeat(64),
  identityContractVersion: 'identity-v1',
  parserContractVersion: 'parser-v1',
  producerRevision: 'fixture-v1',
});
const nodeSourceRevisions = { 'node-a': `sha256:${'f'.repeat(64)}`, 'node-b': `sha256:${'0'.repeat(64)}` };
const scopePolicy = {
  expectedScopes: ['repo:root'],
  decisions: [{
    scope: 'repo:root', decision: 'CANONICAL_ADMITTED', membershipIncluded: true,
    pinnedCommit: '1'.repeat(40), currentHead: '1'.repeat(40), worktreeClean: true,
    decisionEvidenceRef: 'operator-decision:root', sourceAuthorityRepoId: 'deeds-web-app',
    repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48',
    sourceRevision: `sha256:${'2'.repeat(64)}`, sourceBytesSha256: '2'.repeat(64),
    sourceBytesReceiptRef: 'source-bytes:root', externalProvenanceRef: null,
    licensePolicyRef: null, exclusionPolicyRef: null,
  }],
};
const frozenSnapshot = {
  graphSnapshot: {
    snapshotId,
    topologyHash,
    policyHash: revision.policyHash,
    sourceManifest: {
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      sourceInventorySnapshotId: 'inventory-1',
      membershipScopes: ['repo:root'],
    },
  },
  nodes: Object.entries(nodeSourceRevisions).map(([nodeKey, sourceRevision]) => ({
    snapshotId,
    nodeKey,
    sourceRef: `src/${nodeKey}.ts`,
    sourceRevision,
    contentHash: sourceRevision.slice('sha256:'.length),
  })),
  proof: {
    sourceInventoryHash: revision.sourceInventoryHash,
    graphRevision: revision.graphRevision,
    revisionChecksum: revision.revisionChecksum,
    scopePolicy,
    scopePolicySha256: sha256(stableJson(scopePolicy)),
    nodeSourceRevisions,
    nodeSourceRevisionManifestSha256: sha256(stableJson(nodeSourceRevisions)),
  },
  revision,
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
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true }).status, 'BLOCKED_PERSISTED_LINEAGE_READBACK_UNIMPLEMENTED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true }).writesAllowed, false);
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { graphSnapshot: { ...frozenSnapshot.graphSnapshot, sourceManifest: {} } } }).status, 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, revision: undefined } }).status, 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, revision: { ...revision, topologyHash: '0'.repeat(64) } } }).status, 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, revision: { ...revision, sourceInventoryRevision: `sha256:${'0'.repeat(64)}` } } }).status, 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, revision: { ...revision, revisionChecksum: '0'.repeat(64) } } }).status, 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, nodes: undefined } }).status, 'BLOCKED_GRAPH_LINEAGE_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, nodes: [{ ...frozenSnapshot.nodes[0], sourceRevision: null }, frozenSnapshot.nodes[1]] } }).status, 'BLOCKED_GRAPH_LINEAGE_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, nodes: [{ ...frozenSnapshot.nodes[0], sourceRevision: `sha256:${'1'.repeat(64)}` }, frozenSnapshot.nodes[1]] } }).status, 'BLOCKED_GRAPH_LINEAGE_UNQUALIFIED');
  assert.equal(decidePageRankPersistenceV1({ ...passed, applyRequested: true, frozenSnapshot: { ...frozenSnapshot, proof: { ...frozenSnapshot.proof, scopePolicySha256: '0'.repeat(64) } } }).status, 'BLOCKED_GRAPH_LINEAGE_UNQUALIFIED');
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
