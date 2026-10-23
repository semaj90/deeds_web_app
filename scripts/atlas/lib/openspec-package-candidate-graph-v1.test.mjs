import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenSpecPackageCandidateGraphV1, traverseOpenSpecPackageCandidateGraphV1 } from './openspec-package-candidate-graph-v1.mjs';

const baseNodes = [
  { ordinal: 0, nodeKey: 'file:src/a.ts', nodeType: 'FILE', relativePath: 'src/a.ts', sourceSha256: 'abc', identityStatus: 'RUN_LOCAL' },
  { ordinal: 1, nodeKey: 'package:npm:zod', nodeType: 'PACKAGE', relativePath: '', sourceSha256: '', packageName: 'zod' },
];
const baseEdges = [{ sourceOrdinal: 0, targetOrdinal: 1, edgeType: 'USES_PACKAGE_CANDIDATE', evidenceStatus: 'ADVISORY_REGEX_SPAN',
  sourcePath: 'src/a.ts', sourceSha256: 'abc', importSpecifier: 'zod', startByte: 8, endByte: 11 }];
const taskRow = { taskRef: 'openspec/changes/demo/tasks.md#L4', taskKey: 'demo:4', taskBlockSha256: 'sha256:block',
  taskFileSha256: 'sha256:task-file', resolutionStatus: 'EXACT_REPO_ROOT_FILE', targetPath: 'src/a.ts', targetFileSha256: 'abc',
  evidenceSha256: 'path-digest', evidenceStartByte: 100, evidenceEndByte: 106, evidenceLine: 4 };

test('builds a deterministic advisory task to file to package path', () => {
  const first = buildOpenSpecPackageCandidateGraphV1({ packageNodes: baseNodes, packageEdges: baseEdges, taskPathRows: [taskRow] });
  const second = buildOpenSpecPackageCandidateGraphV1({ packageNodes: [...baseNodes].reverse(), packageEdges: [...baseEdges], taskPathRows: [taskRow] });
  assert.deepEqual(first, second);
  const task = first.nodes.find(node => node.nodeType === 'TASK_CANDIDATE');
  const path = traverseOpenSpecPackageCandidateGraphV1({ nodes: first.nodes, edges: first.edges, startNodeKey: task.nodeKey, maxHops: 2, maxFanout: 4 });
  assert.deepEqual(path.reached.map(row => row.nodeType), ['FILE', 'PACKAGE']);
  assert.deepEqual(path.reached[1].edgePath, ['OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE', 'USES_PACKAGE_CANDIDATE']);
  assert.equal(path.canonicalAuthority, false);
});

test('fails closed on package/task source digest conflict and missing edge endpoints', () => {
  assert.throws(() => buildOpenSpecPackageCandidateGraphV1({ packageNodes: baseNodes, packageEdges: baseEdges,
    taskPathRows: [{ ...taskRow, targetFileSha256: 'different' }] }), /DIGEST_CONFLICT/);
  assert.throws(() => buildOpenSpecPackageCandidateGraphV1({ packageNodes: baseNodes,
    packageEdges: [{ ...baseEdges[0], targetOrdinal: 99 }], taskPathRows: [] }), /ENDPOINT_INVALID/);
});

test('skips unresolved and non-exact references without manufacturing target nodes', () => {
  const graph = buildOpenSpecPackageCandidateGraphV1({ packageNodes: baseNodes, packageEdges: baseEdges,
    taskPathRows: [{ ...taskRow, resolutionStatus: 'PATH_NOT_FOUND' }] });
  assert.equal(graph.nodes.some(node => node.nodeType === 'TASK_CANDIDATE'), false);
  assert.equal(graph.edges.length, 1);
});
