import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGitIgnoredFiles } from './git-ignore-file-filter-v1.mjs';

test('filters ignored files in one NUL-delimited git query', () => {
  let invocation;
  const result = filterGitIgnoredFiles(['src/a.ts', 'reports/generated.json'], {
    cwd: 'workspace',
    spawnSync(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: 'reports/generated.json\0' };
    },
  });

  assert.deepEqual(result, {
    included: ['src/a.ts'],
    ignored: ['reports/generated.json'],
  });
  assert.equal(invocation.command, 'git');
  assert.deepEqual(invocation.args, ['check-ignore', '-z', '--stdin']);
  assert.equal(invocation.options.input, 'src/a.ts\0reports/generated.json\0');
});

test('treats git exit code one as no ignored paths', () => {
  const result = filterGitIgnoredFiles(['src/a.ts'], {
    spawnSync: () => ({ status: 1, stdout: '' }),
  });

  assert.deepEqual(result, { included: ['src/a.ts'], ignored: [] });
});

test('normalizes Windows separators before matching ignore output', () => {
  const result = filterGitIgnoredFiles(['reports\\generated.json'], {
    spawnSync: () => ({ status: 0, stdout: 'reports/generated.json\0' }),
  });

  assert.deepEqual(result, { included: [], ignored: ['reports/generated.json'] });
});

test('fails closed when git ignore evaluation fails', () => {
  assert.throws(
    () => filterGitIgnoredFiles(['src/a.ts'], {
      spawnSync: () => ({ status: 128, stdout: '', stderr: 'not a repository' }),
    }),
    /GIT_IGNORE_QUERY_FAILED:128/,
  );
});
