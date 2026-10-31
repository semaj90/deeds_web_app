import assert from 'node:assert/strict';
import test from 'node:test';

const { reviewTopologySnapshotBindingV1 } = await import('../src/core/topology-snapshot-binding-v1.ts');

const snapshotId = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';
const snapshot = {
  snapshotId,
  status: 'VALIDATED',
  graphRevision: 'a'.repeat(64),
  topologyHash: 'b'.repeat(64),
  revisionChecksum: 'c'.repeat(64),
};
const topology = { snapshotId, topologyHash: snapshot.topologyHash, nodeCount: 2, edgeCount: 3, contentDigest: 'd'.repeat(64) };
const pageRank = {
  runId, snapshotId, status: 'PASSED', topologyHash: snapshot.topologyHash,
  algorithmVersion: 'stage5-networkx-compatible-pagerank-v2', resultHash: 'e'.repeat(64), nodeCount: 2, edgeCount: 3, scoreCount: 2,
};
const readback = {
  status: 'VERIFIED', snapshotRevisionChecksum: snapshot.revisionChecksum,
  topologyContentDigest: topology.contentDigest, pageRankResultHash: pageRank.resultHash,
  pageRankRunId: runId, pageRankAlgorithmVersion: pageRank.algorithmVersion,
  readerId: 'disposable-postgres-independent-reader-v1',
};
const legacyGraphSnapshotHashMapping = {
  status: 'APPROVED', semantics: 'REVISION_CHECKSUM', value: snapshot.revisionChecksum,
  ownerReceiptRef: 'fixture-owner-review-receipt',
};
const binding = {
  contractVersion: 'topology-snapshot-binding-v1',
  snapshot, topology, pageRank, readback, legacyGraphSnapshotHashMapping,
};

test('review accepts matching snapshot, topology, PageRank, mapping and readback as review-only', () => {
  assert.deepEqual(reviewTopologySnapshotBindingV1(binding), {
    status: 'CONSISTENT_FOR_REVIEW', blockers: [], writesAuthorized: false,
  });
});

test('review blocks superseded snapshots and cross-snapshot or topology mismatches', () => {
  const result = reviewTopologySnapshotBindingV1({
    ...binding,
    snapshot: { ...snapshot, status: 'SUPERSEDED' },
    topology: { ...topology, snapshotId: '55555555-5555-4555-8555-555555555555' },
    pageRank: { ...pageRank, topologyHash: 'f'.repeat(64) },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('SNAPSHOT_NOT_VALIDATED'));
  assert.ok(result.blockers.includes('TOPOLOGY_SNAPSHOT_MISMATCH'));
  assert.ok(result.blockers.includes('PAGERANK_TOPOLOGY_MISMATCH'));
  assert.equal(result.writesAuthorized, false);
});

test('review blocks missing PageRank identity, counts, algorithm and failed readback', () => {
  const result = reviewTopologySnapshotBindingV1({
    ...binding,
    pageRank: { ...pageRank, runId: '44444444-4444-4444-8444-444444444445', nodeCount: 1, edgeCount: 0, scoreCount: 0 },
    readback: { ...readback, status: 'MISMATCH', pageRankRunId: runId },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('PAGERANK_NODE_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('PAGERANK_EDGE_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('PAGERANK_SCORE_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('INDEPENDENT_READBACK_NOT_VERIFIED'));
  assert.ok(result.blockers.includes('READBACK_PAGERANK_RUN_MISMATCH'));
});

test('review rejects malformed bindings without treating schema-invalid fields as blockers', () => {
  assert.throws(() => reviewTopologySnapshotBindingV1({
    ...binding,
    pageRank: { ...pageRank, algorithmVersion: '' },
  }));
});

test('review does not infer the legacy graph_snapshot_hash meaning', () => {
  const result = reviewTopologySnapshotBindingV1({
    ...binding,
    legacyGraphSnapshotHashMapping: { status: 'UNRESOLVED', semantics: null, value: null, ownerReceiptRef: null },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('LEGACY_GRAPH_SNAPSHOT_HASH_MAPPING_UNAPPROVED'));
  assert.equal(result.writesAuthorized, false);
});

test('review rejects a mapping whose value contradicts its declared semantics', () => {
  const result = reviewTopologySnapshotBindingV1({
    ...binding,
    legacyGraphSnapshotHashMapping: { ...legacyGraphSnapshotHashMapping, value: 'f'.repeat(64) },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('LEGACY_GRAPH_SNAPSHOT_HASH_MAPPING_VALUE_MISMATCH'));
});
