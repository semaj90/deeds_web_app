#!/usr/bin/env node

/**
 * Read-only census of the lexical owner for Graphify code retrieval.
 * It distinguishes PostgreSQL FTS (tsvector/ts_rank_cd) from pg_search BM25.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const outArg = process.argv.find((value) => value.startsWith('--out='));
const outPath = path.resolve(REPO_ROOT, outArg?.slice(6) ?? 'docs/reports/graphify-lexical-owner-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});

const report = {
  schema: 'atlas.graphify-lexical-owner.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  table: 'codebase_chunk_index',
  extensions: [],
  columns: [],
  indexes: [],
  triggers: [],
  counts: {},
  owner: 'UNVERIFIED',
  findings: [],
};

try {
  const extensions = await pool.query(`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname IN ('pg_search', 'vector', 'pg_trgm')
    ORDER BY extname
  `);
  report.extensions = extensions.rows;

  const columns = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'codebase_chunk_index'
      AND column_name IN ('search_vector', 'ast_symbols', 'content_embedding_768', 'content_embedding')
    ORDER BY column_name
  `);
  report.columns = columns.rows;

  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'codebase_chunk_index'
    ORDER BY indexname
  `);
  report.indexes = indexes.rows;

  const triggers = await pool.query(`
    SELECT tgname, pg_get_triggerdef(oid) AS definition
    FROM pg_trigger
    WHERE tgrelid = 'public.codebase_chunk_index'::regclass AND NOT tgisinternal
    ORDER BY tgname
  `);
  report.triggers = triggers.rows;

  const counts = await pool.query(`
    SELECT
      count(*)::bigint AS total,
      count(*) FILTER (WHERE search_vector IS NOT NULL)::bigint AS search_vector,
      count(*) FILTER (WHERE ast_symbols IS NOT NULL AND jsonb_array_length(ast_symbols) > 0)::bigint AS ast_symbols,
      count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::bigint AS content_embedding_768,
      count(*) FILTER (WHERE content_embedding IS NOT NULL)::bigint AS content_embedding
    FROM public.codebase_chunk_index
  `);
  report.counts = Object.fromEntries(Object.entries(counts.rows[0] ?? {}).map(([key, value]) => [key, Number(value)]));

  const hasSearch = report.extensions.some((row) => row.extname === 'pg_search');
  const hasTsvector = report.columns.some((row) => row.column_name === 'search_vector' && row.udt_name === 'tsvector');
  const hasGin = report.indexes.some((row) => /USING gin\s*\(.*search_vector/i.test(row.indexdef));
  const hasTrigger = report.triggers.some((row) => /search_vector/i.test(row.definition));
  if (hasSearch) report.findings.push('pg_search extension is installed; query ownership still requires a live pg_search scorer/index proof.');
  if (hasTsvector && hasGin && hasTrigger) report.owner = 'POSTGRES_FTS_TSVECTOR_TS_RANK_CD';
  else report.findings.push('PostgreSQL FTS shape is incomplete or differs from the expected search_vector/GIN/trigger contract.');
  if (report.owner === 'POSTGRES_FTS_TSVECTOR_TS_RANK_CD' && hasSearch) report.findings.push('pg_search is available but is not promoted as the owner by this receipt.');
} catch (error) {
  report.status = 'FAIL';
  report.findings.push(error.message);
} finally {
  report.status ??= report.owner === 'UNVERIFIED' ? 'WARN' : 'PASS';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({
  status: report.status,
  owner: report.owner,
  extensions: report.extensions,
  counts: report.counts,
  out: outPath,
  findings: report.findings,
}, null, 2));
if (report.status === 'FAIL') process.exitCode = 1;
