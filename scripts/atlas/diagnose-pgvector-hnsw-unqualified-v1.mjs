#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const sampleLimit = Number(process.env.PGVECTOR_DIAGNOSTIC_SAMPLE_LIMIT ?? 5);
const topK = Number(process.env.PGVECTOR_DIAGNOSTIC_TOP_K ?? 10);
if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 10) {
  throw new Error('PGVECTOR_DIAGNOSTIC_SAMPLE_LIMIT must be an integer from 1 to 10');
}
if (!Number.isInteger(topK) || topK < 1 || topK > 100) {
  throw new Error('PGVECTOR_DIAGNOSTIC_TOP_K must be an integer from 1 to 100');
}

const outputPath = path.resolve(
  REPO_ROOT,
  process.env.PGVECTOR_DIAGNOSTIC_OUTPUT ?? 'docs/reports/pgvector-hnsw-unqualified-diagnostic-v1.json',
);
const reportsRoot = path.resolve(REPO_ROOT, 'docs/reports') + path.sep;
if (!outputPath.startsWith(reportsRoot)) {
  throw new Error('PGVECTOR_DIAGNOSTIC_OUTPUT must stay under docs/reports');
}
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 90000,
});
const cohorts = [
  { key: 'halfvec_content', column: 'content_embedding', cast: 'halfvec' },
  { key: 'vector_content_768', column: 'content_embedding_768', cast: 'vector' },
];
const hash = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const readExplain = (result) => {
  const value = result.rows[0]?.['QUERY PLAN'] ?? Object.values(result.rows[0] ?? {})[0];
  return typeof value === 'string' ? JSON.parse(value) : value;
};
const planNodeTypes = (root) => {
  if (!root) return [];
  return [root['Node Type'], ...(root.Plans ?? []).flatMap(planNodeTypes)];
};
const elapsed = async (run) => {
  const start = performance.now();
  const result = await run();
  return { result, elapsedMs: Number((performance.now() - start).toFixed(3)) };
};

const report = {
  schema: 'atlas.pgvector-hnsw-unqualified-diagnostic.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  semanticQualityClaim: false,
  lineageQualification: 'BLOCKED_MISSING_SOURCE_AND_WORKSPACE_REVISIONS',
  sampleLimit,
  topK,
  queryMode: 'DETERMINISTIC_CORPUS_ROWS_EXCLUDED_FROM_CANDIDATES',
  cohorts: [],
  status: 'RUNNING',
};

try {
  await pool.query('BEGIN READ ONLY');
  for (const cohort of cohorts) {
    const { column, cast, key } = cohort;
    const indexResult = await pool.query(`
      SELECT indexname, indexdef, pg_relation_size((quote_ident(schemaname) || '.' || quote_ident(indexname))::regclass)::bigint::text AS size_bytes
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'codebase_chunk_index'
        AND indexdef ILIKE '%USING hnsw%' AND indexdef ILIKE '%' || $1 || '%'
      ORDER BY indexname
    `, [column]);
    const countResult = await pool.query(`
      SELECT count(*)::bigint::text AS row_count,
             count(*) FILTER (WHERE source_revision IS NOT NULL)::bigint::text AS source_revision_count,
             count(*) FILTER (WHERE workspace_revision IS NOT NULL)::bigint::text AS workspace_revision_count
      FROM public.codebase_chunk_index WHERE ${column} IS NOT NULL
    `);
    const samples = await pool.query(`
      SELECT id::text AS id, ${column}::text AS vector
      FROM public.codebase_chunk_index
      WHERE ${column} IS NOT NULL
      ORDER BY md5(id::text), id
      LIMIT $1
    `, [sampleLimit]);
    const detail = {
      key,
      column: `public.codebase_chunk_index.${column}`,
      vectorCast: cast,
      rowCount: countResult.rows[0].row_count,
      sourceRevisionCount: countResult.rows[0].source_revision_count,
      workspaceRevisionCount: countResult.rows[0].workspace_revision_count,
      indexes: indexResult.rows,
      queryIdsChecksum: hash(JSON.stringify(samples.rows.map((row) => row.id))),
      queryCount: samples.rows.length,
      queries: [],
    };

    for (const sample of samples.rows) {
      const query = `
        SELECT id::text AS id
        FROM public.codebase_chunk_index
        WHERE ${column} IS NOT NULL
          AND id <> $1::uuid
        ORDER BY ${column} <=> $2::${cast}, id
        LIMIT $3
      `;
      await pool.query('SET LOCAL enable_seqscan = on');
      await pool.query('SET LOCAL enable_indexscan = off');
      await pool.query('SET LOCAL enable_indexonlyscan = off');
      await pool.query('SET LOCAL enable_bitmapscan = off');
      const exactParams = [sample.id, sample.vector, topK];
      const exactPlan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, exactParams);
      const exactRun = await elapsed(() => pool.query(query, exactParams));

      await pool.query('SET LOCAL enable_seqscan = off');
      await pool.query('SET LOCAL enable_indexscan = on');
      await pool.query('SET LOCAL enable_indexonlyscan = on');
      await pool.query('SET LOCAL enable_bitmapscan = on');
      await pool.query('SET LOCAL hnsw.ef_search = 100');
      await pool.query("SET LOCAL hnsw.iterative_scan = 'strict_order'");
      const hnswPlan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, exactParams);
      const hnswRun = await elapsed(() => pool.query(query, exactParams));
      const exactIds = exactRun.result.rows.map((row) => row.id);
      const hnswIds = hnswRun.result.rows.map((row) => row.id);
      const exactSet = new Set(exactIds);
      const expectedIndex = detail.indexes.find((index) => index.indexdef.includes(`(${column} `));
      const exactExplain = readExplain(exactPlan);
      const hnswExplain = readExplain(hnswPlan);
      const exactPlanRoot = exactExplain?.[0]?.Plan ?? null;
      const hnswPlanRoot = hnswExplain?.[0]?.Plan ?? null;
      const exactNodeTypes = planNodeTypes(exactPlanRoot);
      const hnswNodeTypes = planNodeTypes(hnswPlanRoot);
      const planText = JSON.stringify(hnswExplain ?? {});
      detail.queries.push({
        queryId: sample.id,
        exactIdsChecksum: hash(JSON.stringify(exactIds)),
        hnswIdsChecksum: hash(JSON.stringify(hnswIds)),
        recallAtK: exactIds.length ? hnswIds.filter((id) => exactSet.has(id)).length / exactIds.length : null,
        exactMs: exactRun.elapsedMs,
        hnswMs: hnswRun.elapsedMs,
        exactPlanNodeTypes: exactNodeTypes,
        exactPlanUsesSeqScan: exactNodeTypes.includes('Seq Scan'),
        hnswPlanNodeTypes: hnswNodeTypes,
        hnswPlanNode: hnswPlanRoot?.['Node Type'] ?? null,
        expectedHnswIndex: expectedIndex?.indexname ?? null,
        expectedHnswIndexUsed: Boolean(expectedIndex && planText.includes(expectedIndex.indexname)),
      });
    }
    detail.meanRecallAtK = detail.queries.length
      ? detail.queries.reduce((sum, query) => sum + query.recallAtK, 0) / detail.queries.length
      : null;
    detail.meanExactMs = detail.queries.length
      ? detail.queries.reduce((sum, query) => sum + query.exactMs, 0) / detail.queries.length
      : null;
    detail.meanHnswMs = detail.queries.length
      ? detail.queries.reduce((sum, query) => sum + query.hnswMs, 0) / detail.queries.length
      : null;
    report.cohorts.push(detail);
  }
  await pool.query('ROLLBACK');
  report.status = 'DIAGNOSTIC_COMPLETE_UNQUALIFIED_LINEAGE';
} catch (error) {
  try { await pool.query('ROLLBACK'); } catch {}
  report.status = 'DIAGNOSTIC_ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status: report.status,
  readOnly: report.readOnly,
  semanticQualityClaim: report.semanticQualityClaim,
  cohorts: report.cohorts.map(({ key, rowCount, queryCount, meanRecallAtK, meanExactMs, meanHnswMs }) => ({
    key, rowCount, queryCount, meanRecallAtK, meanExactMs, meanHnswMs,
  })),
  outputPath,
}, null, 2));

if (report.status === 'DIAGNOSTIC_ERROR') process.exitCode = 1;
