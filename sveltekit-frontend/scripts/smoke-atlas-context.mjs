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
const APP_BASE    = process.env.PUBLIC_APP_URL ?? process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const SVELTEKIT_BASES = [APP_BASE, 'http://127.0.0.1:5174', 'http://127.0.0.1:4173'].filter((v, i, a) => a.indexOf(v) === i);
const JSON_OUT   = process.argv.includes('--json');
const STRICT     = process.argv.includes('--strict');

const LOG_DIR = resolve(ROOT, 'logs/task-output/pipeline-test');
mkdirSync(LOG_DIR, { recursive: true });

// Pinned probe path — high-PR file we expect every time.
// (db/client.ts ranks #1 across runs; if it ever drops out the atlas regen
//  is broken, which is exactly what this smoke catches.)
const PROBE_FILE = 'src/lib/server/db/client.ts';

const results = [];
let passed = 0, failed = 0, warned = 0, skipped = 0;

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
  if (!dataLine) {
    // Non-SSE response — surface a slice for diagnostics instead of "no SSE data"
    throw new Error(`MCP returned non-SSE body: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
  // Outer envelope must be JSON-RPC
  let payload;
  try {
    payload = JSON.parse(dataLine.slice(5).trim());
  } catch (e) {
    throw new Error(`MCP SSE envelope is not JSON: ${dataLine.slice(5, 120).trim()} (${e.message})`);
  }
  if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  const inner = payload.result?.content?.[0]?.text;
  if (!inner) return payload.result;
  // Tool result `text` may be a JSON string OR a degraded plain-text error
  // (e.g. "Connection is closed." when an upstream service drops). Parse
  // best-effort and fall back to wrapping the raw text so the caller gets
  // a structured object either way.
  try {
    return JSON.parse(inner);
  } catch {
    return { _degraded: true, _rawText: inner };
  }
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

function skip(name, reason) {
  results.push({ name, status: 'SKIP', detail: reason });
  skipped++;
  if (!JSON_OUT) console.log(`  SKIP ${name} — ${reason}`);
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
// hypergraph.search proxies through the app base. When the dev server is
// cold the MCP returns a connection-refused error — that is an infrastructure
// state, not a test regression. Pre-probe the app base and SKIP (not FAIL) if down.

let devServerUp = false;
try {
  const r = await fetch(`${APP_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
  devServerUp = r.ok;
} catch { /* unreachable */ }

if (!JSON_OUT) console.log('\n=== P1.8 — hypergraph.search regression ===');
if (!JSON_OUT && !devServerUp) {
  console.log('  NOTE dev server unreachable — P1.8 checks skipped (not a regression)');
}

const SEARCH_QUERIES = [
  { q: 'agentic',  minHits: 1, label: 'common code term' },
  { q: 'redis',    minHits: 1, label: 'common dependency' },
  { q: 'svelte',   minHits: 1, label: 'framework keyword' },
];

if (devServerUp) {
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
} else {
  for (const probe of SEARCH_QUERIES) {
    skip(`search '${probe.q}' (${probe.label})`, 'dev server down');
  }
}

// ── Cluster edge type filter (must work post-seed) ────────────────────────────
if (devServerUp) {
  const ctxOnly = await callMcp('hypergraph.search', { query: 'src', limit: 3, edge_types: ['cluster_context'] }, 10_000)
    .catch((err) => ({ error: err.message }));
  await check('edge_type filter cluster_context', () => {
    if (ctxOnly.error) throw new Error(ctxOnly.error);
    const matched = ctxOnly.totalMatched ?? ctxOnly.results?.length ?? 0;
    if (matched === 0) throw new Error('WARN: 0 cluster_context edges matched — seeder may need re-run');
    return `${matched} hits`;
  });
} else {
  skip('edge_type filter cluster_context', 'dev server down');
}

// Lane B regression — shared_resource edges from code_relations. Probe with
// a query that should hit at least one of the producer/consumer cohorts
// (Redis/Postgres/Qdrant/Neo4j adjacency). 0 hits = Lane B was never run
// or the seeder regressed.
if (devServerUp) {
  const sharedRes = await callMcp('hypergraph.search', { query: 'redis', limit: 3, edge_types: ['shared_resource'] }, 10_000)
    .catch((err) => ({ error: err.message }));
  await check('edge_type filter shared_resource (Lane B)', () => {
    if (sharedRes.error) throw new Error(sharedRes.error);
    const matched = sharedRes.totalMatched ?? sharedRes.results?.length ?? 0;
    if (matched === 0) throw new Error('WARN: 0 shared_resource edges matched — run npm run hypergraph:seed:lane-b');
    const top = sharedRes.results?.[0]?.edge;
    return `${matched} hits, top: ${top?.label ?? top?.title ?? '?'}`;
  });
} else {
  skip('edge_type filter shared_resource (Lane B)', 'dev server down');
}

// ── /api/ace/recommendations HTTP wrapper ────────────────────────────────────

if (!JSON_OUT) console.log('\n=== /api/ace/recommendations HTTP ===');

let httpRes = null;
let httpBase = '';
let httpErr = '';
let httpServerUp = false;
for (const base of SVELTEKIT_BASES) {
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (health?.ok) {
    httpServerUp = true;
    break;
  }
}

if (httpServerUp) {
  for (const base of SVELTEKIT_BASES) {
    const res = await fetch(`${base}/api/ace/recommendations?filePath=${encodeURIComponent(PROBE_FILE)}&maxCards=2`, {
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => ({ ok: false, _err: err.message }));
    if (!res._err && res.ok) {
      httpRes = res;
      httpBase = base;
      break;
    }
    if (!res._err && res.status !== 404) {
      httpRes = res;
      httpBase = base;
      break;
    }
    httpErr = res._err ?? `HTTP ${res.status}`;
    httpRes = res;
  }

  await check('GET /api/ace/recommendations responds', async () => {
    if (httpRes._err) throw new Error('WARN: dev server unreachable: ' + httpErr);
    if (!httpRes.ok) throw new Error(`WARN: ${httpBase} HTTP ${httpRes.status}`);
    const body = await httpRes.json();
    if (body.filePath !== PROBE_FILE) throw new Error(`echo mismatch: ${body.filePath}`);
    return `rank=${body.file?.rank ?? '?'}`;
  });
} else {
  skip('GET /api/ace/recommendations responds', 'dev server down');
}

// ── Output ───────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const summary = { passed, failed, warned, skipped, total: results.length };
const out = { runAt: new Date().toISOString(), summary, results };
writeFileSync(resolve(LOG_DIR, `smoke-atlas-${stamp}.json`), JSON.stringify(out, null, 2));
writeFileSync(resolve(LOG_DIR, 'smoke-atlas-latest.json'), JSON.stringify(out, null, 2));

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('');
  console.log(`  ${passed}/${results.length} pass${skipped ? `, ${skipped} skip` : ''}${warned ? `, ${warned} warn` : ''}${failed ? `, ${failed} fail` : ''}`);
  console.log(`  → logs/task-output/pipeline-test/smoke-atlas-latest.json`);
}

const exitCode = failed > 0 ? 1 : (STRICT && warned > 0 ? 1 : 0);
process.exit(exitCode);
