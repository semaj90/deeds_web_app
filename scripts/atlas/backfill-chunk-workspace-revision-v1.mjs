#!/usr/bin/env node
/**
 * Read-only audit of the historical workspace revision backfill.
 * Its apply receipt records aggregate counts without row identities or preimages.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const TARGET_WORKSPACE_REVISION = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const APPLY_RECEIPT_PATH = 'docs/reports/workspace-revision-backfill-receipt-v1.json';
const BATCH_SIZE = 5000;

function receiptChecksum(payload) {
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(payload, null, 2)).digest('hex');
}

function readHistoricalReceipt() {
  const { checksum, ...receipt } = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, APPLY_RECEIPT_PATH), 'utf8'));
  if (checksum !== receiptChecksum(receipt) || receipt.schema !== 'atlas.workspace-revision-backfill.v1'
    || receipt.status !== 'APPLY_COMPLETED' || receipt.writesPerformed !== true
    || receipt.targetWorkspaceRevision !== TARGET_WORKSPACE_REVISION) {
    throw new Error('HISTORICAL_APPLY_RECEIPT_VERIFICATION_FAILED');
  }
  return { path: APPLY_RECEIPT_PATH, checksum, generatedAt: receipt.generatedAt, statistics: receipt.statistics };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => ['--apply', '--confirm-apply', '--rollback'].includes(arg.split('=')[0]))) {
    throw new Error('WORKSPACE_REVISION_BACKFILL_APPLY_SUSPENDED: use --recovery-audit');
  }
  const recoveryAudit = args.includes('--recovery-audit');
  const reportArg = args.find((arg) => arg.startsWith('--report='));
  const reportPath = path.resolve(REPO_ROOT, reportArg?.slice('--report='.length)
    ?? (recoveryAudit ? '.tmp/review/workspace-revision-backfill-recovery-v1.json' : '.tmp/atlas/workspace-revision-backfill-dryrun-latest.json'));
  if (!reportPath.startsWith(path.join(REPO_ROOT, '.tmp') + path.sep)) {
    throw new Error('EXPLICIT_REPORT_PATH_MUST_BE_UNDER_REPOSITORY_TMP');
  }
  const historical = recoveryAudit ? readHistoricalReceipt() : null;
  const client = new pg.Client({ connectionString: resolveDatabaseUrl(loadRepoEnv()) });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '90s'");
    const { rows: [total] } = await client.query(`
      SELECT count(*)::int AS total_chunks,
             count(*) FILTER (WHERE workspace_revision IS NULL)::int AS null_ws,
             count(*) FILTER (WHERE source_revision IS NULL)::int AS null_src,
             count(*) FILTER (WHERE lineage_binding_checksum IS NULL)::int AS null_lineage
      FROM public.codebase_chunk_index
    `);
    const { rows: [observation] } = await client.query(`
      WITH path_bindings AS (
        SELECT DISTINCT canonical_source_ref
        FROM public.atlas_workspace_source_bindings
        WHERE workspace_revision = $1
      )
      SELECT count(*) FILTER (WHERE b.canonical_source_ref IS NOT NULL AND c.workspace_revision IS NULL)::int AS eligible,
             count(*) FILTER (WHERE b.canonical_source_ref IS NULL AND c.workspace_revision IS NULL)::int AS unmatched,
             count(*) FILTER (WHERE c.workspace_revision = $1)::int AS "currentWorkspaceRows",
             count(c.lineage_producer_revision) FILTER (WHERE c.workspace_revision = $1)::int AS "producerBoundRows",
             count(c.lineage_binding_checksum) FILTER (WHERE c.workspace_revision = $1)::int AS "checksumBoundRows",
             count(c.representation_revision) FILTER (WHERE c.workspace_revision = $1)::int AS "representationBoundRows"
      FROM public.codebase_chunk_index c
      LEFT JOIN path_bindings b ON b.canonical_source_ref = c.source_ref
    `, [TARGET_WORKSPACE_REVISION]);
    let exactMatches = null;
    if (historical) {
      const { rows: [match] } = await client.query(`
        SELECT count(*)::int AS matching
        FROM public.codebase_chunk_index c
        JOIN (
          SELECT DISTINCT canonical_source_ref, source_revision, binding_checksum
          FROM public.atlas_workspace_source_bindings
          WHERE workspace_revision = $1
        ) b ON b.canonical_source_ref = c.source_ref
           AND b.source_revision = c.source_revision
           AND b.binding_checksum = c.lineage_binding_checksum
        WHERE c.workspace_revision = $1
      `, [TARGET_WORKSPACE_REVISION]);
      exactMatches = match.matching;
    }
    await client.query('COMMIT');
    const receipt = {
      schema: 'atlas.workspace-revision-backfill.v1',
      generatedAt: new Date().toISOString(),
      dryRun: true,
      writesPerformed: false,
      canonicalAuthority: false,
      targetWorkspaceRevision: TARGET_WORKSPACE_REVISION,
      batchSize: BATCH_SIZE,
      statistics: {
        totalChunksInTable: total.total_chunks,
        priorNullWorkspaceRevision: total.null_ws,
        priorNullSourceRevision: total.null_src,
        priorNullLineageChecksum: total.null_lineage,
        eligibleToBackfill: observation.eligible,
        unmatchedChunksCount: observation.unmatched,
        batchesPlanned: Math.ceil(observation.eligible / BATCH_SIZE),
        batchesExecuted: 0,
        rowsUpdated: 0,
      },
      status: historical ? 'ROLLBACK_BLOCKED_EXACT_AFFECTED_ROWS_AND_PREIMAGES_REQUIRED' : 'DRY_RUN_AUDIT_PASSED',
      ...(historical ? {
        gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
        historicalApplyReceipt: historical,
        recoveryObservation: { ...observation, matchingCurrentBindingTuples: exactMatches },
        affectedPrimaryKeysVerified: false,
        perRowPreimagesVerified: false,
      } : {}),
    };
    receipt.checksum = receiptChecksum(receipt);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(JSON.stringify({
      status: receipt.status,
      reportPath,
      writesPerformed: receipt.writesPerformed,
      statistics: receipt.statistics,
      recoveryObservation: receipt.recoveryObservation,
      checksum: receipt.checksum,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
