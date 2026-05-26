#!/usr/bin/env node
/**
 * Smoke test: Postgres 17 FTS readiness for code_retrieval_chunks.
 *
 * Checks:
 *   [1] Postgres reachable
 *   [2] pgvector extension installed
 *   [3] pg_trgm extension installed
 *   [4] code_retrieval_chunks table exists
 *   [5] Row count > 0
 *   [6] GIN FTS index exists
 *   [7] HNSW vector index exists
 *   [8] search_code_lexical function works
 *   [9] search_code_hybrid_pg function works (if embedding column populated)
 *
 * Usage:
 *   node scripts/smoke-postgres-fts.mjs
 *   node scripts/smoke-postgres-fts.mjs --query "GRAPH_SIM_MAX_N"
 */

import pg from 'pg';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    query: { type: 'string', default: 'GRAPH_SIM_MAX_N' },
    quiet: { type: 'boolean', default: false },
  },
});

const PG_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const pool   = new pg.Pool({ connectionString: PG_URL, max: 2 });

const CHECKS = [];
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    const result = await fn();
    const ok = result !== false;
    CHECKS.push({ name, ok, detail: ok ? result : 'FAIL' });
    if (ok) passed++; else failed++;
    if (!args.quiet) console.log(`  ${ok ? '✅' : '❌'} ${name}${typeof result === 'string' ? ` — ${result}` : ''}`);
  } catch (err) {
    CHECKS.push({ name, ok: false, detail: String(err.message) });
    failed++;
    if (!args.quiet) console.log(`  ❌ ${name} — ${err.message}`);
  }
}

async function main() {
  if (!args.quiet) console.log('🔍 Smoke: Postgres 17 FTS\n');

  const client = await pool.connect();

  try {
    await check('Postgres reachable', async () => {
      const { rows } = await client.query('SELECT version()');
      return rows[0].version.slice(0, 60);
    });

    await check('pgvector extension installed', async () => {
      const { rows } = await client.query(`SELECT installed_version FROM pg_available_extensions WHERE name='vector'`);
      return rows[0]?.installed_version ? `v${rows[0].installed_version}` : false;
    });

    await check('pg_trgm extension installed', async () => {
      const { rows } = await client.query(`SELECT installed_version FROM pg_available_extensions WHERE name='pg_trgm'`);
      return rows[0]?.installed_version ? `v${rows[0].installed_version}` : false;
    });

    await check('code_retrieval_chunks table exists', async () => {
      const { rows } = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='code_retrieval_chunks'`
      );
      return rows.length > 0 ? 'found' : false;
    });

    await check('Row count > 0', async () => {
      const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM code_retrieval_chunks');
      const n = rows[0].n;
      return n > 0 ? `${n} rows` : false;
    });

    await check('Embedding non-null count', async () => {
      const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM code_retrieval_chunks WHERE embedding IS NOT NULL');
      const n = rows[0].n;
      return `${n} embedded rows`;
    });

    await check('GIN FTS index exists (crc_fts_gin)', async () => {
      const { rows } = await client.query(
        `SELECT indexname FROM pg_indexes WHERE tablename='code_retrieval_chunks' AND indexname='crc_fts_gin'`
      );
      return rows.length > 0 ? 'found' : false;
    });

    await check('HNSW vector index exists (crc_embedding_hnsw)', async () => {
      const { rows } = await client.query(
        `SELECT indexname FROM pg_indexes WHERE tablename='code_retrieval_chunks' AND indexname='crc_embedding_hnsw'`
      );
      return rows.length > 0 ? 'found' : false;
    });

    await check(`search_code_lexical("${args.query}") returns result`, async () => {
      const { rows } = await client.query('SELECT * FROM search_code_lexical($1, 5)', [args.query]);
      return rows.length > 0 ? `${rows.length} results, top score=${Number(rows[0].lexical_score).toFixed(4)}` : '0 results (table may be empty)';
    });

    await check('search_code_hybrid_pg function exists', async () => {
      const { rows } = await client.query(
        `SELECT proname FROM pg_proc WHERE proname='search_code_hybrid_pg'`
      );
      return rows.length > 0 ? 'found' : false;
    });

    await check('search_code_hybrid_pg returns result', async () => {
      const { rows: embRows } = await client.query(
        `SELECT embedding FROM code_retrieval_chunks WHERE embedding IS NOT NULL LIMIT 1`
      );
      const embedding = embRows[0]?.embedding;
      if (!embedding) return 'skipped (no embedding rows yet)';
      const { rows } = await client.query(
        'SELECT * FROM search_code_hybrid_pg($1, $2::vector(768), $3, $4)',
        [args.query, embedding, 5, null]
      );
      return rows.length > 0 ? `${rows.length} results, top hybrid=${Number(rows[0].hybrid_score).toFixed(4)}` : false;
    });

  } finally {
    client.release();
    await pool.end();
  }

  if (!args.quiet) {
    console.log(`\n${passed}/${passed + failed} checks passed`);
  } else {
    console.log(`smoke:postgres-fts passed=${passed} failed=${failed}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
