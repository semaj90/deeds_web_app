import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { observeSnapshot, loadDigestCache, saveDigestCache } from './workspace-snapshot-capture-v1.mts';
import type { WorkspaceDigestCacheV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

// WSR-03/05 digest cache: derived facts only; byte output must be identical with or without it.
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'wsr-cache-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 't');
  const old = new Date(Date.now() - 60_000);
  for (const [name, body] of [['a.ts', 'export const a = 1;\n'], ['b.md', '# b\n']]) {
    writeFileSync(path.join(root, name), body);
    utimesSync(path.join(root, name), old, old);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  return root;
}
const ids = (s: ReturnType<typeof observeSnapshot>) => s.sources.map((x) => [x.sourceRef, x.sourceRevision, x.byteLength]);

test('cached observation equals uncached observation and a warm cache is populated', () => {
  const root = makeRepo();
  try {
    const cache: WorkspaceDigestCacheV1 = new Map();
    const plain = observeSnapshot(root, 'ws-test');
    const cold = observeSnapshot(root, 'ws-test', { digestCache: cache });
    assert.ok(cache.size >= 2);
    const warm = observeSnapshot(root, 'ws-test', { digestCache: cache });
    assert.deepEqual(ids(cold), ids(plain));
    assert.deepEqual(ids(warm), ids(plain));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a changed file invalidates its cache entry (size/mtime) and yields the new revision', () => {
  const root = makeRepo();
  try {
    const cache: WorkspaceDigestCacheV1 = new Map();
    const before = observeSnapshot(root, 'ws-test', { digestCache: cache });
    writeFileSync(path.join(root, 'a.ts'), 'export const a = 22;\n');
    const old = new Date(Date.now() - 30_000);
    utimesSync(path.join(root, 'a.ts'), old, old);
    const after = observeSnapshot(root, 'ws-test', { digestCache: cache });
    const rev = (s: ReturnType<typeof observeSnapshot>) => s.sources.find((x) => x.sourceRef === 'a.ts')!.sourceRevision;
    assert.notEqual(rev(after), rev(before));
    assert.deepEqual(ids(after), ids(observeSnapshot(root, 'ws-test')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a just-written file is never cached (racy mtime guard)', () => {
  const root = makeRepo();
  try {
    writeFileSync(path.join(root, 'fresh.ts'), 'export const f = 1;\n');
    const cache: WorkspaceDigestCacheV1 = new Map();
    observeSnapshot(root, 'ws-test', { digestCache: cache });
    assert.ok(![...cache.keys()].some((k) => k.endsWith('fresh.ts')));
    assert.ok([...cache.keys()].some((k) => k.endsWith('a.ts')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('persisted digest cache round-trips and any mismatch or corruption yields an empty cache', () => {
  const root = makeRepo();
  try {
    const cache: WorkspaceDigestCacheV1 = new Map();
    observeSnapshot(root, 'ws-test', { digestCache: cache });
    const file = path.join(root, '.tmp', 'cache.json');
    saveDigestCache(file, cache);
    assert.deepEqual([...loadDigestCache(file).entries()], [...cache.entries()]);
    writeFileSync(file, '{not json');
    assert.equal(loadDigestCache(file).size, 0);
    writeFileSync(file, JSON.stringify({ schema: 'other', entries: { x: 1 } }));
    assert.equal(loadDigestCache(file).size, 0);
    assert.equal(loadDigestCache(path.join(root, 'missing.json')).size, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
