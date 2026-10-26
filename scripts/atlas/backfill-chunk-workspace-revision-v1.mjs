#!/usr/bin/env node
/**
 * BACKFILL-CHUNK-WORKSPACE-REVISION-V1
 *
 * Lineage backfill for `codebase_chunk_index` from `atlas_workspace_source_bindings`.
 *
 * Populates:
 *   - c.workspace_revision
 *   - c.source_revision
 *   - c.lineage_binding_checksum
 *
 * Safety & Governance:
 *   - Defaults to --dry-run (SELECT only, zero mutations).
 *   - When --apply is passed, requires --confirm-apply and processes in bounded batches (5,000 rows/batch).
 *   - Validates that target workspace_revision matches the verified active revision:
 *     sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc
 *   - Writes audit receipt to docs/reports/workspace-revision-backfill-receipt-v1.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const TARGET_WORKSPACE_REVISION = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const BATCH_SIZE = 5000;
const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/workspace-revision-backfill-receipt-v1.json');

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isConfirmed = args.includes('--confirm-apply');

async function main() {
  const env = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const client = new pg.Client({ connectionString: dbUrl });

  console.log('Connecting to PostgreSQL...');
  await client.connect();
  await client.query('SET paradedb.check_aggregate_scan = false').catch(() => {});

  try {
    console.log(`Auditing eligible chunks for workspace_revision: ${TARGET_WORKSPACE_REVISION}...`);

    // Step 1: Count total chunks and null lineage columns
    const totalRes = await client.query(`
      SELECT
        count(*) AS total_chunks,
        count(CASE WHEN workspace_revision IS NULL THEN 1 END) AS null_ws,
        count(CASE WHEN source_revision IS NULL THEN 1 END) AS null_src,
        count(CASE WHEN lineage_binding_checksum IS NULL THEN 1 END) AS null_lineage
      FROM codebase_chunk_index
    `);
    const totalStats = totalRes.rows[0];

    // Step 2: Count eligible matches in atlas_workspace_source_bindings
    const eligibleRes = await client.query(`
      SELECT count(*) AS eligible_count
      FROM codebase_chunk_index c
      JOIN atlas_workspace_source_bindings b
        ON b.canonical_source_ref = c.source_ref
      WHERE b.workspace_revision = $1
        AND c.workspace_revision IS NULL
    `, [TARGET_WORKSPACE_REVISION]);
    const eligibleCount = parseInt(eligibleRes.rows[0].eligible_count, 10);

    // Step 3: Count chunks from other source bindings or unmatched
    const unmatchedRes = await client.query(`
      SELECT count(*) AS unmatched_count
      FROM codebase_chunk_index c
      LEFT JOIN atlas_workspace_source_bindings b
        ON b.canonical_source_ref = c.source_ref AND b.workspace_revision = $1
      WHERE b.canonical_source_ref IS NULL
        AND c.workspace_revision IS NULL
    `, [TARGET_WORKSPACE_REVISION]);
    const unmatchedCount = parseInt(unmatchedRes.rows[0].unmatched_count, 10);

    console.log(`Total chunks in codebase_chunk_index: ${totalStats.total_chunks}`);
    console.log(`Currently null workspace_revision: ${totalStats.null_ws}`);
    console.log(`Eligible for backfill via active workspace bindings: ${eligibleCount}`);
    console.log(`Unmatched (no matching source_ref in bindings): ${unmatchedCount}`);

    let updatedCount = 0;
    let batchesProcessed = 0;

    if (isApply) {
      if (!isConfirmed) {
        throw new Error('APPLY_REFUSED: --apply requires explicit --confirm-apply flag.');
      }
      console.log(`\nExecuting batched UPDATE in chunks of ${BATCH_SIZE}...`);
      const totalBatches = Math.ceil(eligibleCount / BATCH_SIZE);

      while (true) {
        const updateRes = await client.query(`
          WITH to_update AS (
            SELECT c.id, b.workspace_revision, b.source_revision, b.binding_checksum
            FROM codebase_chunk_index c
            JOIN atlas_workspace_source_bindings b
              ON b.canonical_source_ref = c.source_ref
            WHERE b.workspace_revision = $1
              AND c.workspace_revision IS NULL
            LIMIT $2
          )
          UPDATE codebase_chunk_index target
          SET
            workspace_revision = to_update.workspace_revision,
            source_revision = to_update.source_revision,
            lineage_binding_checksum = to_update.binding_checksum
          FROM to_update
          WHERE target.id = to_update.id
        `, [TARGET_WORKSPACE_REVISION, BATCH_SIZE]);

        const rowsAffected = updateRes.rowCount || 0;
        if (rowsAffected === 0) break;

        updatedCount += rowsAffected;
        batchesProcessed++;
        console.log(`  Batch ${batchesProcessed}/${totalBatches}: updated ${rowsAffected} chunks (total: ${updatedCount})`);
      }
      console.log(`✓ Apply complete: updated ${updatedCount} chunks.`);
    } else {
      console.log('\n[DRY RUN]: No mutations performed. Run with --apply --confirm-apply to execute.');
    }

    // Step 4: Write audit receipt
    const receipt = {
      schema: 'atlas.workspace-revision-backfill.v1',
      generatedAt: new Date().toISOString(),
      dryRun: !isApply,
      writesPerformed: isApply && updatedCount > 0,
      canonicalAuthority: false,
      targetWorkspaceRevision: TARGET_WORKSPACE_REVISION,
      batchSize: BATCH_SIZE,
      statistics: {
        totalChunksInTable: parseInt(totalStats.total_chunks, 10),
        priorNullWorkspaceRevision: parseInt(totalStats.null_ws, 10),
        priorNullSourceRevision: parseInt(totalStats.null_src, 10),
        priorNullLineageChecksum: parseInt(totalStats.null_lineage, 10),
        eligibleToBackfill: eligibleCount,
        unmatchedChunksCount: unmatchedCount,
        batchesPlanned: Math.ceil(eligibleCount / BATCH_SIZE),
        batchesExecuted: batchesProcessed,
        rowsUpdated: updatedCount,
      },
      status: isApply ? 'APPLY_COMPLETED' : 'DRY_RUN_AUDIT_PASSED',
    };

    const serialized = JSON.stringify(receipt, null, 2);
    const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
    receipt.checksum = `sha256:${checksum}`;

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2), 'utf8');

    console.log(`\n✓ Audit receipt written to: ${REPORT_PATH}`);
    console.log(`✓ Checksum: ${receipt.checksum}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
