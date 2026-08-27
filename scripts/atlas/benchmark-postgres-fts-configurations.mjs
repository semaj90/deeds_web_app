#!/usr/bin/env node

/**
 * Read-only comparison of english versus simple query parsing for code terms.
 * The stored search_vector producer is intentionally not modified here.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const outArg = process.argv.find((value) => value.startsWith('--out='));
const outPath = path.resolve(REPO_ROOT, outArg?.slice(6) ?? 'docs/reports/postgres-fts-configurations-v1.json');
const queries = [
  'getUserById',
  'semantic_768',
  'qdrant_point_id',
  'src/lib/server',
  'CUDA',
  'ast_symbols',
  'Qdrant payload revision',
];

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});

const report = {
  schema: 'atlas.postgres-fts-configurations.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  table: 'codebase_chunk_index',
  queryConfigurations: ['english', 'simple'],
  queries,
  results: [],
  summary: {},
};

try {
  for (const query of queries) {
    const rows = {};
    for (const configuration of report.queryConfigurations) {
      const result = await pool.query(`
        SELECT ci.id::text AS id,
               ci.relative_path,
               ts_rank_cd(ci.search_vector, q.tsq, 32)::double precision AS score
        FROM codebase_chunk_index ci
        CROSS JOIN LATERAL websearch_to_tsquery($1::regconfig, $2) AS q(tsq)
        WHERE ci.search_vector @@ q.tsq
        ORDER BY score DESC, ci.id
        LIMIT 10
      `, [configuration, query]);
      rows[configuration] = {
        matchCountTop10: result.rows.length,
        topIds: result.rows.map((row) => row.id),
        topPaths: result.rows.map((row) => row.relative_path).filter(Boolean),
        topScores: result.rows.map((row) => Number(row.score)),
      };
    }
    report.results.push({ query, configurations: rows });
  }

  report.summary = Object.fromEntries(report.queryConfigurations.map((configuration) => [
    configuration,
    {
      queriesWithMatches: report.results.filter((row) => row.configurations[configuration].matchCountTop10 > 0).length,
      totalTop10Matches: report.results.reduce((sum, row) => sum + row.configurations[configuration].matchCountTop10, 0),
    },
  ]));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({ status: report.status, summary: report.summary, out: outPath }, null, 2));
if (report.status === 'FAIL') process.exitCode = 1;
