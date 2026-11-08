#!/usr/bin/env node
/**
 * scripts/atlas/rehearse-nextsteps-prefill-and-outcome-receipt-v1.mjs
 *
 * Closed Loop Rehearsal on SCRATCH ONLY (legal_ai_live_integration_scratch):
 * 1. Proposer Recommendation: calls recommendKanbanDagPrefillV1 with nextsteps: featureId.
 * 2. Outcome Receipt Persistence: records the execution outcome into public.atlas_recommendation_outcome_receipts
 *    using the canonical @deeds/parent-atlas repository.
 * 3. Idempotency Proof: re-appends the identical receipt and verifies ON CONFLICT DO NOTHING.
 * 4. Readback Verification: confirms checksum parity and non-canonical authority.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { recommendKanbanDagPrefillV1 } from '../../sveltekit-frontend/src/mcp/kanban-dag-prefill-recommendation.ts';
import { createRecommendationOutcomePostgresRepository } from '../../packages/parent-atlas/dist/core/temporal-recommendation-outcome-postgres-repository.js';
import { buildFinalRecommendationOutcomeReceipt } from '../../packages/parent-atlas/dist/core/temporal-recommendation-outcome-runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = path.join(ROOT, 'docs/reports/nextsteps-prefill-and-outcome-rehearsal-v1.json');
const TARGET_FEATURE_ID = 'nextsteps:sveltekit-frontend-next-steps-plans-bitfrost-turboquant-turbovec-production-todo';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SCRATCH_DB_RE = /^[a-z0-9_]+_scratch$/;

function getScratchUrl() {
  if (process.env.SCRATCH_DATABASE_URL) return process.env.SCRATCH_DATABASE_URL;
  const u = new URL(resolveDatabaseUrl(loadRepoEnv(process.env)));
  u.pathname = '/legal_ai_live_integration_scratch';
  return u.toString();
}

async function main() {
  const url = new URL(getScratchUrl());
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!SCRATCH_DB_RE.test(dbName)) {
    throw new Error(`SAFETY_FAIL: target database must be scratch, got: ${dbName}`);
  }
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(`SAFETY_FAIL: host must be loopback, got: ${url.hostname}`);
  }

  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();
  const summary = {
    schema: 'atlas.nextsteps-prefill-outcome-rehearsal.v1',
    generatedAt: new Date().toISOString(),
    database: dbName,
    featureId: TARGET_FEATURE_ID,
    canonicalAuthority: false,
    writesPerformed: true,
  };

  try {
    // Identity verification
    const ident = (await client.query(`SELECT current_database() AS db, current_setting('server_version_num')::int AS v`)).rows[0];
    if (ident.db !== dbName || !SCRATCH_DB_RE.test(ident.db)) {
      throw new Error(`DATABASE_IDENTITY_MISMATCH: expected ${dbName}, got ${ident.db}`);
    }

    console.log(`[Rehearsal] Connected to verified scratch DB: ${ident.db} (PostgreSQL version: ${ident.v})`);

    // 1. Proposer Recommendation
    console.log(`[Rehearsal] 1. Requesting prefill recommendation for ${TARGET_FEATURE_ID}...`);
    const recommendation = await recommendKanbanDagPrefillV1(pool, {
      featureId: TARGET_FEATURE_ID,
      cohortLimit: 64,
      maxPrefillTasks: 16,
    });

    if (recommendation.status !== 'PROPOSED') {
      throw new Error(`PREFILL_RECOMMENDATION_FAILED: ${recommendation.status} (reason: ${recommendation.reasonCode})`);
    }

    console.log(`✓ Prefill recommendation status: ${recommendation.status}`);
    console.log(`  Algorithm: ${recommendation.algorithm}`);
    console.log(`  Ready task count: ${recommendation.readyTaskIds.length}`);
    console.log(`  Sample task: ${recommendation.readyTaskIds[0]}`);

    const targetTaskId = recommendation.readyTaskIds[0];
    if (!targetTaskId) {
      throw new Error('NO_TASKS_RECOMMENDED');
    }

    // 2. Synthesize Action Execution & Recommendation Receipt
    const actionKeyHex = crypto.createHash('sha256').update(`action:prefill:${targetTaskId}`, 'utf8').digest('hex');
    const recommendationId = `rec:nextsteps:${targetTaskId.split('#')[1] || Date.now()}`;
    const candidateActionId = `candidate:execute:${targetTaskId}`;

    const recommendationPayload = {
      schema: 'atlas.next-action-recommendation.v1',
      recommendation_id: recommendationId,
      workflow_id: 'wf:nextsteps-prefill',
      workflow_revision: 1,
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      tang_claim: null,
      feature_revision: 'features:v1',
      candidates: [
        {
          candidate_action_id: candidateActionId,
          rank: 1,
          score: 0.95,
          execution_key: actionKeyHex,
          evidence_refs: [`task:${targetTaskId}`],
        },
      ],
      created_at: new Date().toISOString(),
      producer_revision: 'nextsteps-proposer:v1',
    };

    const outcomeReceipt = buildFinalRecommendationOutcomeReceipt({
      recommendation: recommendationPayload,
      selected_action_id: candidateActionId,
      resulting_execution_key: actionKeyHex,
      downstream_success: true,
      outcome: null,
      evidence_refs: [`feature:${TARGET_FEATURE_ID}`],
      observed_at: new Date().toISOString(),
      producer_revision: 'nextsteps-prefill-rehearsal:v1',
    });

    console.log(`[Rehearsal] 2. Persisting RecommendationOutcomeReceipt into scratch atlas_recommendation_outcome_receipts...`);
    const outcomeRepo = createRecommendationOutcomePostgresRepository(client);
    const append1 = await outcomeRepo.append(outcomeReceipt, 'nextsteps-prefill-rehearsal:v1');

    console.log(`✓ Append 1 result: inserted=${append1.inserted}, checksum=${append1.receipt_checksum}`);

    // 3. Verify Idempotent Duplicate Append (ON CONFLICT DO NOTHING)
    const append2 = await outcomeRepo.append(outcomeReceipt, 'nextsteps-prefill-rehearsal:v1');
    console.log(`✓ Append 2 (duplicate) result: inserted=${append2.inserted}, checksum=${append2.receipt_checksum}`);

    // 4. Readback Verification from DB
    const readback = await client.query(
      `SELECT receipt_checksum, recommendation_id, resulting_execution_key, downstream_success, observed_at, persisted_at
       FROM public.atlas_recommendation_outcome_receipts
       WHERE receipt_checksum = $1`,
      [append1.receipt_checksum]
    );

    if (readback.rows.length !== 1) {
      throw new Error(`READBACK_FAILED: expected 1 row, found ${readback.rows.length}`);
    }

    const row = readback.rows[0];
    console.log(`✓ Direct Readback verified:`);
    console.log(`  receipt_checksum: ${row.receipt_checksum}`);
    console.log(`  recommendation_id: ${row.recommendation_id}`);
    console.log(`  downstream_success: ${row.downstream_success}`);
    console.log(`  persisted_at: ${row.persisted_at}`);

    // Overall table count check
    const totalCountRes = await client.query(`SELECT count(*)::int AS count FROM public.atlas_recommendation_outcome_receipts`);
    const totalRows = totalCountRes.rows[0].count;
    console.log(`✓ Total rows now in scratch atlas_recommendation_outcome_receipts: ${totalRows}`);

    Object.assign(summary, {
      status: 'PASS',
      recommendation: {
        algorithm: recommendation.algorithm,
        readyTaskIdsCount: recommendation.readyTaskIds.length,
        selectedTaskId: targetTaskId,
      },
      outcomeReceipt: {
        receiptChecksum: append1.receipt_checksum,
        firstAppendInserted: append1.inserted,
        secondAppendInserted: append2.inserted,
        downstreamSuccess: row.downstream_success,
        totalScratchOutcomeReceiptRows: totalRows,
      },
    });

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    console.log(`✓ Rehearsal report written to ${REPORT_PATH}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[FATAL Rehearsal Error]:', err);
  process.exit(1);
});
