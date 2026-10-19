#!/usr/bin/env node
/**
 * LEXICAL-02F: bounded comparison of POSTGRES_FTS (ts_rank_cd/tsvector, the
 * live canonical lane) vs the new pg_search-native bm25 index built this
 * session (idx_codebase_chunk_pgsearch_bm25), on the same frozen 8-query set
 * from audit-postgres-fts-identity-coverage.mjs.
 *
 * HONEST SCOPE: this is NOT a Recall@K/NDCG/MRR benchmark. Those require
 * labeled relevance judgments (a gold-standard "which results are actually
 * relevant to this query" set), which does not exist for this corpus. This
 * script measures what CAN be measured without ground truth: result count,
 * latency, and top-10 overlap between the two lanes. Do not read the output
 * of this script as proof either lane is "better" -- it is descriptive, not
 * evaluative. Never writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const FROZEN_QUERIES = [
  'IngestionJobStatus',
  'GpuConfig',
  'SystemStatus',
  'ErrorPatchLogInsert',
  'extractLegalEntities',
  'CourtroomScene',
  'embedding search',
  'packet identity',
];

const env = loadRepoEnv(process.env);
const outputArgument = process.argv.slice(2).find((argument) => argument.startsWith('--output='));
const outPath = outputArgument ? path.resolve(REPO_ROOT, outputArgument.slice('--output='.length)) : path.join(REPO_ROOT, 'docs/reports/postgres-fts-vs-pgsearch-bm25-comparison-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  options: '-c default_transaction_read_only=on -c lock_timeout=3000',
  application_name: 'atlas-lexical-readonly-benchmark-v1',
});

const report = {
  schema: 'atlas.postgres-fts-vs-pgsearch-bm25-comparison.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  promotionEligible: false,
  isolation: 'REPEATABLE READ READ ONLY',
  timingCaveat: 'One FTS-first trial per query; plans execute a second read. Cache/order effects are uncontrolled, and tied scores have no deterministic tie-break.',
  scopeNote: 'NOT a Recall@K/NDCG/MRR benchmark -- no ground truth exists for this corpus. '
    + 'Measures result count, latency, and top-10 overlap only. Descriptive, not evaluative.',
  perQueryResults: [],
};

async function runFts(query) {
  const start = performance.now();
  const sql = `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
     SELECT ci.id, ci.relative_path, ts_rank_cd(ci.search_vector, q.tsq, 32)::double precision AS score
     FROM codebase_chunk_index ci, q
     WHERE ci.search_vector @@ q.tsq
     ORDER BY score DESC
     LIMIT 10`;
  const { rows } = await pool.query(sql, [query]);
  const latencyMs = performance.now() - start;
  const plan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${sql}`, [query]);
  return { latencyMs, rows, plan: plan.rows[0]['QUERY PLAN'][0] };
}

async function runPgSearchBm25(query) {
  const start = performance.now();
  const sql = `SELECT id, relative_path, paradedb.score(id)::double precision AS score
     FROM codebase_chunk_index
     WHERE content @@@ $1
     ORDER BY score DESC
     LIMIT 10`;
  const { rows } = await pool.query(sql, [query]);
  const latencyMs = performance.now() - start;
  const plan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${sql}`, [query]);
  return { latencyMs, rows, plan: plan.rows[0]['QUERY PLAN'][0] };
}

try {
  await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  report.databaseContext = (await pool.query(`SELECT current_database() AS database,
    current_setting('server_version') AS server_version,
    current_setting('transaction_read_only') AS transaction_read_only,
    current_setting('transaction_isolation') AS transaction_isolation,
    transaction_timestamp() AS observed_at`)).rows[0];
  for (const query of FROZEN_QUERIES) {
    const fts = await runFts(query);
    const bm25 = await runPgSearchBm25(query);
    const ftsIds = new Set(fts.rows.map((r) => r.id));
    const bm25Ids = new Set(bm25.rows.map((r) => r.id));
    const overlap = [...ftsIds].filter((id) => bm25Ids.has(id));

    report.perQueryResults.push({
      query,
      postgresFts: {
        resultCount: fts.rows.length,
        latencyMs: Number(fts.latencyMs.toFixed(2)),
        plan: fts.plan,
        top3: fts.rows.slice(0, 3).map((r) => ({ path: r.relative_path, score: r.score })),
      },
      pgSearchBm25: {
        resultCount: bm25.rows.length,
        latencyMs: Number(bm25.latencyMs.toFixed(2)),
        plan: bm25.plan,
        top3: bm25.rows.slice(0, 3).map((r) => ({ path: r.relative_path, score: r.score })),
      },
      top10OverlapCount: overlap.length,
      top10JaccardApprox: ftsIds.size + bm25Ids.size > 0
        ? Number((overlap.length / (ftsIds.size + bm25Ids.size - overlap.length || 1)).toFixed(3))
        : 0,
    });
  }
} catch (error) {
  report.fatalError = error.message;
} finally {
  try { await pool.query('ROLLBACK'); } catch (error) { report.rollbackError = error.message; }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pool.end();
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: outputArgument ? 'wx' : 'w' });
}

console.log(JSON.stringify({ output: outPath, databaseContext: report.databaseContext,
  databaseWrites: report.databaseWrites, promotionEligible: report.promotionEligible,
  fatalError: report.fatalError ?? null,
  queries: report.perQueryResults.map((result) => ({ query: result.query,
    ftsMs: result.postgresFts.latencyMs, bm25Ms: result.pgSearchBm25.latencyMs,
    overlap: result.top10OverlapCount })),
}, null, 2));
if (report.fatalError) process.exitCode = 1;
