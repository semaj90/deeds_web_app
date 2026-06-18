#!/usr/bin/env node
// Run via: npx vite-node scripts/atlas/benchmark-retrieval-e2e.mjs
// or:      npm run benchmark:retrieval-e2e
/**
 * benchmark-retrieval-e2e.mjs
 *
 * Runs a golden query set through hyperragPacketRpc, recording per-lane latency
 * and hit quality from atlas_retrieval_eval_times. Compares cache-hit vs live path.
 *
 * Outputs:
 *   .tmp/benchmark-retrieval-e2e.json     — full results
 *   .tmp/benchmark-retrieval-e2e.txt      — human-readable summary
 *
 * Flags:
 *   --verbose      print per-query breakdown
 *   --limit=N      packets per query (default: 5)
 *   --queries=path path to JSONL file of {"query":"..."} lines (optional)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..'); // sveltekit-frontend/
const TMP       = join(ROOT, '.tmp');

// ── .env loader ───────────────────────────────────────────────────────────────
for (const envFile of [join(ROOT, '.env'), join(ROOT, '..', '.env')]) {
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}

const VERBOSE  = process.argv.includes('--verbose');
const RAW_LIM  = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = RAW_LIM ? Math.max(1, parseInt(RAW_LIM.split('=')[1], 10)) : 5;
const RAW_Q    = process.argv.find(a => a.startsWith('--queries='));
const PG_URL   = process.env.DATABASE_URL ?? null;

// ── Golden query set ──────────────────────────────────────────────────────────

const GOLDEN_QUERIES = RAW_Q && existsSync(RAW_Q.split('=')[1])
  ? readFileSync(RAW_Q.split('=')[1], 'utf8').split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l).query ?? l; } catch { return l; }
    })
  : [
      'qdrant vector retrieval fusion RRF',
      'neo4j graph community authority score',
      'atlas packet metadata topology community_id',
      'redis valkey exact match cache hyperrag',
      'postgres BM25 full text search retrieval',
      'SOM cluster som_x som_y centroid',
      'drizzle schema migration retrieval eval times',
      'sveltekit route server API endpoint',
      'embeddings 768 dimension codebase chunks',
      'legal document case notes schema',
    ];

// ── DB helper ─────────────────────────────────────────────────────────────────

async function queryEvalRows(pg, queryHashes) {
  if (!pg || !queryHashes.length) return [];
  try {
    const res = await pg.query(`
      SELECT query_hash, cache_hit_source,
             avg(qdrant_ms)::float   AS avg_qdrant,
             avg(pg_bm25_ms)::float  AS avg_bm25,
             avg(neo4j_ms)::float    AS avg_neo4j,
             avg(redis_ms)::float    AS avg_redis,
             avg(total_ms)::float    AS avg_total,
             count(*)::int           AS rows
      FROM   atlas_retrieval_eval_times
      WHERE  query_hash = ANY($1)
      GROUP  BY query_hash, cache_hit_source
      ORDER  BY query_hash, cache_hit_source NULLS LAST
    `, [queryHashes]);
    return res.rows;
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(TMP, { recursive: true });

  // Dynamic import to allow .env to be loaded first
  const { hyperragPacketRpc, closeHyperRagPacketRpcPool } = await import(
    '../../src/lib/server/retrieval/hyperrag-packet-rpc.js'
  );

  let pg;
  if (PG_URL) {
    try {
      const { default: pgPkg } = await import('pg');
      const Pool = pgPkg.Pool ?? pgPkg.default?.Pool;
      pg = new Pool({ connectionString: PG_URL, max: 2 });
    } catch { /* no pg */ }
  }

  const results = [];
  const queryHashes = [];

  console.log(`\n📊 benchmark-retrieval-e2e — ${GOLDEN_QUERIES.length} queries, limit=${LIMIT}\n`);

  for (const query of GOLDEN_QUERIES) {
    const t0 = performance.now();
    let ok = false;
    let packets = 0;
    let trace = null;
    let error = null;

    try {
      const res = await hyperragPacketRpc({
        query,
        limit: LIMIT,
        includeGraph: false,
        useFts: false,
        awaitTelemetry: true,
        useExactMatchCache: true,
      });
      ok      = true;
      packets = res.packets.length;
      trace   = res.trace;
      // collect first 16 hex chars of sha256 as query_hash proxy
      const { createHash } = await import('node:crypto');
      const h = createHash('sha256').update(query).digest('hex').slice(0, 16);
      queryHashes.push(h);
    } catch (err) {
      error = String(err?.message ?? err);
    }

    const wall_ms = Math.round(performance.now() - t0);

    const row = { query, ok, packets, wall_ms, trace, error };
    results.push(row);

    if (VERBOSE) {
      const tag = ok ? '✅' : '❌';
      console.log(`  ${tag} [${wall_ms}ms / ${packets} pkt] ${query.slice(0, 70)}`);
      if (error) console.log(`       ⚠ ${error}`);
    } else {
      process.stdout.write('.');
    }
  }

  if (!VERBOSE) process.stdout.write('\n');

  // Pull eval rows from DB
  const evalRows = await queryEvalRows(pg, queryHashes);
  if (pg) await pg.end().catch(() => {});
  await closeHyperRagPacketRpcPool().catch(() => {});

  // ── Aggregate stats ────────────────────────────────────────────────────────

  const passed     = results.filter(r => r.ok).length;
  const failed     = results.length - passed;
  const avgWall    = Math.round(results.reduce((s, r) => s + r.wall_ms, 0) / results.length);
  const cacheHits  = evalRows.filter(r => r.cache_hit_source === 'redis').length;
  const liveHits   = evalRows.filter(r => !r.cache_hit_source).length;

  const summary = {
    generatedAt:  new Date().toISOString(),
    queries:      GOLDEN_QUERIES.length,
    passed,
    failed,
    avg_wall_ms:  avgWall,
    cache_hits_in_db: cacheHits,
    live_hits_in_db:  liveHits,
    eval_rows:    evalRows,
    results,
  };

  writeFileSync(join(TMP, 'benchmark-retrieval-e2e.json'), JSON.stringify(summary, null, 2));

  // ── Human summary ──────────────────────────────────────────────────────────

  const lines = [
    `benchmark-retrieval-e2e — ${summary.generatedAt}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `queries    : ${summary.queries}`,
    `passed     : ${summary.passed}  failed: ${summary.failed}`,
    `avg wall ms: ${summary.avg_wall_ms}ms`,
    ``,
    `atlas_retrieval_eval_times breakdown:`,
    `  cache hits (redis): ${cacheHits} rows`,
    `  live hits:          ${liveHits} rows`,
    ``,
    `Per-lane DB averages (live path only):`,
  ];

  const liveEvalRows = evalRows.filter(r => !r.cache_hit_source);
  if (liveEvalRows.length) {
    for (const r of liveEvalRows) {
      lines.push(`  hash=${r.query_hash}  qdrant=${(r.avg_qdrant??0).toFixed(1)}ms  bm25=${(r.avg_bm25??0).toFixed(1)}ms  neo4j=${(r.avg_neo4j??0).toFixed(1)}ms  total=${(r.avg_total??0).toFixed(1)}ms`);
    }
  } else {
    lines.push('  (no live-path rows in DB for these queries)');
  }

  if (failed > 0) {
    lines.push('', 'Failures:');
    for (const r of results.filter(r => !r.ok)) {
      lines.push(`  ❌ "${r.query.slice(0, 60)}" → ${r.error}`);
    }
  }

  const txt = lines.join('\n') + '\n';
  writeFileSync(join(TMP, 'benchmark-retrieval-e2e.txt'), txt);
  console.log(txt);
  console.log(`✓ Results → .tmp/benchmark-retrieval-e2e.json`);
}

main().catch(err => {
  console.error('[benchmark] Fatal:', err.message);
  process.exit(1);
});
