#!/usr/bin/env node
/**
 * hypergraph-search-smoke.mjs
 *
 * Regression smoke for the hypergraph search lane. Catches the four
 * silent breakages that landed during P0.4:
 *
 *   1. Empty hypergraph_edges       (seeder never ran / wiped)
 *   2. Empty hypergraph_edge_members (members not joined)
 *   3. API path returns 0           (Vite/HMR/pg-pool drift; ILIKE branch dead)
 *   4. MCP path returns 0           (transport layer broken even when API works)
 *
 * Each check has its own assertion + clear error so a CI failure tells
 * you exactly which lane regressed.
 *
 * Exit 0 when all 4 pass; exit 1 with a summary on first failure.
 *
 * Usage:
 *   node scripts/smoke/hypergraph-search-smoke.mjs
 *   node scripts/smoke/hypergraph-search-smoke.mjs --query "ollama"
 *   node scripts/smoke/hypergraph-search-smoke.mjs --skip-mcp
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args      = process.argv.slice(2);
const SKIP_MCP  = args.includes('--skip-mcp');
const QUERY     = (() => {
  const i = args.indexOf('--query');
  return i !== -1 ? args[i + 1] : 'redis';
})();

const DB_URL    = process.env.DATABASE_URL;
const SK_URL    = process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const MCP_URL   = process.env.MCP_URL ?? 'http://127.0.0.1:8788';

if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

console.log('\n🕸️  Hypergraph search regression smoke');
console.log(`   query: "${QUERY}"  sk: ${SK_URL}  mcp: ${MCP_URL}\n`);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${name.padEnd(42)} ${detail ?? ''}`);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 5000 });

try {
  // 1. hypergraph_edges populated
  const edges = await pool.query(`SELECT count(*)::int AS n FROM hypergraph_edges`);
  const edgeCount = edges.rows[0].n;
  check('hypergraph_edges has rows',         edgeCount > 0, `n=${edgeCount}`);

  // 2. hypergraph_edge_members populated
  const members = await pool.query(`SELECT count(*)::int AS n FROM hypergraph_edge_members`);
  const memberCount = members.rows[0].n;
  check('hypergraph_edge_members has rows',  memberCount > 0, `n=${memberCount}`);

  // 3. SvelteKit API path returns hits
  let apiOk = false;
  let apiCount = 0;
  let apiSample = null;
  try {
    const res = await fetch(`${SK_URL}/api/hypergraph/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, limit: 3 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const j = await res.json();
      apiCount = j.totalMatched ?? j.results?.length ?? 0;
      apiOk = apiCount > 0;
      apiSample = j.results?.[0]?.edge ?? null;
    } else {
      apiSample = `HTTP ${res.status}`;
    }
  } catch (e) {
    apiSample = `fetch failed: ${e.message}`;
  }
  check('API /api/hypergraph/search hits',     apiOk, apiOk ? `n=${apiCount}, top: ${apiSample?.title ?? apiSample?.label ?? '?'}` : `${apiSample}`);

  // 3b. Result row carries the contract fields
  if (apiOk && apiSample) {
    const fields = ['title', 'label', 'gpuCluster', 'memberCount'];
    const missing = fields.filter(f => apiSample[f] === undefined);
    check('API result has contract fields',    missing.length === 0,
          missing.length ? `missing: ${missing.join(', ')}` : fields.join(', '));
  } else {
    check('API result has contract fields',    false, '(skipped — API returned 0)');
  }

  // 4. MCP path returns hits
  if (SKIP_MCP) {
    check('MCP hypergraph.search hits',        true, '(skipped via --skip-mcp)');
  } else {
    let mcpOk = false;
    let mcpCount = 0;
    try {
      const res = await fetch(`${MCP_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'tools/call',
          params: { name: 'hypergraph.search', arguments: { query: QUERY, limit: 3 } },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      const dataLine = text.split('\n').find(l => l.startsWith('data:'));
      if (dataLine) {
        const obj = JSON.parse(dataLine.slice(5));
        const inner = obj.result?.content?.[0]?.text;
        if (inner) {
          const parsed = JSON.parse(inner);
          mcpCount = parsed.totalMatched ?? parsed.results?.length ?? 0;
          mcpOk = mcpCount > 0;
        }
      }
    } catch { /* mcpOk stays false */ }
    check('MCP hypergraph.search hits',        mcpOk, `n=${mcpCount}`);
  }

  console.log('');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  if (failed.length === 0) {
    console.log(`✅ ${passed}/${results.length} pass — hypergraph search lane healthy.\n`);
  } else {
    console.log(`❌ ${passed}/${results.length} pass — ${failed.length} regression(s):`);
    for (const r of failed) console.log(`     - ${r.name}: ${r.detail}`);
    console.log(`\n   Common fixes:`);
    console.log(`     • empty edges/members  →  npm run seed:hypergraph`);
    console.log(`     • API 0 hits           →  restart \`npm run dev\` (Vite/HMR pool drift)`);
    console.log(`     • MCP 0 hits           →  restart MCP via \`npm run mcp:ensure\``);
    process.exit(1);
  }
} catch (err) {
  console.error(`❌ Smoke runner failed: ${err.message}`);
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
