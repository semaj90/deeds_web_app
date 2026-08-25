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
const outPath = path.join(REPO_ROOT, 'docs/reports/postgres-fts-vs-pgsearch-bm25-comparison-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 20000,
});

const report = {
  schema: 'atlas.postgres-fts-vs-pgsearch-bm25-comparison.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  scopeNote: 'NOT a Recall@K/NDCG/MRR benchmark -- no ground truth exists for this corpus. '
    + 'Measures result count, latency, and top-10 overlap only. Descriptive, not evaluative.',
  perQueryResults: [],
};

async function runFts(query) {
  const start = performance.now();
  const { rows } = await pool.query(
    `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
     SELECT ci.id, ci.relative_path, ts_rank_cd(ci.search_vector, q.tsq, 32)::double precision AS score
     FROM codebase_chunk_index ci, q
     WHERE ci.search_vector @@ q.tsq
     ORDER BY score DESC
     LIMIT 10`,
    [query],
  );
  return { latencyMs: performance.now() - start, rows };
}

async function runPgSearchBm25(query) {
  const start = performance.now();
  const { rows } = await pool.query(
    `SELECT id, relative_path, paradedb.score(id)::double precision AS score
     FROM codebase_chunk_index
     WHERE content @@@ $1
     ORDER BY score DESC
     LIMIT 10`,
    [query],
  );
  return { latencyMs: performance.now() - start, rows };
}

try {
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
        top3: fts.rows.slice(0, 3).map((r) => ({ path: r.relative_path, score: r.score })),
      },
      pgSearchBm25: {
        resultCount: bm25.rows.length,
        latencyMs: Number(bm25.latencyMs.toFixed(2)),
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
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify(report, null, 2));
if (report.fatalError) process.exitCode = 1;
