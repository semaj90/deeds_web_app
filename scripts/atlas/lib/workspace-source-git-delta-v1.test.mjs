import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRepositorySourceGitDeltaV1,
  parseGitNameStatusZV1,
} from './workspace-source-git-delta-v1.mjs';

const baseline = 'a'.repeat(40);
const head = 'b'.repeat(40);
const repo = 'C:/workspace/repo';
const commandKey = (args) => args.join(' ');

function fakeGit({ diff = '', untracked = '', status = '', index = '', nextStatus, ancestry = true } = {}) {
  let statusCalls = 0;
  return (_repo, args) => {
    const key = commandKey(args);
    if (key === 'rev-parse HEAD') return `${head}\n`;
    if (key === `merge-base --is-ancestor ${baseline} ${head}`) {
      if (!ancestry) throw new Error('not an ancestor');
      return '';
    }
    if (key === `diff --name-status -z -M ${baseline} --`) return Buffer.from(diff);
    if (key === 'ls-files --others --exclude-standard -z') return Buffer.from(untracked);
    if (key === 'status --porcelain=v2 -z --untracked-files=all') {
      statusCalls += 1;
      return Buffer.from(statusCalls > 1 && nextStatus !== undefined ? nextStatus : status);
    }
    if (key === 'ls-files --stage -z') return Buffer.from(index);
    throw new Error(`UNEXPECTED_GIT_COMMAND:${key}`);
  };
}

test('parses NUL-delimited modifications, deletions, additions, and renames', () => {
  assert.deepEqual(parseGitNameStatusZV1(Buffer.from('M\0src/changed.ts\0D\0src/removed.ts\0A\0src/added.ts\0R100\0src/old.ts\0src/new.ts\0')), [
    { kind: 'MODIFY', sourceRef: 'src/changed.ts', previousPath: null, status: 'M' },
    { kind: 'DELETE', sourceRef: 'src/removed.ts', previousPath: null, status: 'D' },
    { kind: 'ADD', sourceRef: 'src/added.ts', previousPath: null, status: 'A' },
    { kind: 'RENAME', sourceRef: 'src/new.ts', previousPath: 'src/old.ts', status: 'R100' },
  ]);
});

test('emits exact changed paths without reading source bytes', () => {
  const result = collectRepositorySourceGitDeltaV1({
    repositoryPath: repo,
    baselineCommit: baseline,
    git: fakeGit({
      diff: 'M\0src/one.ts\0M\0src/two.ts\0',
      untracked: 'docs/new.md\0',
    }),
  });
  assert.equal(result.status, 'GIT_DELTA_READY_NOT_ADMITTED');
  assert.deepEqual(result.changedPaths.map((row) => [row.sourceRef, row.operation]), [
    ['docs/new.md', 'ADD'],
    ['src/one.ts', 'MODIFY'],
    ['src/two.ts', 'MODIFY'],
  ]);
  assert.equal(result.sourceBytesRead, 0);
  assert.equal(result.writesPerformed, false);
});

test('preserves rename tombstone and new-path identity', () => {
  const result = collectRepositorySourceGitDeltaV1({
    repositoryPath: repo,
    baselineCommit: baseline,
    git: fakeGit({ diff: 'R098\0src/before.ts\0src/after.ts\0' }),
  });
  assert.deepEqual(result.changedPaths, [
    { sourceRef: 'src/after.ts', operation: 'RENAME', previousPath: 'src/before.ts' },
    { sourceRef: 'src/before.ts', operation: 'DELETE', previousPath: null },
  ]);
});

test('includes paths dirty in the prior snapshot even when now clean against HEAD', () => {
  const result = collectRepositorySourceGitDeltaV1({
    repositoryPath: repo,
    baselineCommit: baseline,
    previousDirtyPaths: ['src/reverted.ts'],
    git: fakeGit(),
  });
  assert.equal(result.status, 'GIT_DELTA_READY_NOT_ADMITTED');
  assert.deepEqual(result.changedPaths, [
    { sourceRef: 'src/reverted.ts', operation: 'MODIFY', previousPath: null },
  ]);
});

test('requires full recapture when source-selection policy changes', () => {
  const result = collectRepositorySourceGitDeltaV1({
    repositoryPath: repo,
    baselineCommit: baseline,
    git: fakeGit({ diff: 'M\0docs/.gitignore\0' }),
  });
  assert.equal(result.status, 'FULL_RECAPTURE_REQUIRED');
  assert.equal(result.reason, 'SOURCE_SELECTION_POLICY_INPUT_CHANGED');
});

test('fails closed on divergent baselines and state drift during collection', () => {
  const divergent = collectRepositorySourceGitDeltaV1({
    repositoryPath: repo,
    baselineCommit: baseline,
    git: fakeGit({ ancestry: false }),
  });
  assert.equal(divergent.reason, 'BASELINE_NOT_ANCESTOR_OF_HEAD');

  const drifted = collectRepositorySourceGitDeltaV1({
    repositoryPath: repo,
    baselineCommit: baseline,
    git: fakeGit({ status: '1 .M N... 100644 100644 100644 a b src/a.ts\0', nextStatus: '' }),
  });
  assert.equal(drifted.reason, 'GIT_STATE_CHANGED_DURING_DELTA');
});
