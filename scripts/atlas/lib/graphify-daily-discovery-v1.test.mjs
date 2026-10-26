import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  inspectGraphArtifacts, readOwnershipIndex, readTrackedInventory, resolveDiscoveryPath, searchDailySources,
} from './graphify-daily-discovery-v1.mjs';

function fixture(context) {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(path.join(temporaryRoot, 'atlas-daily-discovery-'));
  context.after(() => {
    assert.equal(path.dirname(root), temporaryRoot);
    assert.ok(path.basename(root).startsWith('atlas-daily-discovery-'));
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const write = (relativePath, value) => {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
    return target;
  };
  return { root, write };
}

test('inventory counts tracked names exactly and excludes dependency internals from discovery', (context) => {
  const { root, write } = fixture(context);
  write('packages/demo/a space.ts', 'const example = 1;');
  write('packages/demo/雪.ts', 'const unicode = 2;');
  write('packages/demo/node_modules/example/internal.ts', 'const dependency = 3;');
  write('packages/demo/docs/readme.ts', 'const generated = 4;');
  write('packages/demo/huge.ts', Buffer.alloc(2 * 1024 * 1024 + 1));
  write('packages/demo/untracked.ts', 'not staged');
  execFileSync('git', ['add', '--', 'packages/demo/a space.ts', 'packages/demo/雪.ts',
    'packages/demo/node_modules/example/internal.ts', 'packages/demo/docs/readme.ts', 'packages/demo/huge.ts'], { cwd: root });
  const result = readTrackedInventory(root, { measureSizes: true });
  assert.equal(result.summary.trackedPathCount, 5);
  assert.equal(result.trackedPaths.has('packages/demo/雪.ts'), true);
  assert.equal(result.trackedPaths.has('packages/demo/untracked.ts'), false);
  const packages = result.summary.directories.find((entry) => entry.path === 'packages');
  assert.equal(packages.discoveryCandidateFiles, 3);
  assert.ok(packages.trackedBytes > 2 * 1024 * 1024);
  const quick = readTrackedInventory(root);
  assert.equal(quick.summary.trackedPathCount, 5);
  assert.equal(quick.summary.trackedBytes, null);
  assert.equal(quick.summary.missingFiles, null);
});

test('owner lookup preserves declared proof status without upgrading discovery to verification', (context) => {
  const { root, write } = fixture(context);
  write('docs/architecture/runtime-ownership-registry.json', JSON.stringify({
    generated: '2026-08-09', capabilities: {
      fusion: { owner: { path: 'src/search.ts', status: 'PROVEN', classification: 'CANONICAL_OWNER' } },
      graph: { owner: { path: 'src/graph.ts', status: 'UNPROVEN' } },
    },
  }));
  const result = readOwnershipIndex(root, 'fusion', 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].declaredStatus, 'PROVEN');
  assert.equal(result.records[0].verification, 'REGISTRY_DECLARATION_ONLY');
  assert.equal(result.promotionAuthorized, false);
  assert.match(result.checksum, /^sha256:[0-9a-f]{64}$/);
});

test('graph check distinguishes tracked and ignored artifacts and bounds optional hashing', async (context) => {
  const { root, write } = fixture(context);
  write('.gitignore', 'graphify/\nsveltekit-frontend/docs/graph/codebase-graph.json\n');
  const app = write('sveltekit-frontend/docs/graph/codebase-graph.json', '{}');
  const source = write('docs/graph/codebase-graph.json', '{}');
  write('graphify/frozen-graph-snapshot-v2.json', 'snapshot that exceeds the configured test cap');
  utimesSync(app, new Date(0), new Date(0));
  utimesSync(source, new Date(0), new Date(0));
  execFileSync('git', ['add', '--', '.gitignore', 'docs/graph/codebase-graph.json'], { cwd: root });
  const { trackedPaths } = readTrackedInventory(root);
  const result = await inspectGraphArtifacts(root, trackedPaths, { hashGraphs: true, maxHashBytes: 8 });
  assert.equal(result.compatibilityCopiesEqual, true);
  assert.equal(result.artifacts[0].tracked, false);
  assert.match(result.artifacts[0].ignoreRule, /gitignore/);
  assert.equal(result.artifacts[0].status, 'STALE_BY_MTIME');
  assert.equal(result.artifacts[0].sourceLineageVerified, false);
  assert.equal(result.artifacts[1].tracked, true);
  assert.equal(result.artifacts[2].digestStatus, 'SKIPPED_SIZE_LIMIT');
  const metadata = await inspectGraphArtifacts(root, trackedPaths);
  assert.equal(metadata.compatibilityCopiesEqual, null);
  assert.equal(metadata.artifacts[0].digest, null);
});

test('literal rg search excludes dependencies and generated directories, preserves UTF-8 and caps results', async (context) => {
  const { root, write } = fixture(context);
  write('packages/demo/a.ts', 'const café = "needle";\nconst another = "needle";');
  write('packages/demo/node_modules/dep/internal.ts', 'needle');
  write('packages/demo/build-x64/generated.ts', 'needle');
  write('packages/demo/.venv-extra/internal.py', 'needle');
  write('packages/demo/reports/generated.ts', 'needle');
  write('packages/demo/huge.ts', 'needle' + 'x'.repeat(2 * 1024 * 1024));
  write('docs/reports/selected.json', '{"message":"needle"}');
  execFileSync('git', ['add', '--all'], { cwd: root });
  const result = await searchDailySources(root, { query: 'needle' });
  assert.equal(result.status, 'BOUNDED_MATCHES');
  assert.equal(result.matches.length, 2);
  assert.ok(result.matches[0].excerpt.includes('café'));
  assert.ok(result.matches.every((entry) => entry.path === 'packages/demo/a.ts'));
  const bounded = await searchDailySources(root, { query: 'needle', limit: 1 });
  assert.equal(bounded.matches.length, 1);
  assert.equal(bounded.truncated, true);
});

test('explicit owner and selected receipt are searched before sources', async (context) => {
  const { root, write } = fixture(context);
  write('packages/demo/example.ts', 'needle');
  write('openspec/changes/example/tasks.md', '- [ ] needle');
  write('docs/reports/selected.json', '{"message":"needle"}');
  const result = await searchDailySources(root, {
    query: 'needle', owner: 'example', receipt: 'docs/reports/selected.json', limit: 2,
  });
  assert.equal(result.matches.length, 2);
  assert.ok(result.matches.every((entry) => !entry.path.startsWith('packages/')));
  assert.equal(result.truncated, true);
});

test('missing literal matches are distinct from failed searches and shell syntax remains literal', async (context) => {
  const { root, write } = fixture(context);
  const literal = '$(Write-Output unsafe); --apply';
  write('packages/demo/example.ts', literal);
  execFileSync('git', ['add', '--all'], { cwd: root });
  const result = await searchDailySources(root, { query: literal });
  assert.equal(result.matches.length, 1);
  const absent = await searchDailySources(root, { query: 'missing-token' });
  assert.equal(absent.status, 'NO_MATCHES');
  assert.equal(absent.error, null);
});

test('untracked source is an explicit opt-in and broad searches retain a fixed source-file budget', async (context) => {
  const { root, write } = fixture(context);
  write('packages/demo/untracked.ts', 'unique-needle');
  assert.equal((await searchDailySources(root, { query: 'unique-needle' })).status, 'NO_MATCHES');
  assert.equal((await searchDailySources(root, { query: 'unique-needle', includeUntracked: true })).matches.length, 1);
  for (let index = 0; index < 251; index++) write(`packages/demo/file${String(index).padStart(3, '0')}.ts`, 'unrelated');
  execFileSync('git', ['add', '--', 'packages/demo'], { cwd: root });
  const result = await searchDailySources(root, { query: 'no-match-token' });
  assert.equal(result.scope.maxSourceFiles, 250);
  assert.equal(result.truncated, true);
  assert.equal(result.status, 'NO_MATCHES');
});

test('rejects path traversal, invalid query bounds and receipt directories', async (context) => {
  const { root, write } = fixture(context);
  write('docs/reports/directory.json/file.txt', 'example');
  write('openspec/changes/directory/tasks.md/file.txt', 'example');
  for (const invalid of ['../escape', 'C:\\outside\\file.ts', '/outside', 'path/../file']) {
    assert.throws(() => resolveDiscoveryPath(root, invalid));
  }
  await assert.rejects(searchDailySources(root, { query: 'a' }), /QUERY_MUST/);
  await assert.rejects(searchDailySources(root, { query: 'needle', limit: 101 }), /LIMIT_MUST/);
  await assert.rejects(searchDailySources(root, { query: 'needle', owner: '../other' }), /INVALID_OPENSPEC/);
  await assert.rejects(searchDailySources(root, { query: 'needle', receipt: 'docs/reports/directory.json' }), /MUST_BE_FILE/);
  await assert.rejects(searchDailySources(root, { query: 'needle', owner: 'directory' }), /MUST_BE_REGULAR_FILE/);
});

test('an unavailable rg executable returns failure rather than successful empty results', async (context) => {
  const { root, write } = fixture(context);
  write('openspec/changes/example/tasks.md', 'needle');
  const previous = process.env.PATH;
  try {
    process.env.PATH = '';
    const result = await searchDailySources(root, { query: 'needle', owner: 'example' });
    assert.equal(result.status, 'SEARCH_FAILED');
    assert.equal(result.error, 'ENOENT');
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
});
