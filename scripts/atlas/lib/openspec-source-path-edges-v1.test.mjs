import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { blockHash, taskBlock } from './wfu-metadata.mjs';
import { extractOpenSpecSourcePathRefsV1, resolveRepositoryPathV1 } from './openspec-source-path-edges-v1.mjs';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function fixtureTask(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  return {
    taskKey: 'example:1', source: 'openspec/changes/example/tasks.md', line: 1,
    blockHash: blockHash(taskBlock(lines, 0)),
  };
}

test('extracts exact inline path byte spans from hash-bound task blocks only', () => {
  const sourceText = '- [ ] Wire `scripts/atlas/index.mjs:42` and `src/lib/猫.ts`; prose mentions `not a path`.\r\n  Context: `docs/spec.md#L3`.\r\n  - [ ] Child task references `ignored/child.js`.';
  const task = fixtureTask(sourceText);
  const refs = extractOpenSpecSourcePathRefsV1({ task, sourceText, expectedTaskFileSha256: sha256(sourceText) });
  assert.deepEqual(refs.map(ref => [ref.referencedPath, ref.evidenceLine]), [
    ['scripts/atlas/index.mjs', 1],
    ['src/lib/猫.ts', 1],
    ['docs/spec.md', 2],
  ]);
  for (const ref of refs) {
    const bytes = Buffer.from(sourceText, 'utf8').subarray(ref.evidenceStartByte, ref.evidenceEndByte);
    assert.equal(bytes.toString('utf8'), ref.evidenceText);
    assert.equal(ref.authorityStatus, 'CURRENT_TASK_BYTES_UNBOUND_TO_WORKSPACE_SNAPSHOT');
  }
});

test('fails closed on stale task files and task blocks', () => {
  const sourceText = '- [ ] Keep `scripts/atlas/index.mjs`.';
  const task = fixtureTask(sourceText);
  assert.throws(() => extractOpenSpecSourcePathRefsV1({ task, sourceText, expectedTaskFileSha256: sha256('stale') }), /TASK_FILE_REVISION_MISMATCH/);
  assert.throws(() => extractOpenSpecSourcePathRefsV1({ task: { ...task, blockHash: 'sha256:bad' }, sourceText, expectedTaskFileSha256: sha256(sourceText) }), /TASK_BLOCK_REVISION_MISMATCH/);
});

test('resolves exact repository paths but rejects unsafe, ambiguous-case, and symlink targets', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'openspec-path-edges-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts', 'atlas'), { recursive: true });
  writeFileSync(path.join(root, 'scripts', 'atlas', 'index.mjs'), 'export {};');
  const directoryEntriesCache = new Map();
  const exact = resolveRepositoryPathV1({ repositoryRoot: root, referencedPath: 'scripts/atlas/index.mjs', directorySummaryPaths: ['scripts/atlas'], directoryEntriesCache });
  const cached = resolveRepositoryPathV1({ repositoryRoot: root, referencedPath: 'scripts/atlas/index.mjs', directorySummaryPaths: new Set(['scripts/atlas']), directoryEntriesCache });
  assert.deepEqual(exact, { status: 'EXACT_REPO_ROOT_FILE', resolvedPath: 'scripts/atlas/index.mjs', directoryPath: 'scripts/atlas' });
  assert.deepEqual(cached, exact);
  assert.equal(directoryEntriesCache.size, 3);
  assert.equal(resolveRepositoryPathV1({ repositoryRoot: root, referencedPath: '../outside.ts', directorySummaryPaths: [] }).status, 'UNSAFE_OR_NONCANONICAL_PATH');
  assert.equal(resolveRepositoryPathV1({ repositoryRoot: root, referencedPath: 'Scripts/atlas/index.mjs', directorySummaryPaths: ['scripts/atlas'] }).status, 'PATH_CASE_MISMATCH');
  try {
    symlinkSync(path.join(root, 'scripts'), path.join(root, 'linked'), 'dir');
    assert.equal(resolveRepositoryPathV1({ repositoryRoot: root, referencedPath: 'linked/atlas/index.mjs', directorySummaryPaths: ['linked/atlas'] }).status, 'SYMLINK_NOT_FOLLOWED');
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    t.diagnostic('Symlink creation unavailable on this host; link-follow check not exercised.');
  }
});
