#!/usr/bin/env node
/**
 * rehearse-five-packet-canary-c636.mjs
 *
 * Option 1: Bounded 5-packet identity canary rehearsal (transactional with mandatory ROLLBACK).
 *
 * Lineage Invariant:
 * Demonstrates exact source-revision correspondence between atlas_packets and committed
 * atlas_workspace_source_bindings under admitted workspace revision c636...
 *
 * Safety Rules:
 * - Transaction MUST end in ROLLBACK.
 * - Writes persisted must be false.
 * - Confirms 100% pre-image equality post-rollback.
 * - Emits audit receipt to .tmp/atlas/five-packet-identity-canary-receipt-c636.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const ADMITTED_WORKSPACE_REVISION = 'sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c';
const REPO_ID = 'deeds-web-app';
const RECEIPT_PATH = path.join(REPO_ROOT, '.tmp/atlas/five-packet-identity-canary-receipt-c636.json');

async function main() {
  const env = loadRepoEnv(process.env);
  const databaseUrl = resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: databaseUrl, statement_timeout: 30000 });

  const client = await pool.connect();
  try {
    console.log('[Canary] Identifying 5 candidate packets with exact admitted binding correspondence...');

    // 1. Select candidate packets
    const candidateQuery = `
      SELECT ap.packet_id, ap.packet_key, ap.source_ref, ap.source_revision, ap.workspace_revision_key,
             wsb.workspace_revision AS binding_workspace_revision,
             wsb.canonical_source_ref AS binding_source_ref,
             wsb.source_revision AS binding_source_revision
      FROM public.atlas_packets ap
      JOIN public.atlas_workspace_source_bindings wsb
        ON wsb.canonical_source_ref = ap.source_ref
       AND wsb.source_revision = ap.source_revision
       AND wsb.repo_id = $1
      WHERE wsb.workspace_revision = $2
      ORDER BY ap.packet_id ASC
      LIMIT 5
    `;

    const candidatesRes = await client.query(candidateQuery, [REPO_ID, ADMITTED_WORKSPACE_REVISION]);
    if (candidatesRes.rows.length !== 5) {
      throw new Error(`Expected exactly 5 candidate packets, found ${candidatesRes.rows.length}`);
    }

    const candidateIds = candidatesRes.rows.map(r => r.packet_id);
    console.log(`[Canary] Candidate packet IDs: ${candidateIds.join(', ')}`);

    // 2. Fetch full before-images
    const beforeRes = await client.query(
      `SELECT * FROM public.atlas_packets WHERE packet_id = ANY($1::text[]) ORDER BY packet_id ASC`,
      [candidateIds]
    );
    const beforeImages = beforeRes.rows;

    // Deep copy before-images for comparison
    const beforeImagesJson = JSON.parse(JSON.stringify(beforeImages));

    // 3. Begin transaction
    console.log('[Canary] Starting transaction (BEGIN)...');
    await client.query('BEGIN');

    // 4. Execute targeted canary update
    const updateRes = await client.query(
      `UPDATE public.atlas_packets
       SET workspace_revision_key = $1
       WHERE packet_id = ANY($2::text[])
       RETURNING packet_id, workspace_revision_key`,
      [ADMITTED_WORKSPACE_REVISION, candidateIds]
    );

    console.log(`[Canary] In-transaction rows updated: ${updateRes.rowCount}`);
    if (updateRes.rowCount !== 5) {
      throw new Error(`Expected 5 updated rows, got ${updateRes.rowCount}`);
    }

    // 5. In-transaction readback
    const inTxRes = await client.query(
      `SELECT * FROM public.atlas_packets WHERE packet_id = ANY($1::text[]) ORDER BY packet_id ASC`,
      [candidateIds]
    );

    let inTxVerified = true;
    const inTxVerificationDetails = [];

    for (let i = 0; i < inTxRes.rows.length; i++) {
      const updatedRow = inTxRes.rows[i];
      const beforeRow = beforeImages[i];

      const keyUpdated = updatedRow.workspace_revision_key === ADMITTED_WORKSPACE_REVISION;
      if (!keyUpdated) {
        inTxVerified = false;
      }

      // Check all other columns are unmodified
      let otherColumnsMatch = true;
      for (const col of Object.keys(beforeRow)) {
        if (col === 'workspace_revision_key') continue;
        const valBefore = JSON.stringify(beforeRow[col]);
        const valAfter = JSON.stringify(updatedRow[col]);
        if (valBefore !== valAfter) {
          otherColumnsMatch = false;
          console.error(`Column mismatch in row ${updatedRow.packet_id} for ${col}: before=${valBefore}, after=${valAfter}`);
        }
      }

      inTxVerificationDetails.push({
        packet_id: updatedRow.packet_id,
        source_ref: updatedRow.source_ref,
        source_revision: updatedRow.source_revision,
        previous_workspace_revision_key: beforeRow.workspace_revision_key,
        updated_workspace_revision_key: updatedRow.workspace_revision_key,
        keyUpdatedCorrectly: keyUpdated,
        otherColumnsPreserved: otherColumnsMatch
      });
    }

    // 6. Mandatory ROLLBACK
    console.log('[Canary] Rolling back transaction (ROLLBACK)...');
    await client.query('ROLLBACK');

    // 7. Post-rollback readback
    const afterRes = await client.query(
      `SELECT * FROM public.atlas_packets WHERE packet_id = ANY($1::text[]) ORDER BY packet_id ASC`,
      [candidateIds]
    );
    const afterImagesJson = JSON.parse(JSON.stringify(afterRes.rows));

    const postRollbackMatchesExact = JSON.stringify(beforeImagesJson) === JSON.stringify(afterImagesJson);
    console.log(`[Canary] Post-rollback match before-image: ${postRollbackMatchesExact}`);

    if (!postRollbackMatchesExact) {
      throw new Error('FATAL: Post-rollback rows do not match before-images exactly!');
    }

    // 8. Generate receipt
    const receipt = {
      schema: 'atlas.five-packet-identity-canary-receipt.v1',
      status: inTxVerified && postRollbackMatchesExact ? 'REHEARSAL_VERIFIED_CLEAN_ROLLBACK' : 'FAILED',
      admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
      candidateCount: candidateIds.length,
      candidatePacketIds: candidateIds,
      inTransactionUpdateVerified: inTxVerified,
      inTxDetails: inTxVerificationDetails,
      postRollbackExactMatch: postRollbackMatchesExact,
      dbWritesPersisted: false,
      rehearsalClean: true,
      mode: 'REHEARSAL_ROLLBACK_ONLY',
      generatedAt: new Date().toISOString()
    };

    fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
    fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`[Canary] Receipt emitted to ${RECEIPT_PATH}`);

    console.log(JSON.stringify(receipt, null, 2));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback err
    }
    console.error('[Canary] Execution error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
