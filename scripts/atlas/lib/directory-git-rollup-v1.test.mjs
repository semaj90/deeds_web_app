import assert from 'node:assert/strict';
import test from 'node:test';
import { tableFromArrays, tableFromIPC } from 'apache-arrow';
import { buildDirectoryGitRollupV1 } from './directory-git-rollup-v1.mjs';

function fixture(ordinalOverride = null) {
  const paths = tableFromArrays({
    ordinal: [0, 1, 2, 3, 4],
    relativePath: ['.', 'pkg', 'pkg/sub', 'pkg/a.ts', 'pkg/sub/b.py'],
    entryKind: ['DIRECTORY', 'DIRECTORY', 'DIRECTORY', 'FILE', 'FILE'],
  });
  const overlay = tableFromArrays({
    ordinal: ordinalOverride ?? [0, 1, 2, 3, 4],
    gitScopeCode: [0, 6, 6, 1, 3],
  });
  return [paths, overlay];
}

test('Git status rollup is deterministic and separates direct from subtree counts', () => {
  const [paths, overlay] = fixture();
  const first = buildDirectoryGitRollupV1(paths, overlay);
  const replay = buildDirectoryGitRollupV1(paths, overlay);
  assert.deepEqual(Buffer.from(first.bytes), Buffer.from(replay.bytes));
  const table = tableFromIPC(first.bytes);
  assert.equal(table.numRows, 3);
  const root = table.getChild('directoryPath').indexOf('.');
  const pkg = table.getChild('directoryPath').indexOf('pkg');
  const sub = table.getChild('directoryPath').indexOf('pkg/sub');
  assert.deepEqual(JSON.parse(table.getChild('directGitScopeCountsJson').get(pkg)), { TRACKED: 1 });
  assert.deepEqual(JSON.parse(table.getChild('subtreeGitScopeCountsJson').get(pkg)), { IGNORED: 1, TRACKED: 1 });
  assert.deepEqual(JSON.parse(table.getChild('subtreeGitScopeCountsJson').get(root)), { IGNORED: 1, TRACKED: 1 });
  assert.deepEqual(JSON.parse(table.getChild('directGitScopeCountsJson').get(sub)), { IGNORED: 1 });
  assert.equal(first.fileLikeRows, 2);
  assert.equal(first.unresolvedParentCount, 0);
});

test('Git status rollup rejects row-count and ordinal mismatches', () => {
  const [paths, overlay] = fixture([0, 1, 9, 3, 4]);
  assert.throws(() => buildDirectoryGitRollupV1(paths, tableFromArrays({ ordinal: [0], gitScopeCode: [1] })), /ROW_COUNT_MISMATCH/);
  assert.throws(() => buildDirectoryGitRollupV1(paths, overlay), /ORDINAL_ALIGNMENT_MISMATCH/);
});

test('Git status rollup rejects unknown scope codes', () => {
  const [paths, overlay] = fixture();
  overlay.getChild('gitScopeCode').set(3, 127);
  assert.throws(() => buildDirectoryGitRollupV1(paths, overlay), /GIT_SCOPE_CODE_INVALID/);
});
