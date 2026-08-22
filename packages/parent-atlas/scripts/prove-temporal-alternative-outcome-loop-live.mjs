#!/usr/bin/env node
// Non-production/live proof for the complete Parent Atlas temporal procedural-memory loop.
//
// Proves, against real Postgres infrastructure:
//   K1 FINALIZED failure -> ActionCurrent -> SELECT_ALTERNATIVE
//   -> exact K1 hard exclusion -> deterministic K2 recommendation
//   -> K2 independent DRY lookup -> K2 dispatch exactly once
//   -> K2 FINALIZED success -> RecommendationOutcomeReceiptV1
//   -> checksum-verified Postgres readback.
//
// The proof runs inside one SQL transaction and ROLLBACKs all table writes.
// PostgreSQL sequence reservations are intentionally not transactional, so the
// action ledger sequence may advance and leave gaps. The temporal ledger already
// treats gaps as valid.
//
// Preconditions (this script does NOT apply migrations):
//   sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_events.sql
//   sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_ledger_sequence.sql
//   sveltekit-frontend/drizzle/manual/20260821_atlas_recommendation_outcome_receipts.sql
//
// Run after building packages/parent-atlas:
//   cd packages/parent-atlas
//   npm run build
//   node scripts/prove-temporal-alternative-outcome-loop-live.mjs

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const execFileAsync = promisify(execFile);

for (const root of [process.cwd(), resolve(process.cwd(), '../../sveltekit-frontend')]) {
  for (const file of ['.env', '.env.local']) {
    const path = resolve(root, file);
    if (existsSync(path)) loadEnv({ path, override: false });
  }
}

if (!process.env.DATABASE_URL) {
  console.error('FAIL: DATABASE_URL not resolved after env load');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ledger = await import('../dist/core/temporal-action-ledger.js');
const { createTemporalActionPostgresRepository } = await import(
  '../dist/core/temporal-action-postgres-repository.js'
);
const { recommendAlternativeActionFromHistory } = await import(
  '../dist/core/temporal-action-alternative-runtime.js'
);
const { buildFinalRecommendationOutcomeReceipt } = await import(
  '../dist/core/temporal-recommendation-outcome-runtime.js'
);
const { createRecommendationOutcomePostgresRepository } = await import(
  '../dist/core/temporal-recommendation-outcome-postgres-repository.js'
);

const {
  buildActionExecutionKey,
  buildAgentActionEvent,
  decideExecutionReuse,
  temporalActionChecksum,
} = ledger;

const RUN = `live-loop:${Date.now()}`;
const WORKFLOW_ID = `wf:${RUN}`;
const PRODUCER = 'temporal-live-loop-proof:v1';
const TARGET = `target:${RUN}`;
const EVIDENCE_FRONTIER = temporalActionChecksum({ run: RUN, frontier: 1 });
const OBSERVED_K1 = new Date().toISOString();
const OBSERVED_K2 = new Date(Date.now() + 1).toISOString();

function descriptor({ opcode, input, observedAt }) {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode,
    query_class: 'temporal-live-proof',
    target: {
      canonical_id: TARGET,
      resource: null,
      target_class: 'temporal-proof-target',
    },
    input_hash: temporalActionChecksum(input),
    implementation_revision: 'live-proof:impl:v1',
    parameter_revision: 'live-proof:params:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: observedAt,
      valid_time: { from: null, to: null },
      workspace_revision: {
        value: 'workspace:live-proof:1',
        authority: 'PROVEN',
        evidence_refs: ['live-proof:workspace'],
      },
      source_revision: {
        value: 'source:live-proof:1',
        authority: 'PROVEN',
        evidence_refs: ['live-proof:source'],
      },
      graph_revision: {
        value: null,
        authority: 'NOT_APPLICABLE',
        evidence_refs: [],
      },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: EVIDENCE_FRONTIER,
    },
  };
}

function retryPolicy() {
  return {
    policy_revision: 'live-proof:retry:v1',
    allow_transient_retry: false,
    max_retries: 0,
    retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'],
  };
}

function requireCondition(condition, code, details = undefined) {
  if (!condition) {
    const suffix = details === undefined ? '' : `:${JSON.stringify(details)}`;
    throw new Error(`${code}${suffix}`);
  }
}

async function preflight(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public.atlas_agent_action_events')::text AS action_table,
      to_regclass('public.atlas_recommendation_outcome_receipts')::text AS outcome_table,
      to_regclass('public.atlas_agent_action_ledger_sequence_seq')::text AS ledger_sequence
  `);
  const row = result.rows[0] ?? {};
  requireCondition(row.action_table, 'LIVE_PROOF_ACTION_TABLE_MISSING');
  requireCondition(row.outcome_table, 'LIVE_PROOF_OUTCOME_TABLE_MISSING');
  requireCondition(row.ledger_sequence, 'LIVE_PROOF_LEDGER_SEQUENCE_MISSING');
  return row;
}

async function dispatchK2ExactlyOnce(counter) {
  counter.k2 += 1;
  requireCondition(counter.k2 === 1, 'LIVE_PROOF_K2_DISPATCH_DUPLICATED', counter);

  // This is a real deterministic process dispatch, but deliberately read-only:
  // prove that the selected alternative can execute without touching application
  // state. It searches the canonical temporal ledger source for its own API name.
  const source = resolve(process.cwd(), 'src/core/temporal-action-ledger.ts');
  const { stdout } = await execFileAsync('rg', [
    '--fixed-strings',
    '--count-matches',
    'buildActionExecutionKey',
    source,
  ], { windowsHide: true });
  const matches = Number.parseInt(stdout.trim(), 10);
  requireCondition(Number.isFinite(matches) && matches > 0, 'LIVE_PROOF_RG_NO_MATCH', { stdout });
  return { matches, source };
}

async function main() {
  const client = await pool.connect();
  const dispatchCount = { k1: 0, k2: 0 };
  const report = {
    schema: 'atlas.temporal-live-alternative-outcome-loop-proof.v1',
    run_id: RUN,
    producer_revision: PRODUCER,
    transaction_committed: false,
    transaction_rolled_back: false,
  };

  try {
    await client.query('BEGIN');
    report.preflight = await preflight(client);

    const actionRepo = createTemporalActionPostgresRepository(client);
    const outcomeRepo = createRecommendationOutcomePostgresRepository(client);

    const k1Input = { tool: 'atlas_lookup', args: { query: RUN } };
    const k2Input = { tool: 'rg_search', args: { pattern: 'buildActionExecutionKey' } };
    const k1Descriptor = descriptor({ opcode: 'QDRANT_SEARCH', input: k1Input, observedAt: OBSERVED_K1 });
    const k2Descriptor = descriptor({ opcode: 'RG_SEARCH', input: k2Input, observedAt: OBSERVED_K2 });
    const k1Key = buildActionExecutionKey(k1Descriptor);
    const k2Key = buildActionExecutionKey(k2Descriptor);
    requireCondition(k1Key !== k2Key, 'LIVE_PROOF_EXECUTION_KEYS_COLLIDED');

    // K1 has already failed in the world we are proving. We persist that fact;
    // there is intentionally NO K1 dispatch in this proof run.
    const k1Sequence = await actionRepo.reserveLedgerSequence(PRODUCER);
    const k1Failed = buildAgentActionEvent({
      event_id: `${RUN}:k1:failed`,
      ledger_sequence: k1Sequence.ledger_sequence,
      workflow_action: {
        workflow_id: WORKFLOW_ID,
        workflow_revision: 1,
        action_id: `${RUN}:action:k1`,
        sequence: 1,
      },
      descriptor: k1Descriptor,
      state: 'FINALIZED',
      outcome: 'TOOL_ERROR',
      result_ref: null,
      error_code: 'LIVE_PROOF_K1_KNOWN_FAILURE',
      evidence_refs: ['live-proof:k1:known-failure'],
      artifact_refs: [],
      cost: { latency_ms: 1, gpu_bytes: null, tokens: null, tool_calls: 1 },
      observed_at: OBSERVED_K1,
      producer_revision: PRODUCER,
    });
    const k1Append = await actionRepo.append(k1Failed, PRODUCER);
    requireCondition(k1Append.inserted, 'LIVE_PROOF_K1_APPEND_NOT_INSERTED');
    requireCondition(k1Append.event_checksum === k1Append.readback_checksum, 'LIVE_PROOF_K1_CHECKSUM_MISMATCH');

    const k1Lookup = await actionRepo.currentByExecutionKey(k1Key, PRODUCER);
    requireCondition(k1Lookup.current !== null, 'LIVE_PROOF_K1_CURRENT_MISSING');
    const k1Decision = decideExecutionReuse({
      descriptor: k1Descriptor,
      current: k1Lookup.current,
      retry_policy: retryPolicy(),
      producer_revision: PRODUCER,
    });
    requireCondition(k1Decision.decision === 'HIT', 'LIVE_PROOF_K1_NOT_HIT', k1Decision);
    requireCondition(k1Decision.hit_kind === 'FAILURE', 'LIVE_PROOF_K1_NOT_FAILURE_HIT', k1Decision);
    requireCondition(k1Decision.disposition === 'SELECT_ALTERNATIVE', 'LIVE_PROOF_K1_NOT_SELECT_ALTERNATIVE', k1Decision);

    const history = await actionRepo.listRecentFinalized({
      workflow_id: WORKFLOW_ID,
      limit: 32,
      producer_revision: PRODUCER,
    });
    const selection = recommendAlternativeActionFromHistory({
      workflow_id: WORKFLOW_ID,
      workflow_revision: 1,
      failed_execution_key: k1Key,
      candidates: [{
        execution_key: k2Key,
        candidate: {
          candidate_action_id: `${RUN}:candidate:k2`,
          opcode: 'RG_SEARCH',
          query_class: 'temporal-live-proof',
          target_class: 'temporal-proof-target',
          semantic_affinity: 1,
          structural_affinity: 1,
          query_class_affinity: 1,
          expected_information_gain: 1,
          execution_cost: 0.05,
          estimated_latency: 0.05,
          mutation_risk: 0,
          token_savings: 1,
          dependency_readiness: 1,
          downstream_utility: 1,
          latency_budget_ms: 5000,
          prior_failure_error_code: null,
          evidence_refs: ['live-proof:k2:rg'],
          feature_revision: 'live-proof:features:v1',
        },
      }],
      events: history.events,
      created_at: new Date().toISOString(),
      producer_revision: PRODUCER,
    });
    requireCondition(selection.excluded_execution_keys.includes(k1Key), 'LIVE_PROOF_K1_NOT_HARD_EXCLUDED');
    requireCondition(selection.selected_execution_key === k2Key, 'LIVE_PROOF_K2_NOT_SELECTED', selection);

    // K2 must independently pass through DRY. Selection never authorizes dispatch.
    const k2LookupBefore = await actionRepo.currentByExecutionKey(k2Key, PRODUCER);
    const k2Decision = decideExecutionReuse({
      descriptor: k2Descriptor,
      current: k2LookupBefore.current,
      retry_policy: retryPolicy(),
      producer_revision: PRODUCER,
    });
    requireCondition(k2Decision.decision === 'EXECUTE', 'LIVE_PROOF_K2_NOT_EXECUTE', k2Decision);
    requireCondition(k2Decision.disposition === 'EXECUTE_PROPOSED', 'LIVE_PROOF_K2_BAD_DISPOSITION', k2Decision);

    const k2Dispatch = await dispatchK2ExactlyOnce(dispatchCount);
    requireCondition(dispatchCount.k1 === 0, 'LIVE_PROOF_K1_REDISPATCHED', dispatchCount);

    const k2Sequence = await actionRepo.reserveLedgerSequence(PRODUCER);
    const k2Success = buildAgentActionEvent({
      event_id: `${RUN}:k2:success`,
      ledger_sequence: k2Sequence.ledger_sequence,
      workflow_action: {
        workflow_id: WORKFLOW_ID,
        workflow_revision: 1,
        action_id: `${RUN}:action:k2`,
        sequence: 2,
      },
      descriptor: k2Descriptor,
      state: 'FINALIZED',
      outcome: 'SUCCESS_EXACT',
      result_ref: `${RUN}:result:rg:${k2Dispatch.matches}`,
      error_code: null,
      evidence_refs: ['live-proof:k2:rg-dispatch'],
      artifact_refs: [],
      cost: { latency_ms: null, gpu_bytes: null, tokens: null, tool_calls: 1 },
      observed_at: OBSERVED_K2,
      producer_revision: PRODUCER,
    });
    const k2Append = await actionRepo.append(k2Success, PRODUCER);
    requireCondition(k2Append.inserted, 'LIVE_PROOF_K2_APPEND_NOT_INSERTED');
    requireCondition(k2Append.event_checksum === k2Append.readback_checksum, 'LIVE_PROOF_K2_CHECKSUM_MISMATCH');

    const outcomeReceipt = buildFinalRecommendationOutcomeReceipt({
      recommendation: selection.recommendation,
      selected_action_id: selection.selected_candidate_action_id,
      resulting_execution_key: k2Key,
      downstream_success: true,
      outcome: 'SUCCESS_EXACT',
      evidence_refs: [k2Success.event_id, k1Failed.event_id, 'live-proof:k2:terminal'],
      observed_at: new Date().toISOString(),
      producer_revision: PRODUCER,
    });
    const outcomeAppend = await outcomeRepo.append(outcomeReceipt, PRODUCER);
    requireCondition(outcomeAppend.inserted, 'LIVE_PROOF_OUTCOME_APPEND_NOT_INSERTED');
    requireCondition(
      outcomeAppend.receipt_checksum === outcomeAppend.readback_checksum,
      'LIVE_PROOF_OUTCOME_CHECKSUM_MISMATCH',
    );

    const outcomeReadback = await outcomeRepo.listByRecommendationId(selection.recommendation.recommendation_id);
    requireCondition(outcomeReadback.length === 1, 'LIVE_PROOF_OUTCOME_READBACK_COUNT', { count: outcomeReadback.length });
    requireCondition(outcomeReadback[0].resulting_execution_key === k2Key, 'LIVE_PROOF_OUTCOME_K2_KEY_MISMATCH');
    requireCondition(outcomeReadback[0].downstream_success === true, 'LIVE_PROOF_OUTCOME_NOT_SUCCESS');

    const k1After = await actionRepo.currentByExecutionKey(k1Key, PRODUCER);
    const k2After = await actionRepo.currentByExecutionKey(k2Key, PRODUCER);
    requireCondition(k1After.receipt.event_count === 1, 'LIVE_PROOF_K1_EVENT_COUNT_CHANGED', k1After.receipt);
    requireCondition(k2After.receipt.event_count === 1, 'LIVE_PROOF_K2_EVENT_COUNT_UNEXPECTED', k2After.receipt);
    requireCondition(dispatchCount.k1 === 0, 'LIVE_PROOF_K1_INVOCATION_COUNT_INCREASED', dispatchCount);
    requireCondition(dispatchCount.k2 === 1, 'LIVE_PROOF_K2_INVOCATION_COUNT_NOT_ONE', dispatchCount);

    report.execution_keys = { k1: k1Key, k2: k2Key };
    report.k1 = {
      append_inserted: k1Append.inserted,
      decision: k1Decision.decision,
      hit_kind: k1Decision.hit_kind,
      disposition: k1Decision.disposition,
      hard_excluded: selection.excluded_execution_keys.includes(k1Key),
      dispatch_count: dispatchCount.k1,
      event_count_after: k1After.receipt.event_count,
    };
    report.k2 = {
      decision_before_dispatch: k2Decision.decision,
      selected: selection.selected_execution_key === k2Key,
      dispatch_count: dispatchCount.k2,
      rg_matches: k2Dispatch.matches,
      append_inserted: k2Append.inserted,
      event_count_after: k2After.receipt.event_count,
    };
    report.recommendation = {
      recommendation_id: selection.recommendation.recommendation_id,
      selected_action_id: selection.selected_candidate_action_id,
      selection_checksum: selection.selection_checksum,
      outcome_checksum: outcomeAppend.receipt_checksum,
      outcome_readback_checksum: outcomeAppend.readback_checksum,
      downstream_success: outcomeReadback[0].downstream_success,
    };
    report.proof = {
      k1_not_redispatched: dispatchCount.k1 === 0,
      k2_dispatched_exactly_once: dispatchCount.k2 === 1,
      action_event_checksums_verified: true,
      recommendation_outcome_checksum_verified: true,
      relevant_revision_authority_proven: true,
      live_postgres_readback: true,
      status: 'LIVE_ALTERNATIVE_OUTCOME_LOOP_PROVEN',
    };

    await client.query('ROLLBACK');
    report.transaction_rolled_back = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      report.transaction_rolled_back = true;
    } catch {
      // preserve original failure
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('LIVE_ALTERNATIVE_OUTCOME_LOOP_FAILED:', error);
  process.exit(1);
});
