#!/usr/bin/env node

/**
 * Read-only PostgreSQL lexical replay for the retrieval compatibility lane.
 * It never creates indexes or mutates rows. Unqualified source revisions are
 * reported explicitly and cannot be admitted as FTS evidence.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const reportPath = outputArg
  ? path.resolve(root, outputArg)
  : path.join(root, 'docs/reports/postgres-fts-replay-v1.json');
if (outputArg) {
  const reportsRoot = `${path.resolve(root, 'docs/reports')}${path.sep}`;
  if (!reportPath.startsWith(reportsRoot)) throw new Error('OUTPUT_MUST_STAY_UNDER_DOCS_REPORTS');
}
const queryText = process.argv.find((arg) => arg.startsWith('--query='))?.slice('--query='.length) ?? 'Graphify retrieval';
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const text = (value) => (value === null || value === undefined ? null : String(value));
const qualifiedRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(String(value ?? '').trim())
  || (typeof value === 'string' && value.trim().length > 0 && !/^workspace:\d+$/i.test(value.trim()));
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30_000, application_name: 'atlas-postgres-fts-replay-v1' });
const report = {
  schema: 'atlas.postgres-fts-replay.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  queryText,
  writesPerformed: false,
  canonicalAuthority: false,
  status: 'UNPROVEN',
};

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const table = (await client.query(`
      SELECT to_regclass('public.codebase_chunk_index')::text AS relation
    `)).rows[0]?.relation ?? null;
    if (!table) {
      report.status = 'POSTGRES_FTS_RELATION_UNAVAILABLE';
      report.blockers = ['CODEBASE_CHUNK_INDEX_UNAVAILABLE'];
      await client.query('ROLLBACK');
    } else {
      const columns = (await client.query(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
      `)).rows.map((row) => row.column_name);
      const has = (column) => columns.includes(column);
      const textColumns = ['content', 'summary', 'relative_path', 'symbol', 'feature_label'].filter(has);
      const hasSearchVector = has('search_vector');
      const identityColumns = ['id', 'source_ref', 'workspace_revision', 'source_revision', 'content_hash', 'packet_key'].filter(has);
      const indexes = (await client.query(`
        SELECT indexname, indexdef
          FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'codebase_chunk_index'
         ORDER BY indexname
      `)).rows;
      const ginIndexes = indexes.filter((row) => /USING\s+gin/i.test(row.indexdef));
      const baseSelect = identityColumns.length
        ? identityColumns.map((column) => `${column}::text AS ${column}`).join(', ')
        : '1 AS row_marker';
      const orderColumn = has('id') ? 'id' : has('source_ref') ? 'source_ref' : '1';
      // Match the live lexical owner: query the materialized tsvector/GIN lane,
      // not a dynamically rebuilt text expression that bypasses its index.
      const unqualified = hasSearchVector
        ? (await client.query(`
            SELECT count(*)::int AS count
              FROM public.codebase_chunk_index
             WHERE search_vector @@ websearch_to_tsquery('english', $1)
          `, [queryText])).rows[0]?.count ?? 0
        : 0;
      const qualifiedFilters = [
        has('source_revision')
          ? `ci.source_revision IS NOT NULL AND btrim(ci.source_revision::text) <> '' AND ci.source_revision::text !~* '^workspace:[0-9]+$'`
          : 'FALSE',
        has('source_ref') ? `ci.source_ref IS NOT NULL AND btrim(ci.source_ref::text) <> ''` : 'FALSE',
        has('content_hash') ? "ci.content_hash IS NOT NULL AND btrim(ci.content_hash::text) <> ''" : 'TRUE',
      ].join(' AND ');
      const rows = hasSearchVector
        ? (await client.query(`
            SELECT ${baseSelect.split(', ').map((column) => `ci.${column}`).join(', ')},
                   ts_rank_cd(ci.search_vector, q.tsq, 32)::float8 AS rank
              FROM public.codebase_chunk_index AS ci
              CROSS JOIN (SELECT websearch_to_tsquery('english', $1) AS tsq) AS q
             WHERE ci.search_vector @@ q.tsq
               AND ${qualifiedFilters}
             ORDER BY rank DESC, ci.${orderColumn}
             LIMIT 25
          `, [queryText])).rows
        : [];
      const stableRows = rows.map((row) => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
      report.database = { relation: table, columns, textColumns, identityColumns, ginIndexes, indexCount: indexes.length };
      report.replay = {
        unqualifiedHitCount: Number(unqualified),
        revisionQualifiedHitCount: rows.length,
        revisionQualifiedRows: stableRows,
        stableEvidenceMetadata: rows.every((row) => (!has('source_ref') || text(row.source_ref)) && (!has('source_revision') || qualifiedRevision(row.source_revision))),
      };
      report.blockers = [];
      if (!hasSearchVector) report.blockers.push('SEARCH_VECTOR_UNAVAILABLE');
      if (!has('source_revision')) report.blockers.push('SOURCE_REVISION_COLUMN_UNAVAILABLE');
      else if (Number(unqualified) > 0 && rows.length === 0) report.blockers.push('CANONICAL_SOURCE_REVISION_MISSING_FOR_FTS_HITS');
      if (ginIndexes.length === 0) report.blockers.push('GIN_INDEX_EVIDENCE_UNAVAILABLE');
      report.status = report.blockers.length === 0 && rows.length > 0
        ? 'POSTGRES_FTS_REPLAY_PROVEN'
        : report.blockers.includes('CANONICAL_SOURCE_REVISION_MISSING_FOR_FTS_HITS')
          ? 'POSTGRES_FTS_BLOCKED_SOURCE_REVISION'
          : 'POSTGRES_FTS_REPLAY_UNPROVEN';
      report.replay.queryChecksum = digest(queryText);
      report.replay.evidenceChecksum = digest(JSON.stringify({ queryText, rows: stableRows, ginIndexes }));
      await client.query('ROLLBACK');
    }
  } finally {
    client.release();
  }
} catch (error) {
  report.status = 'POSTGRES_FTS_REPLAY_ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const stable = { ...report, generatedAt: undefined, receiptChecksum: undefined };
report.receiptChecksum = digest(JSON.stringify(stable));
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(report, null, 2)}\n`,
  outputArg ? { encoding: 'utf8', flag: 'wx' } : 'utf8',
);
console.log(JSON.stringify({ status: report.status, blockers: report.blockers ?? [], replay: report.replay ?? null, writesPerformed: false, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
