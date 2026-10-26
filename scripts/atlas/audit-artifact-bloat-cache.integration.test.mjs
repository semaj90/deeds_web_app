import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const auditPath = path.join(root, 'scripts/atlas/audit-artifact-bloat.mjs');

test('bounded dry-run reuses unchanged sample fingerprints and invalidates changed files', async (t) => {
  const fixtureRoot = await mkdtemp(path.join(root, '.tmp/atlas/artifact-audit-cache-test-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const rel = path.relative(root, fixtureRoot).replaceAll('\\', '/');
  const cachePath = path.join(fixtureRoot, 'fingerprint-cache.json');
  const a = path.join(fixtureRoot, 'a.json');
  const b = path.join(fixtureRoot, 'b.json');
  const c = path.join(fixtureRoot, 'c.json');
  await writeFile(a, '{"content":"same"}');
  await writeFile(b, '{"content":"same"}');
  await writeFile(c, '{"content":"else"}');

  const run = () => {
    const result = spawnSync(process.execPath, [auditPath, '--dry-run', '--persist-fingerprint-cache',
      `--scan-root=${rel}`, `--fingerprint-cache=${cachePath}`], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const marker = result.stdout.lastIndexOf('"totalFiles"');
    const start = result.stdout.lastIndexOf('{', marker);
    assert.notEqual(marker, -1, result.stdout);
    return JSON.parse(result.stdout.slice(start));
  };

  const first = run();
  assert.equal(first.fingerprintCacheReused, 0);
  assert.equal(first.duplicateFiles, 1);
  const firstCache = JSON.parse(await readFile(cachePath, 'utf8'));
  assert.equal(Object.keys(firstCache.entries).length, 3);

  const second = run();
  assert.equal(second.fingerprintCacheReused, 3);
  assert.equal(second.duplicateFiles, 1);
  assert.equal(second.duplicateSampleBytesRead, 0);

  await writeFile(b, '{"content":"diff"}');
  const third = run();
  assert.equal(third.fingerprintCacheReused, 2);
  assert.equal(third.duplicateFiles, 0);
});

test('bounded scan roots outside the repository are refused', async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), 'atlas-audit-outside-'));
  try {
    const result = spawnSync(process.execPath, [auditPath, '--dry-run', `--scan-root=${outside}`], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SCAN_ROOT_OUTSIDE_REPOSITORY/);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
