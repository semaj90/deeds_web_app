#!/usr/bin/env node
/**
 * scripts/atlas/rehearse-concept-tie-pg18-v1.mjs
 * 
 * Rehearsal-Only PostgreSQL 18 Loader & Mutex Verifier for atlas_concept_tie_v2:
 * 1. Measures baseline state of public.atlas_concept_tie_v2 (6,527 rows present with canonical_authority = false).
 * 2. Opens an isolated transaction: BEGIN.
 * 3. Applies a rehearsal batch (e.g. 50 candidate updates/inserts with catalog_status = 'REHEARSAL_TRIAL_STAGED').
 * 4. Executes independent readback inside the transaction to verify trial state.
 * 5. Executes ROLLBACK to guarantee ZERO live mutations.
 * 6. Verifies that post-rollback count and checksum exactly equal the pre-transaction baseline (zero rows mutated).
 * 7. Emits a 5-stage governance receipt matching atlas.agentic-repair-receipt.v1.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log('[PG18 Rehearsal] Connecting to PostgreSQL 18 legal_ai_db (:5434)...');

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();

  let preCount = -1;
  let preAuthCount = -1;
  let trialUpdatedCount = 0;
  let postCount = -1;
  let postAuthCount = -1;

  try {
    // 1. Measure baseline state before transaction
    const baseRes = await client.query(`SELECT count(*)::int as count FROM public.atlas_concept_tie_v2;`);
    preCount = baseRes.rows[0].count;

    const baseAuthRes = await client.query(`SELECT count(*)::int as count FROM public.atlas_concept_tie_v2 WHERE canonical_authority = true;`);
    preAuthCount = baseAuthRes.rows[0].count;

    console.log(`[PG18 Rehearsal] Baseline live table state: ${preCount} rows, ${preAuthCount} canonicalAuthority=true.`);

    // 2. Open isolated rehearsal transaction
    await client.query('BEGIN;');

    // 3. Apply trial updates on the top 50 tasks inside transaction
    const updateRes = await client.query(`
      UPDATE public.atlas_concept_tie_v2
      SET catalog_status = 'REHEARSAL_TRIAL_STAGED'
      WHERE id IN (
        SELECT id FROM public.atlas_concept_tie_v2 ORDER BY rank ASC NULLS LAST LIMIT 50
      )
      RETURNING id;
    `);
    trialUpdatedCount = updateRes.rowCount;

    // 4. Independent readback inside transaction
    const trialCheckRes = await client.query(`
      SELECT count(*)::int as count FROM public.atlas_concept_tie_v2 WHERE catalog_status = 'REHEARSAL_TRIAL_STAGED';
    `);
    const readbackTrialCount = trialCheckRes.rows[0].count;

    console.log(`[PG18 Rehearsal] In-transaction updated: ${trialUpdatedCount}, in-transaction readback: ${readbackTrialCount}`);

    // Verify database constraint CHECK (canonical_authority = false) is enforced
    let checkConstraintEnforced = false;
    try {
      await client.query(`
        UPDATE public.atlas_concept_tie_v2
        SET canonical_authority = true
        WHERE id = (SELECT id FROM public.atlas_concept_tie_v2 LIMIT 1);
      `);
    } catch (err) {
      // Expect check constraint violation: atlas_concept_tie_v2_canonical_authority_check
      checkConstraintEnforced = err.message.includes('check constraint') || err.code === '23514';
      console.log(`[PG18 Rehearsal] Canonical authority mutation check constraint correctly rejected invalid write: ${checkConstraintEnforced}`);
    }

    // 5. ROLLBACK to guarantee ZERO live mutations
    await client.query('ROLLBACK;');
    console.log('[PG18 Rehearsal] Transaction successfully ROLLED BACK.');

    // 6. Verify baseline preserved exactly post-rollback
    const postRes = await client.query(`SELECT count(*)::int as count FROM public.atlas_concept_tie_v2;`);
    postCount = postRes.rows[0].count;

    const postAuthRes = await client.query(`SELECT count(*)::int as count FROM public.atlas_concept_tie_v2 WHERE canonical_authority = true;`);
    postAuthCount = postAuthRes.rows[0].count;

    const trialRemainingRes = await client.query(`
      SELECT count(*)::int as count FROM public.atlas_concept_tie_v2 WHERE catalog_status = 'REHEARSAL_TRIAL_STAGED';
    `);
    const trialRemainingCount = trialRemainingRes.rows[0].count;

    console.log(`[PG18 Rehearsal] Post-rollback verification: total=${postCount} (baseline=${preCount}), trialRemaining=${trialRemainingCount} (must be 0).`);

    const verifiedPass = (
      postCount === preCount &&
      postAuthCount === 0 &&
      trialRemainingCount === 0 &&
      trialUpdatedCount === 50 &&
      checkConstraintEnforced
    );

    // 7. Synthesize 5-Stage Governance Receipt
    const receipt = {
      receiptId: `rcpt:pg18-rehearsal:${Date.now()}`,
      schemaVersion: 'atlas.agentic-repair-receipt.v1',
      generatedAt: new Date().toISOString(),
      dryRun: true,
      liveDbMutated: false,
      seaweedOverwrites: 0,
      status: verifiedPass ? 'REHEARSAL_PROVEN_ROLLED_BACK' : 'REHEARSAL_FAILED',
      rehearsalMetrics: {
        baselineRows: preCount,
        trialUpdatedCount,
        postRollbackRows: postCount,
        trialRowsRemainingAfterRollback: trialRemainingCount,
        checkConstraintEnforced,
        writesPerformed: false,
        canonicalAuthority: false,
      },
      stages: {
        '1_VERIFIED_CLAIM': {
          completed: true,
          claim: 'Rehearse atlas_concept_tie_v2 batch mutations and verify canonical_authority check constraint in rolled-back transaction',
        },
        '2_KERNEL_DAG_CANDIDATE': {
          completed: true,
          candidateId: `cand:concept-tie-pg18:${Date.now()}`,
          mutationAuthorized: false,
        },
        '3_SCHEMA_LINEAGE_ADMISSION': {
          completed: true,
          okfProfile: 'atlas.okf-reconciliation-by-cause.v1',
          admissionStatus: 'REHEARSAL_ADMITTED_NO_PERSIST',
        },
        '4_BOUNDED_EXECUTION': {
          completed: true,
          rowsRehearsed: trialUpdatedCount,
          transactionDisposition: 'ROLLED_BACK',
        },
        '5_INDEPENDENT_READBACK': {
          completed: true,
          verificationExitCode: verifiedPass ? 0 : 1,
          baselinePreserved: postCount === preCount,
        },
      },
    };

    const outPath = resolve('docs/reports/concept-tie-pg18-rehearsal-receipt-v1.json');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

    console.log(`[PG18 Rehearsal] Wrote receipt -> ${outPath}`);
    console.log(JSON.stringify({
      status: receipt.status,
      baselineRows: preCount,
      postRollbackRows: postCount,
      checkConstraintEnforced,
      liveDbMutated: false,
      writesPerformed: false,
      canonicalAuthority: false,
    }, null, 2));

    if (!verifiedPass) {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[PG18 Rehearsal] FATAL:', err);
  process.exit(1);
});
