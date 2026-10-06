import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, utimesSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureStableSnapshot, createDigestCacheContext, hash, observeSnapshot, loadDigestCache, saveDigestCache, validateSnapshot } from './workspace-snapshot-capture-v1.mts';
import type { WorkspaceDigestCacheV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

// WSR-03/05 digest cache: derived facts only; byte output must be identical with or without it.
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'wsr-cache-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 't');
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n');
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
    const context = createDigestCacheContext(root, 'ws-test');
    saveDigestCache(file, cache, context);
    assert.deepEqual([...loadDigestCache(file, context).entries()], [...cache.entries()]);
    writeFileSync(file, '{not json');
    assert.equal(loadDigestCache(file, context).size, 0);
    writeFileSync(file, JSON.stringify({ schema: 'other', entries: { x: 1 } }));
    assert.equal(loadDigestCache(file, context).size, 0);
    assert.equal(loadDigestCache(path.join(root, 'missing.json'), context).size, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('persisted cache is scoped to workspace and repository-root fingerprints', () => {
  const root = makeRepo();
  try {
    const cache: WorkspaceDigestCacheV1 = new Map();
    observeSnapshot(root, 'ws-test', { digestCache: cache });
    const file = path.join(root, '.tmp', 'cache.json');
    const context = createDigestCacheContext(root, 'ws-test');
    saveDigestCache(file, cache, context);
    assert.equal(loadDigestCache(file, createDigestCacheContext(root, 'other-workspace')).size, 0);
    assert.equal(loadDigestCache(file, { ...context, repositoryRootsChecksum: 'sha256:wrong' }).size, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('persisted cache rejects policy drift, checksum tampering, and malformed entries', () => {
  const root = makeRepo();
  try {
    const cache: WorkspaceDigestCacheV1 = new Map();
    observeSnapshot(root, 'ws-test', { digestCache: cache });
    const file = path.join(root, '.tmp', 'cache.json');
    const context = createDigestCacheContext(root, 'ws-test');
    saveDigestCache(file, cache, context);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const { checksum: _checksum, ...body } = saved;
    const policyDrift = { ...body, policyRevision: 'sha256:changed' };
    writeFileSync(file, JSON.stringify({ ...policyDrift, checksum: hash(policyDrift) }));
    assert.equal(loadDigestCache(file, context).size, 0);
    saveDigestCache(file, cache, context);
    const tampered = JSON.parse(readFileSync(file, 'utf8'));
    tampered.entries[Object.keys(tampered.entries)[0]].contentDigest = 'b'.repeat(64);
    writeFileSync(file, JSON.stringify(tampered));
    assert.equal(loadDigestCache(file, context).size, 0);
    const malformed = JSON.parse(readFileSync(file, 'utf8'));
    const firstKey = Object.keys(malformed.entries)[0];
    malformed.entries[firstKey].mtimeNs = 'not-a-number';
    const { checksum, ...malformedBody } = malformed;
    writeFileSync(file, JSON.stringify({ ...malformedBody, checksum: hash(malformedBody) }));
    assert.equal(loadDigestCache(file, context).size, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('atomic persistence replaces only with a complete checksummed cache', () => {
  const root = makeRepo();
  try {
    const context = createDigestCacheContext(root, 'ws-test');
    const file = path.join(root, '.tmp', 'cache.json');
    const first: WorkspaceDigestCacheV1 = new Map();
    observeSnapshot(root, 'ws-test', { digestCache: first });
    saveDigestCache(file, first, context);
    const previous = readFileSync(file, 'utf8');
    const second: WorkspaceDigestCacheV1 = new Map(first);
    second.set(path.join(root, 'extra.ts'), {
      size: 3, mtimeNs: '1', sourceRevision: `sha256:${'a'.repeat(64)}`,
      contentDigest: 'a'.repeat(64), byteLength: 3,
    });
    saveDigestCache(file, second, context);
    assert.notEqual(readFileSync(file, 'utf8'), previous);
    assert.equal(loadDigestCache(file, context).size, second.size);
    assert.deepEqual(readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp')), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('interrupted temp write leaves the previously committed cache intact', () => {
  const root = makeRepo();
  try {
    const context = createDigestCacheContext(root, 'ws-test');
    const file = path.join(root, '.tmp', 'cache.json');
    const original: WorkspaceDigestCacheV1 = new Map();
    observeSnapshot(root, 'ws-test', { digestCache: original });
    saveDigestCache(file, original, context);
    const previousBytes = readFileSync(file, 'utf8');
    const replacement: WorkspaceDigestCacheV1 = new Map(original);
    replacement.set(path.join(root, 'different.ts'), {
      size: 3, mtimeNs: '1', sourceRevision: `sha256:${'c'.repeat(64)}`,
      contentDigest: 'c'.repeat(64), byteLength: 3,
    });
    assert.throws(() => saveDigestCache(file, replacement, context, {
      beforeAtomicRename: () => { throw new Error('simulated_process_failure'); },
    }), /simulated_process_failure/);
    assert.equal(readFileSync(file, 'utf8'), previousBytes);
    assert.deepEqual(readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp')), []);
    assert.equal(loadDigestCache(file, context).size, original.size);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('persisted cold and warm captures are timed and produce the same source frame', () => {
  const root = makeRepo();
  try {
    const cachePath = path.join(root, '.tmp', 'cache.json');
    const coldStarted = performance.now();
    const cold = captureStableSnapshot(root, 'ws-test', { digestCachePath: cachePath });
    const coldCaptureMs = performance.now() - coldStarted;
    const warmStarted = performance.now();
    const warm = captureStableSnapshot(root, 'ws-test', { digestCachePath: cachePath });
    const warmCaptureMs = performance.now() - warmStarted;
    assert.deepEqual(ids(warm), ids(cold));
    assert.equal(validateSnapshot(warm).status, 'SNAPSHOT_BYTES_READBACK_PROVEN');
    console.log(JSON.stringify({ coldCaptureMs: Number(coldCaptureMs.toFixed(2)), warmCaptureMs: Number(warmCaptureMs.toFixed(2)) }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('uncached byte oracle invalidates persisted cache after same-size same-mtime drift', () => {
  const root = makeRepo();
  try {
    const cachePath = path.join(root, '.tmp', 'cache.json');
    const snapshot = captureStableSnapshot(root, 'ws-test', { digestCachePath: cachePath });
    const target = path.join(root, 'a.ts');
    const before = statSync(target);
    writeFileSync(target, 'export const a = 2;\n');
    utimesSync(target, before.atime, before.mtime);
    const readback = validateSnapshot(snapshot, { digestCachePath: cachePath });
    assert.equal(readback.status, 'SNAPSHOT_READBACK_BLOCKED');
    assert.equal(readback.digestCacheInvalidated, true);
    assert.equal(existsSync(cachePath), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
