import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph, classifyFile, classifyLine, evaluateGuard, reachableFrom, resolveSpecifier } from './audit-embedding-direct-endpoints-v1.mjs';

test('line classification: direct endpoints vs the app internal route vs comments', () => {
  assert.equal(classifyLine("const r = await fetch(`${OLLAMA}/api/embeddings`, {})"), 'DIRECT_API_EMBED');
  assert.equal(classifyLine("await fetch('http://127.0.0.1:8081/v1/embeddings')"), 'V1_EMBEDDINGS');
  assert.equal(classifyLine("await fetch('/api/embed', { method: 'POST' })"), 'INTERNAL_ROUTE');
  assert.equal(classifyLine('// calls /api/embeddings in the old path'), null);
  assert.equal(classifyLine(' * POST /v1/embeddings'), null);
  assert.equal(classifyLine('const x = 1;'), null);
});

test('specifier resolution handles $lib, relative paths, .js -> .ts and ignores packages', () => {
  const have = new Set(['lib/a/b.ts', 'lib/c/index.ts', 'routes/x/+server.ts', 'routes/x/helper.ts']);
  const ex = (p) => have.has(p);
  assert.equal(resolveSpecifier('$lib/a/b.js', 'routes/x/+server.ts', ex), 'lib/a/b.ts');
  assert.equal(resolveSpecifier('./helper.js', 'routes/x/+server.ts', ex), 'routes/x/helper.ts');
  assert.equal(resolveSpecifier('$lib/c', 'routes/x/+server.ts', ex), 'lib/c/index.ts');
  assert.equal(resolveSpecifier('drizzle-orm', 'routes/x/+server.ts', ex), null);
});

test('reachability separates live callers from dormant ones', () => {
  const sources = {
    'routes/api/a/+server.ts': "import { live } from '$lib/live.js';",
    'lib/live.ts': "import { deep } from './deep.js';",
    'lib/deep.ts': '',
    'lib/orphan.ts': ''
  };
  const edges = buildGraph(Object.keys(sources), (f) => sources[f]);
  const reach = reachableFrom(['routes/api/a/+server.ts'], edges);
  assert.ok(reach.has('lib/deep.ts'));
  assert.ok(!reach.has('lib/orphan.ts'));
});

test('file classification order: transport owner, diagnostic, internal-only, live, worker, dormant', () => {
  const base = { kinds: ['DIRECT_API_EMBED'], reachableFromRoutes: false, reachableFromWorkers: false };
  assert.equal(classifyFile({ ...base, file: 'lib/server/embedding/ollama-embed.ts' }), 'TRANSPORT_OWNER');
  assert.equal(classifyFile({ ...base, file: 'routes/api/health/+server.ts' }), 'DIAGNOSTIC');
  assert.equal(classifyFile({ ...base, kinds: ['INTERNAL_ROUTE'], file: 'lib/x.ts' }), 'INTERNAL_ROUTE_ONLY');
  assert.equal(classifyFile({ ...base, reachableFromRoutes: true, file: 'lib/x.ts' }), 'LIVE_CONSUMER');
  assert.equal(classifyFile({ ...base, reachableFromWorkers: true, file: 'lib/x.ts' }), 'LIVE_CONSUMER_VIA_WORKER');
  assert.equal(classifyFile({ ...base, file: 'lib/x.ts' }), 'UNREACHABLE_DORMANT_CANDIDATE');
});

test('guard: baseline files pass, a new file fails, a migrated file is reported as resolved', () => {
  const rows = [
    { file: 'lib/old.ts', classification: 'LIVE_CONSUMER' },
    { file: 'lib/new.ts', classification: 'LIVE_CONSUMER' },
    { file: 'lib/server/embedding/ollama-embed.ts', classification: 'TRANSPORT_OWNER' }
  ];
  const g = evaluateGuard(rows, { tolerated: ['lib/old.ts', 'lib/gone.ts'] });
  assert.equal(g.pass, false);
  assert.deepEqual(g.newBypasses, ['lib/new.ts']);
  assert.deepEqual(g.resolvedSinceBaseline, ['lib/gone.ts']);
  assert.equal(evaluateGuard(rows.slice(0, 1), { tolerated: ['lib/old.ts'] }).pass, true);
  assert.equal(evaluateGuard(rows.slice(2), { tolerated: [] }).pass, true);
});
