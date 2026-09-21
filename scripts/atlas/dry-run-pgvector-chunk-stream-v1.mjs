#!/usr/bin/env node

/**
 * Read-only pgvector-first chunk stream dry-run.
 *
 * This proves bounded keyset pagination and eligibility accounting only. It
 * does not generate embeddings, write Postgres, publish to Qdrant, warm
 * Valkey, or create CandidateOrdinal values.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = path.resolve(process.env.ATLAS_PGVECTOR_STREAM_REPORT ?? path.join(ROOT, 'docs/reports/pgvector-chunk-stream-dry-run-v1.json'));
const pageSize = boundedInteger(process.env.ATLAS_PGVECTOR_STREAM_PAGE_SIZE, 100, 1, 500);
const maxPages = boundedInteger(process.env.ATLAS_PGVECTOR_STREAM_MAX_PAGES, 3, 1, 20);
const requestedWorkspaceRevision = process.env.ATLAS_PGVECTOR_WORKSPACE_REVISION?.trim() || null;

function boundedInteger(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`INVALID_INTEGER:${value}:${min}:${max}`);
  }
  return parsed;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableRow(row) {
  return JSON.stringify([
    String(row.id),
    row.source_ref,
    row.content_hash,
    row.source_revision,
    row.workspace_revision,
    row.representation_revision,
    Boolean(row.has_embedding),
  ]);
}

function isQualifiedRevision(value) {
  return typeof value === 'string' && value.length > 0 && value !== '0' && value !== 'workspace:0';
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 1,
    application_name: 'atlas-pgvector-chunk-stream-dry-run',
  });
  const startedAt = new Date().toISOString();
  const pages = [];
  let cursor = null;
  let rowsSeen = 0;
  let eligibleRows = 0;
  let rowsWithEmbedding = 0;
  let pagesCompleted = 0;

  try {
    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
    `);
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));
    const required = ['id', 'source_ref', 'content_hash', 'source_revision', 'workspace_revision', 'representation_revision', 'content_embedding'];
    const missing = required.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`PGVECTOR_STREAM_REQUIRED_COLUMNS_MISSING:${missing.join(',')}`);

    const workspacePredicate = requestedWorkspaceRevision ? 'AND workspace_revision = $1' : '';
    const countParams = requestedWorkspaceRevision ? [requestedWorkspaceRevision] : [];
    const countResult = await pool.query(`
      SELECT
        COUNT(*)::bigint AS raw_rows,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref <> '')::bigint AS source_ref_rows,
        COUNT(*) FILTER (WHERE content_hash IS NOT NULL AND content_hash <> '')::bigint AS content_hash_rows,
        COUNT(*) FILTER (WHERE source_revision IS NOT NULL AND source_revision <> '' AND source_revision NOT IN ('0', 'workspace:0'))::bigint AS qualified_source_revision_rows,
        COUNT(*) FILTER (WHERE workspace_revision IS NOT NULL AND workspace_revision <> '' AND workspace_revision NOT IN ('0', 'workspace:0'))::bigint AS qualified_workspace_revision_rows,
        COUNT(*) FILTER (WHERE representation_revision IS NOT NULL AND representation_revision <> '')::bigint AS representation_revision_rows,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref <> '' AND content_hash IS NOT NULL AND content_hash <> '' AND source_revision IS NOT NULL AND source_revision <> '' AND source_revision NOT IN ('0', 'workspace:0') AND workspace_revision IS NOT NULL AND workspace_revision <> '' AND workspace_revision NOT IN ('0', 'workspace:0') AND representation_revision IS NOT NULL AND representation_revision <> '')::bigint AS qualified_rows,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref <> '' AND content_hash IS NOT NULL AND content_hash <> '' AND source_revision IS NOT NULL AND source_revision <> '' AND source_revision NOT IN ('0', 'workspace:0') AND workspace_revision IS NOT NULL AND workspace_revision <> '' AND workspace_revision NOT IN ('0', 'workspace:0') AND representation_revision IS NOT NULL AND representation_revision <> '' AND content_embedding IS NOT NULL)::bigint AS embedded_rows
      FROM public.codebase_chunk_index
      WHERE TRUE ${workspacePredicate}
    `, countParams);

    for (;;) {
      if (pagesCompleted >= maxPages) break;
      const cursorPredicate = cursor ? 'AND id > $2::uuid' : '';
      const params = requestedWorkspaceRevision
        ? (cursor ? [requestedWorkspaceRevision, cursor, pageSize] : [requestedWorkspaceRevision, pageSize])
        : (cursor ? [cursor, pageSize] : [pageSize]);
      const limitParam = requestedWorkspaceRevision
        ? (cursor ? '$3' : '$2')
        : (cursor ? '$2' : '$1');
      const cursorParam = requestedWorkspaceRevision ? '$2' : '$1';
      const result = await pool.query(`
        SELECT id::text AS id, source_ref, content_hash, source_revision,
               workspace_revision, representation_revision,
               (content_embedding IS NOT NULL) AS has_embedding
        FROM public.codebase_chunk_index
        WHERE source_ref IS NOT NULL AND source_ref <> ''
          AND content_hash IS NOT NULL AND content_hash <> ''
          AND source_revision IS NOT NULL AND source_revision <> ''
          AND source_revision NOT IN ('0', 'workspace:0')
          AND workspace_revision IS NOT NULL AND workspace_revision <> ''
          AND workspace_revision NOT IN ('0', 'workspace:0')
          AND representation_revision IS NOT NULL AND representation_revision <> ''
          ${workspacePredicate}
          ${cursor ? `AND id > ${cursorParam}::uuid` : ''}
        ORDER BY id ASC
        LIMIT ${limitParam}
      `, params);
      if (result.rows.length === 0) break;

      const rowChecksum = sha256(result.rows.map(stableRow).join('\n'));
      const first = result.rows[0];
      const last = result.rows[result.rows.length - 1];
      if (cursor && String(first.id) <= cursor) throw new Error('PGVECTOR_STREAM_CURSOR_NOT_INCREASING');
      cursor = String(last.id);
      rowsSeen += result.rows.length;
      eligibleRows += result.rows.length;
      rowsWithEmbedding += result.rows.filter((row) => row.has_embedding).length;
      pagesCompleted += 1;
      pages.push({
        page: pagesCompleted,
        rowCount: result.rows.length,
        firstCursor: String(first.id),
        lastCursor: cursor,
        rowChecksum,
        allRowsRevisionQualified: result.rows.every((row) => isQualifiedRevision(row.source_revision) && isQualifiedRevision(row.workspace_revision)),
        vectorsReadAsJson: false,
      });
    }

    const count = countResult.rows[0];
    const report = {
      schema: 'atlas.pgvector-chunk-stream-dry-run.v1',
      generatedAt: new Date().toISOString(),
      startedAt,
      readOnly: true,
      canonicalAuthority: false,
      promotionAuthorized: false,
      writesPerformed: false,
      postgresWrites: false,
      qdrantWrites: false,
      valkeyWrites: false,
      graphWrites: false,
      stream: {
        source: 'public.codebase_chunk_index',
        semanticRepresentation: 'semantic_768',
        vectorColumn: 'content_embedding',
        vectorTransport: 'not-read/not-JSON',
        pagination: 'id > cursor ORDER BY id ASC LIMIT pageSize',
        pageSize,
        maxPages,
        resumableCursor: cursor,
        requestedWorkspaceRevision,
        backpressure: 'bounded-pages; no downstream writer attached',
      },
      eligibility: {
        predicate: 'source_ref + content_hash + source_revision + workspace_revision + representation_revision; revisions exclude 0/workspace:0',
        rawRowsLive: Number(count.raw_rows),
        sourceRefRows: Number(count.source_ref_rows),
        contentHashRows: Number(count.content_hash_rows),
        qualifiedSourceRevisionRows: Number(count.qualified_source_revision_rows),
        qualifiedWorkspaceRevisionRows: Number(count.qualified_workspace_revision_rows),
        representationRevisionRows: Number(count.representation_revision_rows),
        qualifiedRowsLive: Number(count.qualified_rows),
        qualifiedRowsSampled: eligibleRows,
        sampledRowsWithEmbedding: rowsWithEmbedding,
        liveQualifiedRowsWithEmbedding: Number(count.embedded_rows),
        currentSourceAuthorityProven: false,
      },
      checkpoint: {
        schemaVersion: 'atlas.pgvector.chunk-stream-checkpoint.v1',
        cursorField: 'id',
        lastDurableCursor: cursor,
        pagesCompleted,
        rowsCompleted: rowsSeen,
        persistedTo: 'report-only; no checkpoint store write',
      },
      pages,
      nextGate: 'CURRENT_SOURCE_AUTHORITY_PROVEN',
    };
    await fs.mkdir(path.dirname(REPORT), { recursive: true });
    await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const status = pagesCompleted > 0 ? 'PGVECTOR_STREAM_DRY_RUN_PROVEN' : 'PGVECTOR_STREAM_BLOCKED_NO_ELIGIBLE_ROWS';
    report.status = status;
    await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ schema: report.schema, status, pagesCompleted, rowsSeen, qualifiedRowsLive: Number(count.qualified_rows), report: path.relative(ROOT, REPORT), writesPerformed: false }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
