#!/usr/bin/env node

/**
 * Read-only bounded pgvector semantic_768 replay.
 *
 * PostgreSQL remains canonical. This script does not create indexes, update
 * rows, or promote HNSW. It compares exact cosine ordering with the existing
 * content_embedding_768 HNSW index on the same revision-qualified cohort.
 */

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...rest] = arg.slice(2).split('=');
  return [key, rest.join('=') || true];
}));
const outputPath = resolve(REPO_ROOT, String(args.get('output') || 'docs/reports/postgres-pgvector-exact-hnsw-replay-v1.json'));
const limit = Math.max(1, Math.min(32, Number(args.get('limit') || 8)));
const topK = Math.max(1, Math.min(20, Number(args.get('top-k') || 5)));
const requestedWorkspaceRevision = args.get('workspace-revision') ? String(args.get('workspace-revision')) : null;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const qualifiedRevisionSql = "source_revision IS NOT NULL AND btrim(source_revision::text) <> '' AND source_revision::text !~* '^workspace:[0-9]+$'";

const report = {
  schema: 'atlas.postgres-pgvector-exact-hnsw-replay.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  relation: 'public.codebase_chunk_index',
  representation: {
    id: 'semantic_768',
    column: 'content_embedding_768',
    distance: 'cosine',
  },
  bounds: { cohortLimit: limit, topK },
  requestedWorkspaceRevision,
  status: 'NOT_RUN',
  blockers: [],
  writesPerformed: false,
  canonicalAuthority: false,
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 30_000,
  application_name: 'atlas-postgres-pgvector-exact-hnsw-replay-v1',
});

function stable(value) {
  return JSON.stringify(value, Object.keys(value ?? {}).sort());
}

function planNodeNames(plan) {
  const names = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node['Node Type']) names.push(String(node['Node Type']));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(plan);
  return [...new Set(names)].sort();
}

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const relation = (await client.query("SELECT to_regclass('public.codebase_chunk_index')::text AS relation")).rows[0]?.relation;
    if (!relation) {
      report.status = 'PGVECTOR_REPLAY_RELATION_UNAVAILABLE';
      report.blockers.push('CODEBASE_CHUNK_INDEX_UNAVAILABLE');
    } else {
      const columns = (await client.query(`
        SELECT column_name, data_type, udt_name
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
         ORDER BY ordinal_position
      `)).rows;
      const names = new Set(columns.map((row) => row.column_name));
      if (!names.has('content_embedding_768')) report.blockers.push('SEMANTIC_768_COLUMN_UNAVAILABLE');
      if (!names.has('source_revision')) report.blockers.push('SOURCE_REVISION_COLUMN_UNAVAILABLE');
      if (!names.has('id')) report.blockers.push('STABLE_ROW_ID_UNAVAILABLE');

      const indexes = (await client.query(`
        SELECT indexname, indexdef
          FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'codebase_chunk_index'
         ORDER BY indexname
      `)).rows;
      const hnswIndexes = indexes.filter((row) => /USING\s+hnsw/i.test(row.indexdef) && /content_embedding_768/i.test(row.indexdef));
      report.schema = { columns, hnswIndexes };
      if (hnswIndexes.length === 0) report.blockers.push('SEMANTIC_768_HNSW_INDEX_EVIDENCE_UNAVAILABLE');

      const workspacePredicate = requestedWorkspaceRevision
        ? ` AND workspace_revision = $1`
        : '';
      const params = requestedWorkspaceRevision ? [requestedWorkspaceRevision] : [];
      const qualifiedWhere = `${qualifiedRevisionSql}${workspacePredicate}`;
      const count = (await client.query(`
        SELECT count(*)::int AS count
          FROM public.codebase_chunk_index
         WHERE ${qualifiedWhere}
           AND content_embedding_768 IS NOT NULL
      `, params)).rows[0]?.count ?? 0;
      report.cohort = { revisionQualifiedVectorRows: Number(count) };
      if (Number(count) === 0) {
        report.blockers.push('CANONICAL_SOURCE_REVISION_MISSING_FOR_PGVECTOR_COHORT');
        report.status = 'PGVECTOR_REPLAY_BLOCKED_SOURCE_REVISION';
      }

      if (report.blockers.length === 0) {
        const cohort = (await client.query(`
          SELECT id::text AS id, source_revision::text AS source_revision,
                 workspace_revision::text AS workspace_revision,
                 content_embedding_768::text AS vector_text
            FROM public.codebase_chunk_index
           WHERE ${qualifiedWhere}
             AND content_embedding_768 IS NOT NULL
           ORDER BY id
           LIMIT ${limit}
        `, params)).rows;
        const queryRows = [];
        const comparisons = [];
        for (const query of cohort) {
          const exactPlan = (await client.query(`EXPLAIN (FORMAT JSON) SELECT id FROM public.codebase_chunk_index WHERE ${qualifiedWhere} AND content_embedding_768 IS NOT NULL AND id <> $${params.length + 1} ORDER BY content_embedding_768 <=> $${params.length + 2}::vector LIMIT ${topK}`, [...params, query.id, query.vector_text])).rows[0]['QUERY PLAN'];
          const exact = (await client.query(`
            SELECT id::text AS id, (content_embedding_768 <=> $${params.length + 2}::vector)::float8 AS distance
              FROM public.codebase_chunk_index
             WHERE ${qualifiedWhere}
               AND content_embedding_768 IS NOT NULL
               AND id <> $${params.length + 1}
             ORDER BY content_embedding_768 <=> $${params.length + 2}::vector, id
             LIMIT ${topK}
          `, [...params, query.id, query.vector_text])).rows;

          await client.query('SET LOCAL hnsw.ef_search = 100');
          await client.query('SET LOCAL enable_seqscan = off');
          const hnswPlan = (await client.query(`EXPLAIN (FORMAT JSON) SELECT id FROM public.codebase_chunk_index WHERE ${qualifiedWhere} AND content_embedding_768 IS NOT NULL AND id <> $${params.length + 1} ORDER BY content_embedding_768 <=> $${params.length + 2}::vector LIMIT ${topK}`, [...params, query.id, query.vector_text])).rows[0]['QUERY PLAN'];
          const hnsw = (await client.query(`
            SELECT id::text AS id, (content_embedding_768 <=> $${params.length + 2}::vector)::float8 AS distance
              FROM public.codebase_chunk_index
             WHERE ${qualifiedWhere}
               AND content_embedding_768 IS NOT NULL
               AND id <> $${params.length + 1}
             ORDER BY content_embedding_768 <=> $${params.length + 2}::vector, id
             LIMIT ${topK}
          `, [...params, query.id, query.vector_text])).rows;

          const exactIds = exact.map((row) => row.id);
          const hnswIds = hnsw.map((row) => row.id);
          const overlap = exactIds.filter((id) => hnswIds.includes(id)).length / Math.max(1, exactIds.length);
          queryRows.push({ id: query.id, sourceRevision: query.source_revision, workspaceRevision: query.workspace_revision });
          comparisons.push({
            queryId: query.id,
            exactIds,
            hnswIds,
            recallAtK: Number(overlap.toFixed(6)),
            exactDistances: exact.map((row) => Number(row.distance)),
            hnswDistances: hnsw.map((row) => Number(row.distance)),
            exactPlanNodes: planNodeNames(exactPlan),
            hnswPlanNodes: planNodeNames(hnswPlan),
          });
        }
        const recalls = comparisons.map((row) => row.recallAtK);
        const hnswPlanNodes = [...new Set(comparisons.flatMap((row) => row.hnswPlanNodes))].sort();
        const hnswPlanUsesIndex = hnswPlanNodes.some((name) => /Index Scan|Bitmap Index Scan/i.test(name));
        report.replay = {
          queryRows,
          comparisons,
          queryCount: comparisons.length,
          meanRecallAtK: recalls.length ? Number((recalls.reduce((a, b) => a + b, 0) / recalls.length).toFixed(6)) : null,
          minimumRecallAtK: recalls.length ? Math.min(...recalls) : null,
          hnswPlanUsesIndex,
          hnswPlanNodes,
          sameFilteredCohort: true,
          stableEvidenceMetadata: queryRows.every((row) => row.sourceRevision && row.workspaceRevision),
        };
        report.status = report.replay.hnswPlanUsesIndex && report.replay.meanRecallAtK === 1 && report.replay.stableEvidenceMetadata
          ? 'PGVECTOR_EXACT_HNSW_REPLAY_PROVEN'
          : 'PGVECTOR_EXACT_HNSW_PARITY_UNPROVEN';
        if (!hnswPlanUsesIndex) report.blockers.push('HNSW_QUERY_PLAN_NOT_PROVEN');
        if (report.replay.meanRecallAtK !== 1) report.blockers.push('PGVECTOR_HNSW_RECALL_BELOW_EXACT');
      }
      report.queryChecksum = digest(JSON.stringify({ requestedWorkspaceRevision, limit, topK }));
      report.evidenceChecksum = digest(stable({ schema: report.schema, cohort: report.cohort, replay: report.replay ?? null, blockers: report.blockers, status: report.status }));
    }
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (error) {
  report.status = 'PGVECTOR_REPLAY_READ_ERROR';
  report.blockers.push('POSTGRES_READ_ERROR');
  report.error = String(error?.message || error);
} finally {
  await pool.end();
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
