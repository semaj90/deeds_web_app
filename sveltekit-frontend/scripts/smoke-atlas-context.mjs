#!/usr/bin/env node
/**
 * smoke-atlas-context.mjs
 *
 * Regression smoke for the atlas → context_for_file → hypergraph search lane.
 * Combines two P1 smoke targets:
 *
 *   P1.7  atlas:prompt:smoke  — context packet shape + provenance + rank
 *   P1.8  hypergraph.search   — query returns ≥1 cluster_context edge
 *
 * Run as part of the startup heavy lane and after every karpathy/seeder
 * pipeline mutation. Exit 0 on all pass, exit 1 on any fail.
 *
 * Usage:
 *   node scripts/smoke-atlas-context.mjs
 *   node scripts/smoke-atlas-context.mjs --json     # machine-readable output
 *   node scripts/smoke-atlas-context.mjs --strict   # also fail on warnings
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

const MCP_URL    = process.env.MCP_URL    ?? 'http://127.0.0.1:8788/mcp';
const SVELTEKIT  = process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const JSON_OUT   = process.argv.includes('--json');
const STRICT     = process.argv.includes('--strict');

const LOG_DIR = resolve(ROOT, 'logs/task-output/pipeline-test');
mkdirSync(LOG_DIR, { recursive: true });

// Pinned probe path — high-PR file we expect every time.
// (db/client.ts ranks #1 across runs; if it ever drops out the atlas regen
//  is broken, which is exactly what this smoke catches.)
const PROBE_FILE = 'src/lib/server/db/client.ts';

const results = [];
let passed = 0, failed = 0, warned = 0;

async function callMcp(name, args, timeoutMs = 15_000) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  if (!dataLine) throw new Error('no SSE data');
  const payload = JSON.parse(dataLine.slice(5).trim());
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const inner = payload.result?.content?.[0]?.text;
  return inner ? JSON.parse(inner) : payload.result;
}

async function check(name, fn) {
  try {
    // Await sync OR async detail values — checks that hit fetch().json()
    // returned a Promise instead of the resolved string previously.
    const detail = await fn();
    results.push({ name, status: 'PASS', detail: detail ?? '' });
    passed++;
    if (!JSON_OUT) console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    const isWarn = err.message?.startsWith('WARN:');
    const status = isWarn ? 'WARN' : 'FAIL';
    const msg = isWarn ? err.message.slice(5).trim() : err.message;
    results.push({ name, status, error: msg });
    if (status === 'WARN') warned++; else failed++;
    if (!JSON_OUT) console.log(`  ${status} ${name} — ${msg}`);
  }
}

// ── P1.7 — atlas:prompt:smoke ────────────────────────────────────────────────

if (!JSON_OUT) console.log('\n=== P1.7 — atlas:prompt:smoke ===');

const ctx = await callMcp('codebase.context_for_file', { filePath: PROBE_FILE, maxCards: 3 });

await check('context_for_file responds', () => {
  if (!ctx) throw new Error('null response');
  return 'OK';
});

await check('filePath echoes back', () => {
  if (ctx.filePath !== PROBE_FILE) throw new Error(`expected ${PROBE_FILE}, got ${ctx.filePath}`);
  return ctx.filePath;
});

await check('normalizedPath strips src/ prefix', () => {
  if (!ctx.normalizedPath || ctx.normalizedPath.startsWith('src/')) {
    throw new Error(`bad normalizedPath: ${ctx.normalizedPath}`);
  }
  return ctx.normalizedPath;
});

await check('directory shape is complete', () => {
  const d = ctx.directory ?? {};
  for (const f of ['path', 'rank', 'topo', 'clusters', 'tags', 'tools', 'constraints']) {
    if (!(f in d)) throw new Error(`missing directory.${f}`);
  }
  return `dir.path=${d.path}`;
});

await check('file shape includes rank + reasons[]', () => {
  const f = ctx.file ?? {};
  if (typeof f.rank !== 'number') throw new Error('file.rank not number');
  if (!Array.isArray(f.reasons)) throw new Error('file.reasons not array');
  return `rank=${f.rank.toFixed(3)} reasons=${f.reasons.length}`;
});

await check('file.rank is in [0, 1]', () => {
  const r = ctx.file?.rank;
  if (r < 0 || r > 1) throw new Error(`out of range: ${r}`);
  return `${r}`;
});

await check('promptCards present', () => {
  if (!Array.isArray(ctx.promptCards)) throw new Error('promptCards not array');
  if (ctx.promptCards.length === 0) throw new Error('WARN: 0 prompt cards (atlas peers may be sparse)');
  return `${ctx.promptCards.length} cards`;
});

await check('recommendedActions array', () => {
  if (!Array.isArray(ctx.recommendedActions)) throw new Error('not array');
  return `${ctx.recommendedActions.length} actions`;
});

await check('provenance.atlas in {redis, fs, cache, empty}', () => {
  const a = ctx.provenance?.atlas;
  if (!['redis', 'fs', 'cache', 'empty'].includes(a)) throw new Error(`bad atlas source: ${a}`);
  return a;
});

await check('provenance.sources lists ≥1 origin', () => {
  const s = ctx.provenance?.sources ?? [];
  if (s.length === 0) throw new Error('empty sources');
  return s.join(', ');
});

await check('hitDemand path present (null OK if cold)', () => {
  // file.hitDemand is optional — we only require that if present it has the right shape
  const hd = ctx.file?.hitDemand;
  if (hd) {
    for (const f of ['hits', 'hotScore', 'avgRerank']) {
      if (typeof hd[f] !== 'number') throw new Error(`hitDemand.${f} not number`);
    }
    return `hits=${hd.hits} hot=${hd.hotScore.toFixed(2)}`;
  }
  return 'cold (no chunk_hit_log rows in window)';
});

// ── P1.8 — hypergraph.search regression ──────────────────────────────────────

if (!JSON_OUT) console.log('\n=== P1.8 — hypergraph.search regression ===');

const SEARCH_QUERIES = [
  { q: 'agentic',  minHits: 1, label: 'common code term' },
  { q: 'redis',    minHits: 1, label: 'common dependency' },
  { q: 'svelte',   minHits: 1, label: 'framework keyword' },
];

for (const probe of SEARCH_QUERIES) {
  const r = await callMcp('hypergraph.search', { query: probe.q, limit: 5 }, 15_000)
    .catch((err) => ({ error: err.message }));
  await check(`search '${probe.q}' (${probe.label})`, () => {
    if (r.error) throw new Error(r.error);
    const matched = r.totalMatched ?? r.results?.length ?? 0;
    if (matched < probe.minHits) {
      throw new Error(`expected ≥${probe.minHits} hits, got ${matched} — hypergraph_edges may be empty (run npm run hypergraph:seed)`);
    }
    const top = r.results?.[0]?.edge;
    return `${matched} hits, top: ${top?.label ?? top?.title ?? '?'} grade=${top?.gradeLabel ?? top?.grade_label ?? '?'}`;
  });
}

// ── Cluster edge type filter (must work post-seed) ────────────────────────────
const ctxOnly = await callMcp('hypergraph.search', { query: 'src', limit: 3, edge_types: ['cluster_context'] }, 10_000)
  .catch((err) => ({ error: err.message }));
await check('edge_type filter cluster_context', () => {
  if (ctxOnly.error) throw new Error(ctxOnly.error);
  const matched = ctxOnly.totalMatched ?? ctxOnly.results?.length ?? 0;
  if (matched === 0) throw new Error('WARN: 0 cluster_context edges matched — seeder may need re-run');
  return `${matched} hits`;
});

// ── /api/ace/recommendations HTTP wrapper ────────────────────────────────────

if (!JSON_OUT) console.log('\n=== /api/ace/recommendations HTTP ===');

const httpRes = await fetch(`${SVELTEKIT}/api/ace/recommendations?filePath=${encodeURIComponent(PROBE_FILE)}&maxCards=2`, {
  signal: AbortSignal.timeout(10_000),
}).catch((err) => ({ ok: false, _err: err.message }));

await check('GET /api/ace/recommendations responds', async () => {
  if (httpRes._err) throw new Error('WARN: dev server unreachable: ' + httpRes._err);
  if (!httpRes.ok) throw new Error('WARN: HTTP ' + httpRes.status);
  const body = await httpRes.json();
  if (body.filePath !== PROBE_FILE) throw new Error(`echo mismatch: ${body.filePath}`);
  return `rank=${body.file?.rank ?? '?'}`;
});

// ── Output ───────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const summary = { passed, failed, warned, total: results.length };
const out = { runAt: new Date().toISOString(), summary, results };
writeFileSync(resolve(LOG_DIR, `smoke-atlas-${stamp}.json`), JSON.stringify(out, null, 2));
writeFileSync(resolve(LOG_DIR, 'smoke-atlas-latest.json'), JSON.stringify(out, null, 2));

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('');
  console.log(`  ${passed}/${results.length} pass${warned ? `, ${warned} warn` : ''}${failed ? `, ${failed} fail` : ''}`);
  console.log(`  → logs/task-output/pipeline-test/smoke-atlas-latest.json`);
}

const exitCode = failed > 0 ? 1 : (STRICT && warned > 0 ? 1 : 0);
process.exit(exitCode);
