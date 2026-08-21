#!/usr/bin/env node
// Live, non-mocked proof of ACT-REC-OUT-PG-01..04 against the real Postgres
// instance (atlas_recommendation_outcome_receipts, applied 2026-08-21).
// This does NOT touch application data — it inserts and then deletes rows
// scoped to a single throwaway recommendation_id.
//
// Run from packages/parent-atlas/:
//   node scripts/prove-recommendation-outcome-postgres-live.mjs

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import pg from 'pg';

for (const root of [process.cwd(), resolve(process.cwd(), '../../sveltekit-frontend')]) {
  for (const file of ['.env', '.env.local']) {
    const p = resolve(root, file);
    if (existsSync(p)) loadEnv({ path: p, override: false });
  }
}

if (!process.env.DATABASE_URL) {
  console.error('FAIL: DATABASE_URL not resolved after env load');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const { createRecommendationOutcomePostgresRepository } = await import(
  '../dist/core/temporal-recommendation-outcome-postgres-repository.js'
);
const { buildFinalRecommendationOutcomeReceipt } = await import(
  '../dist/core/temporal-recommendation-outcome-runtime.js'
);

const RUN_ID = `live-proof:${Date.now()}`;
const K1 = 'a'.repeat(64);

function buildReceipt(downstreamSuccess, outcome) {
  return buildFinalRecommendationOutcomeReceipt({
    recommendation: {
      schema: 'atlas.next-action-recommendation.v1',
      recommendation_id: RUN_ID,
      workflow_id: 'wf:live-proof',
      workflow_revision: 1,
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      tang_claim: null,
      feature_revision: 'features:v1',
      candidates: [
        { candidate_action_id: 'candidate:rg', rank: 1, score: 0.9, execution_key: K1, evidence_refs: [] },
      ],
      created_at: '2026-08-21T20:00:00.000Z',
      producer_revision: 'recommend:v1',
    },
    selected_action_id: 'candidate:rg',
    resulting_execution_key: K1,
    downstream_success: downstreamSuccess,
    outcome: outcome ?? null,
    observed_at: new Date().toISOString(),
    producer_revision: 'live-proof:v1',
  });
}

async function main() {
  const repo = createRecommendationOutcomePostgresRepository(pool);
  const results = { runId: RUN_ID };

  // ACT-REC-OUT-PG-01: append + checksum-verified readback (real DB)
  const value = buildReceipt(true);
  const appended = await repo.append(value, 'live-proof:v1');
  results.pg01_append = { inserted: appended.inserted, checksumMatch: appended.receipt_checksum === appended.readback_checksum };

  // ACT-REC-OUT-PG-02: duplicate identical checksum is idempotent (ON CONFLICT DO NOTHING)
  const dup = await repo.append(value, 'live-proof:v1');
  results.pg02_duplicate_idempotent = { inserted: dup.inserted, sameChecksum: dup.receipt_checksum === appended.receipt_checksum };

  // ACT-REC-OUT-PG-03: tampered receipt_json is rejected on readback
  const tamperedChecksum = appended.receipt_checksum;
  await pool.query(
    `UPDATE atlas_recommendation_outcome_receipts SET receipt_json = jsonb_set(receipt_json, '{downstream_success}', 'false') WHERE receipt_checksum = $1`,
    [tamperedChecksum],
  );
  let tamperRejected = false;
  let tamperErrorCode = null;
  try {
    await repo.listByRecommendationId(RUN_ID);
  } catch (err) {
    tamperRejected = true;
    tamperErrorCode = err instanceof Error ? err.message : String(err);
  }
  results.pg03_tamper_rejected = { tamperRejected, tamperErrorCode };
  // repair it back so pg04 (negative outcome) starts clean
  await pool.query(
    `UPDATE atlas_recommendation_outcome_receipts SET receipt_json = jsonb_set(receipt_json, '{downstream_success}', 'true') WHERE receipt_checksum = $1`,
    [tamperedChecksum],
  );

  // ACT-REC-OUT-PG-04: negative-outcome receipt persists distinctly (different checksum, same recommendation_id)
  const negative = buildReceipt(false, 'TEST_FAILED');
  const appendedNeg = await repo.append(negative, 'live-proof:v1');
  results.pg04_negative_outcome = {
    inserted: appendedNeg.inserted,
    distinctFromPositive: appendedNeg.receipt_checksum !== appended.receipt_checksum,
  };

  const listed = await repo.listByRecommendationId(RUN_ID);
  results.list_by_recommendation_id = { count: listed.length, downstreamSuccessValues: listed.map((r) => r.downstream_success).sort() };

  // Cleanup: this table is append-only by product contract, but this run used a
  // throwaway recommendation_id that must not linger in a shared Postgres instance.
  const cleanup = await pool.query(`DELETE FROM atlas_recommendation_outcome_receipts WHERE recommendation_id = $1`, [RUN_ID]);
  results.cleanup_deleted_rows = cleanup.rowCount;

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error('LIVE_PROOF_FAILED:', err);
  await pool.end();
  process.exit(1);
});
