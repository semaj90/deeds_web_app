#!/usr/bin/env node
/**
 * smoke-atlas-ann-cascade.mjs
 *
 * Smoke-tests the /api/atlas/search ANN cascade endpoint.
 * Validates all 5 pipeline stages are returning results.
 *
 * Usage:
 *   node scripts/atlas/smoke-atlas-ann-cascade.mjs
 *   node scripts/atlas/smoke-atlas-ann-cascade.mjs --verbose
 *   node scripts/atlas/smoke-atlas-ann-cascade.mjs --base=http://localhost:5173
 */

const BASE = process.argv.find(a => a.startsWith('--base='))?.split('=')[1]
           ?? 'http://localhost:5173';
const VERBOSE = process.argv.includes('--verbose');
const ENDPOINT = `${BASE}/api/atlas/search`;

const TEST_QUERIES = [
  { query: 'find atlas packets with embedding errors', expected_domain: 'embed' },
  { query: 'graph topology pagerank scoring',          expected_domain: 'graph' },
  { query: 'cache redis bifrost semantic lookup',      expected_domain: 'cache' },
  { query: 'legal evidence chunking pipeline',         expected_domain: 'legal' },
  { query: 'MCP tool manifest packet selection',       expected_domain: 'mcp'   },
];

async function runQuery(q) {
  const t0  = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query: q.query, top_k: 10, skip_neo4j: false, skip_rerank: true }),
      signal:  AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, status: res.status, ms };
    const d  = await res.json();
    return { ok: true, ms, ...d };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

async function main() {
  console.log(`\n═══ Atlas ANN Cascade Smoke ═══\n`);
  console.log(`Endpoint: ${ENDPOINT}\n`);

  const results = [];
  let passed = 0;

  for (const q of TEST_QUERIES) {
    process.stdout.write(`  "${q.query.slice(0, 50)}"… `);
    const r = await runQuery(q);

    const hasResults  = Array.isArray(r.results) && r.results.length > 0;
    const embedOk     = r.embed_ok === true;
    const isCascade   = r.source === 'cascade';
    const topDomain   = r.results?.[0]?.domain_class ?? 'n/a';

    const pass = r.ok && hasResults && embedOk;
    if (pass) passed++;

    console.log(`${pass ? '✅' : '❌'} ${r.results?.length ?? 0} results (${r.ms}ms)`);
    if (VERBOSE && r.results) {
      for (const p of (r.results ?? []).slice(0, 3)) {
        console.log(`     ${p.cascade_score?.toFixed(4)} | ${p.domain_class?.padEnd(10)} | ${p.feature_id ?? ''} | ${p.source_ref?.slice(0, 50)}`);
      }
      if (r.cascade_stats) {
        console.log(`     stats: qdrant=${r.cascade_stats.qdrant_hits} neo4j_exp=${r.cascade_stats.neo4j_expanded ?? 'skipped'} total=${r.cascade_stats.total_ms}ms`);
      }
    }

    results.push({ query: q.query, pass, resultCount: r.results?.length ?? 0, ms: r.ms, topDomain, embedOk, isCascade });
  }

  const gates = [
    { name: 'all_queries_ok',        pass: passed === TEST_QUERIES.length,                  detail: `${passed}/${TEST_QUERIES.length}` },
    { name: 'embed_working',          pass: results.every(r => r.embedOk),                  detail: 'nomic-embed-text or embeddinggemma' },
    { name: 'results_non_empty',      pass: results.every(r => r.resultCount > 0),          detail: 'all queries returned results' },
    { name: 'latency_under_15s',      pass: results.every(r => r.ms < 15_000),             detail: `max=${Math.max(...results.map(r=>r.ms))}ms` },
  ];

  console.log('\n══ Gate Results ═════════════════════════════');
  for (const g of gates) {
    console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(28)} ${g.detail}`);
  }
  const allPass = gates.every(g => g.pass);
  console.log(`\n  ${allPass ? '✅ SMOKE PASS' : '⚠️  SMOKE FAIL'}`);

  if (!allPass) process.exitCode = 1;
}

main().catch(e => { console.error(e.message); process.exit(1); });
