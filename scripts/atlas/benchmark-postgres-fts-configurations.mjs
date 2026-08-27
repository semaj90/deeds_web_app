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
  queryConfiguration: 'english',
  documentConfiguration: 'UNKNOWN',
  searchVectorProducer: null,
  ginIndexPresent: false,
  configurationAligned: false,
  queries,
  results: [],
  summary: {},
};

try {
  const producer = await pool.query(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'compute_codebase_chunk_search_vector'
    ORDER BY p.oid DESC
    LIMIT 1
  `);
  const definition = String(producer.rows[0]?.definition ?? '');
  report.searchVectorProducer = definition ? 'compute_codebase_chunk_search_vector' : null;
  const usesEnglish = definition.includes("to_tsvector('english'");
  const usesSimple = definition.includes("to_tsvector('simple'");
  report.documentConfiguration = usesEnglish && usesSimple ? 'MIXED' : usesEnglish ? 'english' : usesSimple ? 'simple' : 'UNKNOWN';
  const indexes = await pool.query(`
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'codebase_chunk_index'
      AND indexdef ILIKE '%gin%' AND indexdef ILIKE '%search_vector%'
    LIMIT 1
  `);
  report.ginIndexPresent = indexes.rowCount > 0;
  report.configurationAligned = report.documentConfiguration === report.queryConfiguration;

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
