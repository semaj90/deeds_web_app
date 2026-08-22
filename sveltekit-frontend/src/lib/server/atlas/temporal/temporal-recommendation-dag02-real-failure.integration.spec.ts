// @vitest-environment node
//
// ACT-REC-OUT-DAG-02 completion proof.
//
// This file is intentionally NOT enabled by RUN_DB_INTEGRATION alone. It
// appends and deletes throwaway temporal rows, so it requires an explicitly
// disposable PostgreSQL target and rejects the workstation's known
// 127.0.0.1:5434 / localhost:5434 proxy before importing the DB client.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  buildActionExecutionKey,
  buildAgentActionEvent,
  createTemporalActionPostgresRepository,
} from '@deeds/parent-atlas';

import { executeTool } from '$lib/server/ai/tool-shim.js';
import {
  buildTemporalToolExecutionContext,
  buildTemporalToolInputHash,
} from './temporal-tool-execution-boundary.js';
import { persistTemporalRecommendationOutcomeFromPostgres } from './temporal-recommendation-outcome-boundary.js';
import { classifyTemporalProofDatabaseSafetyV1 } from './temporal-proof-database-safety.js';

vi.setConfig({ testTimeout: 90_000 });

for (const file of ['.env', '.env.local']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    const { config } = await import('dotenv');
    config({ path, override: false });
  }
}

const proofRequested = process.env.RUN_DB_INTEGRATION === '1'
  && process.env.ATLAS_TEMPORAL_DISPOSABLE_DB_PROOF === '1';
const dbSafety = classifyTemporalProofDatabaseSafetyV1({
  databaseUrl: process.env.DATABASE_URL,
  explicitDisposableConfirmation: process.env.ATLAS_TEMPORAL_DISPOSABLE_DB_PROOF === '1',
});

if (proofRequested && !dbSafety.allowed) {
  throw new Error(`TEMPORAL_PROOF_DB_REJECTED:${dbSafety.reason}:${dbSafety.target ?? 'unknown'}`);
}
const describeIf = proofRequested && dbSafety.allowed ? describe : describe.skip;

const RUN_ID = `dag02-real-failure-${Date.now()}`;
const PRODUCER_REVISION = `${RUN_ID}:v1`;
const workflowIds: string[] = [];
const recommendationIds: string[] = [];
let pool: Awaited<ReturnType<typeof loadPool>> | null = null;

async function loadPool() {
  const module = await import('$lib/server/db/client.js');
  return module.pool;
}

function noopApplicability() {
  return {
    schema: 'atlas.temporal-applicability.v1' as const,
    observed_at: new Date().toISOString(),
    valid_time: { from: null as string | null, to: null as string | null },
    workspace_revision: { value: null as string | null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] as string[] },
    source_revision: { value: null as string | null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] as string[] },
    graph_revision: { value: null as string | null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] as string[] },
    relevant_dimensions: [] as ('workspace' | 'source' | 'graph')[],
    evidence_frontier_hash: null as string | null,
  };
}

const RETRY_POLICY_NO_RETRY = {
  policy_revision: `${RUN_ID}:retry:v1`,
  allow_transient_retry: false,
  max_retries: 0,
  retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] as ('TOOL_ERROR' | 'TIMEOUT')[],
};

async function seedFailedK1(db: Awaited<ReturnType<typeof loadPool>>, call: { tool: string; args: Record<string, unknown> }) {
  const workflowId = `wf:${RUN_ID}`;
  workflowIds.push(workflowId);
  const applicability = noopApplicability();
  const descriptorBase = {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode: 'QDRANT_SEARCH',
    query_class: 'vector_search',
    target: { canonical_id: `${RUN_ID}:k1`, resource: null as string | null, target_class: 'symbol' },
    implementation_revision: `${RUN_ID}:k1:impl:v1`,
    parameter_revision: `${RUN_ID}:k1:param:v1`,
    context_manifest_hash: null as string | null,
    applicability,
  };
  const descriptor = { ...descriptorBase, input_hash: buildTemporalToolInputHash(call) };
  const executionKey = buildActionExecutionKey(descriptor);
  const event = buildAgentActionEvent({
    event_id: `evt:${RUN_ID}:k1`,
    ledger_sequence: Date.now(),
    workflow_action: { workflow_id: workflowId, workflow_revision: 1, action_id: 'action:k1', sequence: 1 },
    descriptor,
    state: 'FINALIZED',
    outcome: 'TOOL_ERROR',
    result_ref: null,
    error_code: 'SEEDED_PRIOR_FAILURE',
    evidence_refs: ['dag02-proof:k1-prior-failure'],
    artifact_refs: [],
    cost: { latency_ms: 1, gpu_bytes: null, tokens: null, tool_calls: 1 },
    observed_at: applicability.observed_at,
    producer_revision: PRODUCER_REVISION,
  });
  const repository = createTemporalActionPostgresRepository(db);
  const append = await repository.append(event, PRODUCER_REVISION);
  expect(append.inserted).toBe(true);

  return {
    workflowId,
    executionKey,
    temporal: buildTemporalToolExecutionContext({
      call,
      descriptor: descriptorBase,
      retry_policy: RETRY_POLICY_NO_RETRY,
      producer_revision: PRODUCER_REVISION,
    }),
  };
}

function buildFailingK2Plan(workflowId: string) {
  const call = { tool: 'terminal', args: { command: 'exit 37' } };
  const applicability = noopApplicability();
  const descriptorBase = {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode: 'TERMINAL',
    query_class: 'deterministic_failure_proof',
    target: { canonical_id: `${RUN_ID}:k2`, resource: null as string | null, target_class: 'proof_command' },
    implementation_revision: `${RUN_ID}:k2:impl:v1`,
    parameter_revision: `${RUN_ID}:k2:param:v1`,
    context_manifest_hash: null as string | null,
    applicability,
  };
  const descriptor = { ...descriptorBase, input_hash: buildTemporalToolInputHash(call) };
  const executionKey = buildActionExecutionKey(descriptor);
  const temporal = buildTemporalToolExecutionContext({
    call,
    descriptor: descriptorBase,
    retry_policy: RETRY_POLICY_NO_RETRY,
    producer_revision: PRODUCER_REVISION,
  });

  return {
    call,
    executionKey,
    plan: {
      schema: 'atlas.temporal-alternative-plan.v1' as const,
      workflow_id: workflowId,
      workflow_revision: 1,
      candidates: [{
        candidate: {
          candidate_action_id: 'candidate:terminal-failure',
          opcode: 'TERMINAL',
          query_class: 'deterministic_failure_proof',
          target_class: 'proof_command',
          semantic_affinity: 0.1,
          structural_affinity: 0.1,
          query_class_affinity: 1,
          expected_information_gain: 1,
          execution_cost: 0.1,
          estimated_latency: 0.1,
          mutation_risk: 0,
          token_savings: 1,
          dependency_readiness: 1,
          downstream_utility: 0.1,
          latency_budget_ms: 5_000,
          prior_failure_error_code: null as string | null,
          evidence_refs: ['dag02-proof:deterministic-terminal-exit'],
          feature_revision: `${RUN_ID}:features:v1`,
        },
        execution_key: executionKey,
        call,
        temporal,
      }],
      history_limit: 512,
      history_scope: 'WORKFLOW' as const,
      excluded_execution_keys: [] as string[],
      persist_outcome_receipt: true,
      created_at: applicability.observed_at,
      producer_revision: PRODUCER_REVISION,
    },
  };
}

afterAll(async () => {
  if (!pool) return;
  for (const workflowId of workflowIds) {
    await pool.query(`DELETE FROM atlas_agent_action_events WHERE workflow_id = $1`, [workflowId]);
  }
  for (const recommendationId of recommendationIds) {
    await pool.query(`DELETE FROM atlas_recommendation_outcome_receipts WHERE recommendation_id = $1`, [recommendationId]);
  }
});

describeIf('ACT-REC-OUT-DAG-02 real selected-edge failure proof', () => {
  it('selects K2, dispatches K2 exactly once to a real non-zero terminal exit, and persists observed downstream failure without fabricating ActionOutcomeV1', async () => {
    pool = await loadPool();

    const k1Call = { tool: 'atlas_lookup', args: { query: `${RUN_ID}:k1`, limit: 1 } };
    const seeded = await seedFailedK1(pool, k1Call);
    const k2 = buildFailingK2Plan(seeded.workflowId);
    const ctx: Record<string, unknown> = {
      temporalAction: seeded.temporal,
      temporalAlternativePlan: k2.plan,
    };

    const result = await executeTool(k1Call, ctx) as Record<string, unknown>;
    const selection = ctx.temporalAlternativeSelection as Record<string, any>;

    expect(selection).toBeTruthy();
    expect(selection.failed_execution_key).toBe(seeded.executionKey);
    expect(selection.selected_execution_key).toBe(k2.executionKey);
    expect(result.tool).toBe('terminal');
    expect(result.command).toBe('exit 37');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');

    const persisted = await persistTemporalRecommendationOutcomeFromPostgres({
      selection,
      downstream_success: result.ok === true,
      outcome: null,
      evidence_refs: ['dag02-proof:k2-real-dispatch-failed', 'dag02-proof:exit-37'],
      producer_revision: PRODUCER_REVISION,
    });
    recommendationIds.push(persisted.receipt.recommendation_id);

    expect(persisted.append_receipt.inserted).toBe(true);
    expect(persisted.receipt.downstream_success).toBe(false);
    expect(persisted.receipt.outcome).toBeNull();
    expect(persisted.receipt.resulting_execution_key).toBe(k2.executionKey);
    expect(persisted.receipt.selected_action_id).toBe(selection.selected_candidate_action_id);

    const rows = await pool.query(
      `SELECT receipt_json FROM atlas_recommendation_outcome_receipts WHERE recommendation_id = $1`,
      [persisted.receipt.recommendation_id],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].receipt_json.downstream_success).toBe(false);
    expect(rows.rows[0].receipt_json.outcome).toBeNull();
    expect(rows.rows[0].receipt_json.resulting_execution_key).toBe(k2.executionKey);
  });
});
