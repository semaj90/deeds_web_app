#!/usr/bin/env node

/**
 * Bounded source-lineage mirror backfill for codebase_chunk_index.
 *
 * Only exact whole-file matches are eligible:
 *   codebase_chunk_index.source_ref + file_content_hash
 *     == atlas_workspace_source_bindings.canonical_source_ref + content_digest
 *
 * Representation revision is deliberately untouched until its canonical
 * producer is proven. Default mode is read-only; apply requires an explicit
 * canary limit and confirmation token.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const workspaceRevision = process.argv.find((arg) => arg.startsWith('--workspace-revision='))?.split('=').slice(1).join('=')
  ?? 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : null;
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm-codebase-chunk-lineage-backfill-v1');
if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) throw new Error('INVALID_BACKFILL_LIMIT');
if (apply && limit === null) throw new Error('BACKFILL_REQUIRES_EXPLICIT_LIMIT');
if (apply && !confirmed) throw new Error('BACKFILL_CONFIRMATION_REQUIRED');

const reportPath = path.join(root, 'docs/reports/codebase-chunk-lineage-backfill-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120_000,
  application_name: 'atlas-codebase-chunk-lineage-backfill-v1',
});

const candidateQuery = `
  WITH candidates AS (
    SELECT c.id, b.workspace_revision, b.source_revision,
           b.binding_checksum, b.producer_revision
    FROM public.codebase_chunk_index c
    JOIN public.atlas_workspace_source_bindings b
      ON b.repo_id = 'deeds-web-app'
     AND b.workspace_revision = $1
     AND lower(b.canonical_source_ref) = lower(c.source_ref)
     AND lower(b.content_digest) = lower(c.file_content_hash)
    WHERE c.file_content_hash IS NOT NULL
      AND (c.workspace_revision IS NULL
        OR c.source_revision IS NULL
        OR c.lineage_binding_checksum IS NULL
        OR c.lineage_producer_revision IS NULL)
    ORDER BY c.id
    ${limit === null ? '' : 'LIMIT $2'}
  )
  SELECT * FROM candidates
`;

const report = {
  schema: 'atlas.codebase-chunk-lineage-backfill.v1',
  mode: apply ? 'CANARY_APPLY' : 'READ_ONLY_PLAN',
  workspaceRevision,
  representationRevision: null,
  representationRevisionPolicy: 'REMAIN_NULL_UNTIL_CANONICAL_PRODUCER_PROVEN',
  limit,
  writesPerformed: false,
  rollbackOccurred: false,
};

try {
  const params = limit === null ? [workspaceRevision] : [workspaceRevision, limit];
  const candidates = await pool.query(candidateQuery, params);
  report.candidateCount = candidates.rowCount;
  report.candidateSample = candidates.rows.slice(0, 20).map((row) => ({
    id: row.id,
    workspaceRevision: row.workspace_revision,
    sourceRevision: row.source_revision,
    bindingChecksum: row.binding_checksum,
    producerRevision: row.producer_revision,
  }));
  report.status = candidates.rowCount > 0 ? 'CANARY_PLAN_READY' : 'NO_EXACT_SOURCE_LINEAGE_CANDIDATES';

  if (apply && candidates.rowCount > 0) {
    const ids = candidates.rows.map((row) => row.id);
    await pool.query('BEGIN');
    try {
      const updated = await pool.query(`
        WITH selected AS (
          SELECT c.id, b.workspace_revision, b.source_revision,
                 b.binding_checksum, b.producer_revision
          FROM public.codebase_chunk_index c
          JOIN public.atlas_workspace_source_bindings b
            ON b.repo_id = 'deeds-web-app'
           AND b.workspace_revision = $1
           AND lower(b.canonical_source_ref) = lower(c.source_ref)
           AND lower(b.content_digest) = lower(c.file_content_hash)
          WHERE c.id = ANY($2::uuid[])
        )
        UPDATE public.codebase_chunk_index c
           SET workspace_revision = s.workspace_revision,
               source_revision = s.source_revision,
               lineage_binding_checksum = s.binding_checksum,
               lineage_producer_revision = s.producer_revision,
               updated_at = now()
          FROM selected s
         WHERE c.id = s.id
        RETURNING c.id, c.workspace_revision, c.source_revision,
                  c.lineage_binding_checksum, c.lineage_producer_revision
      `, [workspaceRevision, ids]);
      if (updated.rowCount !== candidates.rowCount) throw new Error('LINEAGE_BACKFILL_READBACK_COUNT_MISMATCH');
      await pool.query('ROLLBACK');
      report.readbackCount = updated.rowCount;
      report.rollbackOccurred = true;
      report.status = 'CANARY_ROLLBACK_READBACK_PROVEN';
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => undefined);
      report.rollbackOccurred = true;
      throw error;
    }
  }
} catch (error) {
  report.status = 'BACKFILL_FAILED';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({
  status: report.status,
  candidateCount: report.candidateCount ?? 0,
  representationRevision: null,
  writesPerformed: report.writesPerformed,
  rollbackOccurred: report.rollbackOccurred,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
}, null, 2));
