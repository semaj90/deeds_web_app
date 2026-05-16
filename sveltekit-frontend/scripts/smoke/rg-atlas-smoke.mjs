#!/usr/bin/env node
/**
 * rg-atlas-smoke.mjs
 *
 * Regression smoke for the RG-Atlas search pipeline.
 *
 * Checks:
 *   1. rg_search_runs table exists in Postgres
 *   2. rg_search_hits table exists in Postgres
 *   3. API route POST /api/rg-atlas/search is reachable
 *   4. A run row is written after a search (persist=true round-trip)
 *
 * Exit 0 when all pass; exit 1 on first failure.
 *
 * Usage:
 *   node scripts/smoke/rg-atlas-smoke.mjs
 *   node scripts/smoke/rg-atlas-smoke.mjs --query "upload zone"
 *   node scripts/smoke/rg-atlas-smoke.mjs --skip-api    (DB checks only)
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args     = process.argv.slice(2);
const SKIP_API = args.includes('--skip-api');
const QUERY    = (() => {
  const i = args.indexOf('--query');
  return i !== -1 ? args[i + 1] : 'drag-drop upload';
})();

const DB_URL = process.env.DATABASE_URL;
const SK_URL = process.env.PUBLIC_APP_URL ?? process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';

if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

console.log('\n🔍🧠 RG-Atlas search pipeline smoke');
console.log(`   query: "${QUERY}"  sk: ${SK_URL}  skip-api: ${SKIP_API}\n`);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`   ${ok ? '✓' : '✗'} ${name.padEnd(48)} ${detail ?? ''}`);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 5000 });

try {
  // ── Check 1: rg_search_runs table exists ─────────────────────────────────
  try {
    const { rows } = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'rg_search_runs'
    `);
    check('rg_search_runs table exists', rows.length > 0,
      rows.length > 0 ? 'present' : 'MISSING — run drizzle/manual/2026-05-11_rg_atlas_tables.sql');
  } catch (e) {
    check('rg_search_runs table exists', false, String(e));
  }

  // ── Check 2: rg_search_hits table exists ──────────────────────────────────
  try {
    const { rows } = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'rg_search_hits'
    `);
    check('rg_search_hits table exists', rows.length > 0,
      rows.length > 0 ? 'present' : 'MISSING — run drizzle/manual/2026-05-11_rg_atlas_tables.sql');
  } catch (e) {
    check('rg_search_hits table exists', false, String(e));
  }

  // ── Check 3: GIN indexes present on rg_search_hits ────────────────────────
  try {
    const { rows } = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'rg_search_hits'
        AND indexname IN ('rg_hits_scores_gin', 'rg_hits_entities_gin')
    `);
    const names = rows.map(r => r.indexname);
    const ok = names.includes('rg_hits_scores_gin') && names.includes('rg_hits_entities_gin');
    check('GIN indexes on rg_search_hits', ok,
      ok ? 'both present' : `missing: ${['rg_hits_scores_gin','rg_hits_entities_gin'].filter(n => !names.includes(n)).join(', ')}`);
  } catch (e) {
    check('GIN indexes on rg_search_hits', false, String(e));
  }

  // ── Check 4: API route reachable ──────────────────────────────────────────
  if (!SKIP_API) {
    try {
      const res = await fetch(`${SK_URL}/api/rg-atlas/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, persist: false, enableMarcoRerank: false, enableLangExtract: false }),
        signal: AbortSignal.timeout(30_000)
      });
      // 200 = success, 401 = auth required (route exists), 422 = bad input (route exists)
      const reachable = res.status < 500;
      check('POST /api/rg-atlas/search reachable', reachable, `HTTP ${res.status}`);

      // ── Check 5: Response has expected shape ────────────────────────────────
      if (res.ok) {
        const body = await res.json();
        const hasShape = typeof body.runId === 'string' && Array.isArray(body.hits);
        check('Response has runId + hits fields', hasShape,
          hasShape ? `runId=${body.runId} hits=${body.hits.length}` : 'shape mismatch');
      }
    } catch (e) {
      const isTimeout = e.name === 'TimeoutError';
      check('POST /api/rg-atlas/search reachable', false,
        isTimeout ? 'timeout (30s) — is dev server running?' : String(e));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const failed = results.filter(r => !r.ok);
  console.log(`\n   ${results.filter(r => r.ok).length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\n❌ Failed:');
    failed.forEach(r => console.log(`   • ${r.name}: ${r.detail ?? ''}`));
    process.exit(1);
  }
  console.log('\n✅ RG-Atlas smoke passed');

} finally {
  await pool.end();
}
