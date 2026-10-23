import test from 'node:test';
import assert from 'node:assert/strict';
import { tableFromArrays, tableFromIPC } from 'apache-arrow';
import { buildDirectoryRollupV1 } from './directory-intelligence-rollup-v1.mjs';

function makeInput(rows) {
  const columns = {
    relativePath: [], entryKind: [], role: [], sizeBytes: [], sizeBytesPresent: [],
    mappedLanguageId: [], mappedLanguagePresent: [], indexingStatus: [],
  };
  for (const row of rows) for (const name of Object.keys(columns)) columns[name].push(row[name]);
  return tableFromArrays(columns);
}

const rows = [
  { relativePath: '.', entryKind: 'DIRECTORY', role: 'DIRECTORY', sizeBytes: '', sizeBytesPresent: false, mappedLanguageId: '', mappedLanguagePresent: false, indexingStatus: 'NOT_APPLICABLE' },
  { relativePath: 'pkg', entryKind: 'DIRECTORY', role: 'DIRECTORY', sizeBytes: '', sizeBytesPresent: false, mappedLanguageId: '', mappedLanguagePresent: false, indexingStatus: 'NOT_APPLICABLE' },
  { relativePath: 'pkg/sub', entryKind: 'DIRECTORY', role: 'DIRECTORY', sizeBytes: '', sizeBytesPresent: false, mappedLanguageId: '', mappedLanguagePresent: false, indexingStatus: 'NOT_APPLICABLE' },
  { relativePath: 'pkg/a.ts', entryKind: 'FILE', role: 'WORKTREE_FILE', sizeBytes: '10', sizeBytesPresent: true, mappedLanguageId: 'typescript', mappedLanguagePresent: true, indexingStatus: 'IN_GIT_SOURCE_SCOPE' },
  { relativePath: 'pkg/sub/b.py', entryKind: 'FILE', role: 'WORKTREE_FILE', sizeBytes: '', sizeBytesPresent: false, mappedLanguageId: 'python', mappedLanguagePresent: true, indexingStatus: 'IN_GIT_SOURCE_SCOPE' },
  { relativePath: 'pkg/alias', entryKind: 'SYMLINK_OR_JUNCTION', role: 'LINK_ONLY', sizeBytes: '', sizeBytesPresent: false, mappedLanguageId: '', mappedLanguagePresent: false, indexingStatus: 'NOT_IN_GIT_SOURCE_SCOPE' },
];

test('directory rollup is deterministic and computes parent/subtree metadata', () => {
  const first = buildDirectoryRollupV1(makeInput(rows));
  const replay = buildDirectoryRollupV1(makeInput(rows));
  assert.deepEqual(Buffer.from(first.directoryBytes), Buffer.from(replay.directoryBytes));
  assert.deepEqual(Buffer.from(first.edgeBytes), Buffer.from(replay.edgeBytes));
  const directories = tableFromIPC(first.directoryBytes);
  const edges = tableFromIPC(first.edgeBytes);
  assert.equal(first.pathCount, rows.length);
  assert.equal(first.directoryCount, 3);
  assert.equal(first.edgeCount, rows.length - 1);
  assert.equal(first.unresolvedParentCount, 0);
  const root = directories.getChild('directoryPath').indexOf('.');
  const pkg = directories.getChild('directoryPath').indexOf('pkg');
  assert.equal(directories.getChild('subtreeFileCount').get(root), 2);
  assert.equal(directories.getChild('subtreeDirectoryCount').get(root), 2);
  assert.equal(directories.getChild('subtreeLinkCount').get(root), 1);
  assert.equal(directories.getChild('subtreeFileBytes').get(root), '10');
  assert.equal(directories.getChild('directChildCount').get(pkg), 3);
  assert.equal(directories.getChild('subtreeFileCount').get(pkg), 2);
  assert.equal(directories.getChild('dominantProfileLanguageId').get(pkg), 'python');
  assert.equal(directories.getChild('featureDistributionStatus').get(pkg), 'NOT_AVAILABLE_NO_QUALIFIED_FEATURE_INPUT');
  assert.equal(edges.getChild('edgeType').get(0), 'CONTAINS');
  assert.equal(edges.getChild('identityStatus').get(0), 'PATH_DERIVED_NOT_CANONICAL_IDENTITY');
});

test('missing parent paths are counted and withheld from containment edges', () => {
  const input = makeInput([
    rows[0],
    { ...rows[3], relativePath: 'missing/file.ts' },
  ]);
  const result = buildDirectoryRollupV1(input);
  assert.equal(result.unresolvedParentCount, 1);
  assert.equal(result.edgeCount, 0);
  assert.equal(tableFromIPC(result.directoryBytes).numRows, 1);
});

test('duplicate directory paths fail closed', () => {
  assert.throws(() => buildDirectoryRollupV1(makeInput([rows[0], rows[1], rows[1]])), /DUPLICATE/);
});
