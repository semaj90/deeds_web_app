import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenSpecDomainCandidateGraphV1, traverseOpenSpecDomainCandidateGraphV1 } from './openspec-domain-candidate-graph-v1.mjs';

const digest = 'a'.repeat(64);
const baseNodes = [
  { ordinal: 0, nodeKey: 'task:demo:1', nodeType: 'TASK_CANDIDATE', taskRef: 'openspec/demo/tasks.md#L1' },
  { ordinal: 1, nodeKey: 'file:src/a.ts', nodeType: 'FILE', relativePath: 'src/a.ts', sourceSha256: digest },
  { ordinal: 2, nodeKey: 'package:npm:zod', nodeType: 'PACKAGE' },
];
const baseEdges = [
  { sourceOrdinal: 0, targetOrdinal: 1, edgeType: 'OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE' },
  { sourceOrdinal: 1, targetOrdinal: 2, edgeType: 'USES_PACKAGE_CANDIDATE' },
];
const taskPathRows = [{ resolutionStatus: 'EXACT_REPO_ROOT_FILE', targetPath: 'src/a.ts', targetFileSha256: digest,
  targetDirectoryPath: 'src', targetDirectorySummarySha256: digest, targetDirectoryInputDigest: 'b'.repeat(64) }];
const summaryRows = [{ relativePath: 'src', summarySha256: digest, inputDigest: 'b'.repeat(64) }];
const domainRows = [{ relativePath: 'src', summarySha256: digest, inputDigest: 'b'.repeat(64), status: 'PROPOSAL_ONLY',
  candidateGroupId: 'runtime', candidateKind: 'DIRECT_MATCH', score: 3, matchedPathTermsJson: '["src"]' }];

test('builds deterministic bounded task-file-directory-domain candidate traversal', () => {
  const first = buildOpenSpecDomainCandidateGraphV1({ baseNodes, baseEdges, taskPathRows, summaryRows, domainRows });
  const second = buildOpenSpecDomainCandidateGraphV1({ baseNodes: [...baseNodes].reverse(), baseEdges,
    taskPathRows, summaryRows, domainRows });
  assert.deepEqual(first, second);
  const traversal = traverseOpenSpecDomainCandidateGraphV1({ nodes: first.nodes, edges: first.edges,
    startNodeKey: 'task:demo:1', maxHops: 3, maxFanout: 8 });
  assert.equal(traversal.reached.some(row => row.nodeKey === 'domain-candidate:runtime'), true);
  assert.equal(traversal.reached.find(row => row.nodeKey === 'domain-candidate:runtime').edgePath.length, 3);
  assert.equal(traversal.canonicalAuthority, false);
  assert.equal(first.edges.find(edge => edge.edgeType === 'DIRECTORY_DOMAIN_CANDIDATE').evidenceStatus,
    'SUMMARY_DERIVED_PROPOSAL_ONLY');
});

test('rejects stale summary lineage, missing files, and invalid domain candidates', () => {
  assert.throws(() => buildOpenSpecDomainCandidateGraphV1({ baseNodes, baseEdges, taskPathRows,
    summaryRows: [{ ...summaryRows[0], inputDigest: 'c'.repeat(64) }], domainRows }), /LINEAGE_MISMATCH/);
  assert.throws(() => buildOpenSpecDomainCandidateGraphV1({ baseNodes: [baseNodes[0]], baseEdges: [],
    taskPathRows, summaryRows, domainRows }), /TASK_FILE_GRAPH_NODE_MISSING/);
  assert.throws(() => buildOpenSpecDomainCandidateGraphV1({ baseNodes, baseEdges, taskPathRows, summaryRows,
    domainRows: [{ ...domainRows[0], candidateKind: 'CANONICAL' }] }), /DOMAIN_CANDIDATE_ROW_INVALID/);
});

test('does not add graph edges for unresolved paths or unclassified domain rows', () => {
  const graph = buildOpenSpecDomainCandidateGraphV1({ baseNodes, baseEdges,
    taskPathRows: [{ ...taskPathRows[0], resolutionStatus: 'PATH_NOT_FOUND' }], summaryRows,
    domainRows: [{ relativePath: 'src', summarySha256: digest, inputDigest: 'b'.repeat(64), status: 'UNCLASSIFIED_NO_DOMAIN_SIGNAL',
      candidateGroupId: '', candidateKind: 'NO_MATCH', score: 0 }] });
  assert.equal(graph.edges.some(edge => edge.edgeType === 'DIRECTORY_DOMAIN_CANDIDATE'), false);
  assert.equal(graph.edges.some(edge => edge.edgeType === 'FILE_PARENT_DIRECTORY_CANDIDATE'), false);
});

test('preserves distinct package import spans while deduplicating identical graph edges', () => {
  const graph = buildOpenSpecDomainCandidateGraphV1({ baseNodes,
    baseEdges: [...baseEdges, { ...baseEdges[1], startByte: 40, endByte: 43, importSpecifier: 'zod' }, baseEdges[1]],
    taskPathRows, summaryRows, domainRows });
  assert.equal(graph.edges.filter(edge => edge.edgeType === 'USES_PACKAGE_CANDIDATE').length, 2);
  assert.equal(graph.edges.filter(edge => edge.edgeType === 'FILE_PARENT_DIRECTORY_CANDIDATE').length, 1);
});
