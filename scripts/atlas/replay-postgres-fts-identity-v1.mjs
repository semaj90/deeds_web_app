#!/usr/bin/env node

/**
 * Read-only replay of the PostgreSQL lexical lane over one source revision.
 * This proves the tsvector/GIN query and identity metadata are replay-stable;
 * it does not promote rows or alter the database.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const outPath = path.join(REPO_ROOT, 'docs/reports/postgres-fts-identity-replay-v1.json');
const queryText = 'packet identity';
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

const report = {
  schema: 'atlas.postgres-fts-identity-replay.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  query: queryText,
  queryConfiguration: 'english',
  sourceRevision: null,
  indexContract: null,
  firstReplay: null,
  secondReplay: null,
  replayStable: false,
  status: 'UNAVAILABLE',
};

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

try {
  await pool.query('BEGIN READ ONLY');

  const columns = await pool.query(`
    SELECT column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'codebase_chunk_index'
      AND column_name IN ('search_vector', 'source_revision', 'workspace_revision', 'content_hash')
    ORDER BY column_name
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  report.indexContract = {
    searchVector: names.has('search_vector'),
    sourceRevision: names.has('source_revision'),
    workspaceRevision: names.has('workspace_revision'),
    contentHash: names.has('content_hash'),
    ginIndexes: (await pool.query(`
      SELECT count(*)::int AS count
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'codebase_chunk_index'
        AND indexdef ILIKE '%USING gin%'
        AND indexdef ILIKE '%search_vector%'
    `)).rows[0].count,
  };

  if (!report.indexContract.searchVector || !report.indexContract.sourceRevision) {
    report.status = 'BLOCKED_SCHEMA';
    await pool.query('ROLLBACK');
  } else {
    const revision = await pool.query(`
      SELECT source_revision
      FROM public.codebase_chunk_index
      WHERE source_revision IS NOT NULL
        AND search_vector IS NOT NULL
      GROUP BY source_revision
      ORDER BY source_revision
      LIMIT 1
    `);
    report.sourceRevision = revision.rows[0]?.source_revision ?? null;

    if (!report.sourceRevision) {
      report.status = 'BLOCKED_NO_SOURCE_REVISION';
      await pool.query('ROLLBACK');
    } else {
      const replay = async () => {
        const result = await pool.query(`
          WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
          SELECT id::text AS id,
                 COALESCE(source_ref, relative_path, '') AS source_ref,
                 source_revision,
                 COALESCE(workspace_revision::text, '') AS workspace_revision,
                 COALESCE(content_hash, '') AS content_hash,
                 ts_rank_cd(search_vector, q.tsq, 32)::float4 AS score
          FROM public.codebase_chunk_index
          CROSS JOIN q
          WHERE search_vector @@ q.tsq
            AND source_revision = $2
          ORDER BY score DESC, id
          LIMIT 25
        `, [queryText, report.sourceRevision]);
        const rows = result.rows.map((row) => ({
          id: row.id,
          sourceRef: row.source_ref,
          sourceRevision: row.source_revision,
          workspaceRevision: row.workspace_revision,
          contentHash: row.content_hash,
          score: Number(row.score),
        }));
        return { rows, rowCount: rows.length, checksum: checksum(rows) };
      };

      report.firstReplay = await replay();
      report.secondReplay = await replay();
      report.replayStable = report.firstReplay.checksum === report.secondReplay.checksum;
      report.status = report.replayStable ? 'REPLAY_PROVEN' : 'REPLAY_DRIFTED';
      await pool.query('ROLLBACK');
    }
  }
} catch (error) {
  try { await pool.query('ROLLBACK'); } catch {}
  report.status = 'ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status: report.status,
  sourceRevision: report.sourceRevision,
  replayStable: report.replayStable,
  rowCount: report.firstReplay?.rowCount ?? 0,
  reportPath: outPath,
}, null, 2));

if (report.status === 'ERROR' || report.status === 'REPLAY_DRIFTED') process.exitCode = 1;
