import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph, classifyFile, classifyLine, enclosingFunction, evaluateGuard, isCallSite, reachableFrom, resolveSpecifier } from './audit-embedding-direct-endpoints-v1.mjs';

const lines = (s) => s.split('\n');

test('line classification: direct endpoints vs the app internal route vs comments', () => {
  assert.equal(classifyLine("const r = await fetch(`${OLLAMA}/api/embeddings`, {})"), 'DIRECT_API_EMBED');
  assert.equal(classifyLine("await fetch('http://127.0.0.1:8081/v1/embeddings')"), 'V1_EMBEDDINGS');
  assert.equal(classifyLine("await fetch('/api/embed', { method: 'POST' })"), 'INTERNAL_ROUTE');
  assert.equal(classifyLine('// calls /api/embeddings in the old path'), null);
  assert.equal(classifyLine(' * POST /v1/embeddings'), null);
  assert.equal(classifyLine('const x = 1;'), null);
});

test('a request next to the endpoint string is a call; a bare constant or log string is not', () => {
  const call = lines("const res = await fetch(\n  `${base}/api/embeddings`,\n  { method: 'POST' });");
  assert.equal(isCallSite(call, 1), true);
  const constant = lines("export const EMBED_PATH = '/api/embeddings';\nexport const OTHER = 1;");
  assert.equal(isCallSite(constant, 0), false);
  const log = lines("console.log('probing /api/embeddings health');");
  assert.equal(isCallSite(log, 0), false);
  const wrapper = lines("const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {");
  assert.equal(isCallSite(wrapper, 0), true);
  const sse = lines("this.eventSource = new EventSource(`/api/embed?docId=${id}`);");
  assert.equal(isCallSite(sse, 0), false);
  const viaVar = lines([
    "const EMBED_URL = `${ENV.OLLAMA_BASE_URL}/api/embed`;",
    '',
    '// ...many lines later...',
    '', '', '', '', '', '', '', '',
    'const r = await ollamaFetch(EMBED_URL, { method: "POST" });'
  ].join('\n'));
  assert.equal(isCallSite(viaVar, 0), true);
  const unusedVar = lines("const EMBED_URL = `${ENV.OLLAMA_BASE_URL}/api/embed`;\nexport const x = EMBED_URL.length;");
  assert.equal(isCallSite(unusedVar, 0), false);
});

test('enclosing function detection finds exported helpers, arrow consts and methods', () => {
  const a = lines('export async function embedQuery(q) {\n  const r = await fetch(`${u}/api/embeddings`);\n}');
  assert.deepEqual(enclosingFunction(a, 1), { name: 'embedQuery', exported: true, kind: 'function' });
  const b = lines('const getVec = async (q) => {\n  return fetch(`${u}/api/embeddings`);\n};');
  assert.equal(enclosingFunction(b, 1).name, 'getVec');
  assert.equal(enclosingFunction(b, 1).exported, false);
  const c = lines('class S {\n  async embed(q) {\n    return fetch(`${u}/api/embeddings`);\n  }\n}');
  assert.equal(enclosingFunction(c, 2).name, 'embed');
});

test('specifier resolution handles $lib, relative paths, .js -> .ts and ignores packages', () => {
  const have = new Set(['lib/a/b.ts', 'lib/c/index.ts', 'routes/x/+server.ts', 'routes/x/helper.ts']);
  const ex = (p) => have.has(p);
  assert.equal(resolveSpecifier('$lib/a/b.js', 'routes/x/+server.ts', ex), 'lib/a/b.ts');
  assert.equal(resolveSpecifier('./helper.js', 'routes/x/+server.ts', ex), 'routes/x/helper.ts');
  assert.equal(resolveSpecifier('$lib/c', 'routes/x/+server.ts', ex), 'lib/c/index.ts');
  assert.equal(resolveSpecifier('drizzle-orm', 'routes/x/+server.ts', ex), null);
});

test('reachability separates reachable from orphaned modules', () => {
  const sources = { 'routes/api/a/+server.ts': "import { live } from '$lib/live.js';", 'lib/live.ts': "import { deep } from './deep.js';", 'lib/deep.ts': '', 'lib/orphan.ts': '' };
  const edges = buildGraph(Object.keys(sources), (f) => sources[f]);
  const reach = reachableFrom(['routes/api/a/+server.ts'], edges);
  assert.ok(reach.has('lib/deep.ts'));
  assert.ok(!reach.has('lib/orphan.ts'));
});

const hit = (over) => ({ line: 1, kind: 'DIRECT_API_EMBED', isCall: true, enclosing: null, ...over });
const base = { reachableFromRoutes: true, reachableFromWorkers: false };

test('file classes: owner, diagnostic, fixture, test, legacy/dead evidence, facade-only, non-caller, dormant', () => {
  assert.equal(classifyFile({ ...base, file: 'lib/server/embedding/ollama-embed.ts', hits: [hit()] }), 'TRANSPORT_OWNER');
  assert.equal(classifyFile({ ...base, file: 'routes/api/health/+server.ts', hits: [hit()] }), 'DIAGNOSTIC');
  assert.equal(classifyFile({ ...base, file: 'lib/mocks/embed.ts', hits: [hit()] }), 'FIXTURE');
  assert.equal(classifyFile({ ...base, file: 'lib/x.test.ts', hits: [hit()] }), 'TEST');
  assert.equal(classifyFile({ ...base, file: 'lib/legacy/embed.ts', hits: [hit()], manualClassification: 'LEGACY' }), 'LEGACY');
  assert.equal(classifyFile({ ...base, file: 'lib/dead/embed.ts', hits: [hit()], manualClassification: 'DEAD' }), 'DEAD');
  assert.equal(classifyFile({ ...base, file: 'lib/x.ts', hits: [hit({ kind: 'INTERNAL_ROUTE' })] }), 'LIVE_WRAPPER');
  assert.equal(classifyFile({ ...base, file: 'lib/x.ts', hits: [hit({ isCall: false })] }), 'ROUTE_REACHABLE_NONCALLER');
  assert.equal(classifyFile({ ...base, reachableFromRoutes: false, file: 'lib/x.ts', hits: [hit({ isCall: false })] }), 'DORMANT');
  assert.equal(classifyFile({ ...base, reachableFromRoutes: false, file: 'lib/x.ts', hits: [hit()] }), 'DORMANT');
});

test('file classes: a route handler calling out is a direct caller; an exported embed helper is a wrapper', () => {
  assert.equal(classifyFile({ ...base, file: 'routes/api/q/+server.ts', hits: [hit({ enclosing: { name: 'embedQuery', exported: true } })] }), 'LIVE_DIRECT_CALLER');
  assert.equal(classifyFile({ ...base, file: 'lib/server/x.ts', hits: [hit({ enclosing: { name: 'embedQuery', exported: true } })] }), 'LIVE_WRAPPER');
  assert.equal(classifyFile({ ...base, file: 'lib/server/x.ts', hits: [hit({ enclosing: { name: 'load', exported: true } })] }), 'LIVE_DIRECT_CALLER');
  assert.equal(classifyFile({ ...base, file: 'lib/server/x.ts', hits: [hit({ enclosing: { name: 'embedQuery', exported: false } })] }), 'LIVE_DIRECT_CALLER');
});

test('ratchet: new live direct callers and direct-call wrappers fail; facade-only, dormant, non-caller, owner and diagnostic pass', () => {
  const rows = [
    { file: 'lib/old.ts', classification: 'LIVE_DIRECT_CALLER' },
    { file: 'lib/new.ts', classification: 'LIVE_WRAPPER', kinds: ['DIRECT_API_EMBED'] },
    { file: 'lib/sleeper.ts', classification: 'DORMANT' },
    { file: 'lib/const.ts', classification: 'ROUTE_REACHABLE_NONCALLER' },
    { file: 'lib/server/embedding/ollama-embed.ts', classification: 'TRANSPORT_OWNER' },
    { file: 'lib/mocks/e.ts', classification: 'FIXTURE' },
    { file: 'routes/api/health/+server.ts', classification: 'DIAGNOSTIC' },
    { file: 'lib/facade.ts', classification: 'LIVE_WRAPPER', kinds: ['INTERNAL_ROUTE'] }
  ];
  const g = evaluateGuard(rows, { tolerated: ['lib/old.ts', 'lib/gone.ts'] });
  assert.equal(g.pass, false);
  assert.deepEqual(g.newBypasses, ['lib/new.ts']);
  assert.deepEqual(g.resolvedSinceBaseline, ['lib/gone.ts']);
  assert.equal(evaluateGuard(rows.slice(2), { tolerated: [] }).pass, true);
});
