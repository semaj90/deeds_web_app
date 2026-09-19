#!/usr/bin/env node

/**
 * Read-only bounded semantic_768 exact-vs-HNSW replay.
 * It inspects the existing index and planner only; it never creates or alters
 * an index and never promotes the approximate result.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const outPath = path.join(REPO_ROOT, 'docs/reports/pgvector-semantic-768-exact-hnsw-replay-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

const report = {
  schema: 'atlas.pgvector-semantic-768-exact-hnsw-replay.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  representation: 'semantic_768',
  column: 'public.codebase_chunk_index.content_embedding',
  index: null,
  filter: null,
  exact: null,
  hnsw: null,
  recallAtK: null,
  status: 'UNAVAILABLE',
};

const checksum = (rows) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}`;

try {
  await pool.query('BEGIN READ ONLY');
  const index = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'codebase_chunk_index'
      AND indexdef ILIKE '%USING hnsw%'
      AND indexdef ILIKE '%content_embedding%'
    ORDER BY indexname
    LIMIT 1
  `);
  report.index = index.rows[0] ?? null;

  if (!report.index) {
    report.status = 'BLOCKED_HNSW_INDEX_MISSING';
    await pool.query('ROLLBACK');
  } else {
    const seed = await pool.query(`
      SELECT id::text AS id, content_embedding::text AS vector, source_revision, workspace_revision
      FROM public.codebase_chunk_index
      WHERE content_embedding IS NOT NULL
        AND source_revision IS NOT NULL
      ORDER BY id
      LIMIT 1
    `);
    if (!seed.rows[0]?.vector) {
      report.status = 'BLOCKED_NO_SOURCE_REVISION';
      report.filter = {
        sourceRevision: null,
        workspaceRevision: null,
        applied: false,
        reason: 'Exact/HNSW parity requires a revision-qualified semantic_768 cohort; no source_revision-bound vector is currently available.',
      };
      await pool.query('ROLLBACK');
    } else {
      const seedRow = seed.rows[0];
      report.filter = {
        sourceRevision: seedRow.source_revision ?? null,
        workspaceRevision: seedRow.workspace_revision ?? null,
        applied: true,
        reason: 'Both exact and HNSW queries are restricted to the same source_revision-qualified cohort.',
      };

      const exact = await pool.query(`
        SELECT id::text AS id, (content_embedding <=> $1::halfvec)::float8 AS distance
        FROM public.codebase_chunk_index
        WHERE content_embedding IS NOT NULL
          AND source_revision = $2
        ORDER BY content_embedding <=> $1::halfvec, id
        LIMIT 20
      `, [seedRow.vector, seedRow.source_revision]);
      report.exact = {
        rows: exact.rows.map((row) => ({ id: row.id, distance: Number(row.distance) })),
      };
      report.exact.checksum = checksum(report.exact.rows);

      await pool.query('SET LOCAL enable_seqscan = off');
      await pool.query("SET LOCAL hnsw.ef_search = 40");
      const hnsw = await pool.query(`
        SELECT id::text AS id, (content_embedding <=> $1::halfvec)::float8 AS distance
        FROM public.codebase_chunk_index
        WHERE content_embedding IS NOT NULL
          AND source_revision = $2
        ORDER BY content_embedding <=> $1::halfvec, id
        LIMIT 20
      `, [seedRow.vector, seedRow.source_revision]);
      report.hnsw = {
        rows: hnsw.rows.map((row) => ({ id: row.id, distance: Number(row.distance) })),
      };
      report.hnsw.checksum = checksum(report.hnsw.rows);

      const exactIds = new Set(report.exact.rows.map((row) => row.id));
      const overlap = report.hnsw.rows.filter((row) => exactIds.has(row.id)).length;
      report.recallAtK = report.exact.rows.length ? overlap / report.exact.rows.length : null;
      report.status = 'REPLAY_PROVEN';
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
  index: report.index?.indexname ?? null,
  recallAtK: report.recallAtK,
  reportPath: outPath,
}, null, 2));

if (report.status === 'ERROR') process.exitCode = 1;
