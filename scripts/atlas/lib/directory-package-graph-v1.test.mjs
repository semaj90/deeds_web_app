import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectoryPackageGraphV1, traverseDirectoryPackageGraphV1 } from './directory-package-graph-v1.mjs';

const dirs = [{ directoryPath: '.' }, { directoryPath: 'src' }, { directoryPath: 'src/lib' }];
const refs = [{ sourcePath: 'src/lib/a.ts', sourceSha256: 'a'.repeat(64), startByte: 0, endByte: 5,
  ecosystem: 'npm', packageName: 'zod', importSpecifier: 'zod', line1: 1, evidenceStatus: 'ADVISORY_REGEX_SPAN' }];

test('builds deterministic local graph and traverses directory to file to package', () => {
  const first = buildDirectoryPackageGraphV1({ directories: dirs, references: refs });
  const second = buildDirectoryPackageGraphV1({ directories: [...dirs].reverse(), references: [...refs].reverse() });
  assert.deepEqual(first, second);
  const result = traverseDirectoryPackageGraphV1({ nodes: first.nodes, edges: first.edges,
    startNodeKey: 'dir:src/lib', maxHops: 2, maxFanout: 4 });
  assert.deepEqual(result.reached.map(row => row.nodeType), ['FILE', 'PACKAGE']);
  assert.deepEqual(result.reached[1].edgePath, ['CONTAINS', 'USES_PACKAGE_CANDIDATE']);
});

test('fails closed on missing directory membership, conflicting source bytes, and traversal bounds', () => {
  assert.throws(() => buildDirectoryPackageGraphV1({ directories: [{ directoryPath: '.' }], references: refs }), /SOURCE_PARENT_NOT_IN_DIRECTORY_SNAPSHOT/);
  assert.throws(() => buildDirectoryPackageGraphV1({ directories: dirs, references: [...refs, { ...refs[0], sourceSha256: 'b'.repeat(64), startByte: 8, endByte: 9 }] }), /SOURCE_REVISION_CONFLICT/);
  const graph = buildDirectoryPackageGraphV1({ directories: dirs, references: refs });
  assert.throws(() => traverseDirectoryPackageGraphV1({ nodes: graph.nodes, edges: graph.edges,
    startNodeKey: 'dir:src', maxHops: 5 }), /TRAVERSAL_BOUNDS_INVALID/);
});

test('reports deterministic fanout truncation rather than silently dropping neighbors', () => {
  const many = ['alpha', 'beta', 'gamma'].map((packageName, index) => ({ ...refs[0], packageName,
    startByte: index * 8, endByte: index * 8 + 5 }));
  const graph = buildDirectoryPackageGraphV1({ directories: dirs, references: many });
  const result = traverseDirectoryPackageGraphV1({ nodes: graph.nodes, edges: graph.edges,
    startNodeKey: 'file:src/lib/a.ts', maxHops: 1, maxFanout: 1 });
  assert.equal(result.fanoutTruncated, true);
  assert.equal(result.reached.length, 1);
});
