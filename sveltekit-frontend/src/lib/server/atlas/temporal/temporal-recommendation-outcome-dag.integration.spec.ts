// @vitest-environment node
//
// Live (non-mocked) proof of ACT-REC-OUT-DAG-01, -02, -04, and -03 from
// openspec/changes/parent-atlas-transport-memory-boundaries/temporal-recommendation-outcome-addendum.md
//
// Unlike its sibling *.spec.ts files in this directory, this is an
// integration test: it requires a real reachable Postgres (atlas_agent_action_events,
// atlas_recommendation_outcome_receipts) and genuinely runs `rg` over src/ via
// the real tool-shim dispatcher. All rows it creates are scoped to a unique
// per-run id and removed in afterAll.
//
// It calls the REAL production functions end to end:
//   - buildAgentActionEvent / createTemporalActionPostgresRepository (package)
//   - buildTemporalToolExecutionContext / decideTemporalToolExecutionFromPostgres (sveltekit boundary)
//   - selectTemporalAlternativeToolFromPostgres (sveltekit boundary)
//   - executeTool (real tool-shim.ts dispatch)
//   - persistTemporalRecommendationOutcomeFromPostgres (sveltekit boundary)
//   - runAgentDAG (the real LangGraph StateGraph in langgraph-dag.ts) for DAG-03
//
// The one thing this does NOT do live: force K1's *first* real dispatch to
// fail. Making live external infra fail on command isn't deterministic, so
// K1's FAILURE history is seeded directly into the real ledger via the same
// buildAgentActionEvent()/repository.append() path a real failed execution
// would have used — i.e. this proves "given K1 already finalized as a
// failure, does the real decide -> select -> execute -> persist chain work",
// not "does K1's specific tool call fail on this run". That distinction is
// recorded here and in the addendum rather than glossed over.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Requires a real reachable Postgres + real tool dispatch (rg_search over src/).
// Opt-in only, matching the established repo convention in
// tests/engram-registry-db.integration.spec.ts, so a normal `vitest run`
// without RUN_DB_INTEGRATION=1 set never attempts a live DB connection.
const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

// First call to executeTool() triggers a cold dynamic import of
// mcp-tool-dispatch.js, whose module graph touches several other
// service clients (Redis, Qdrant, Neo4j) at import time even though this
// proof only exercises the self-contained rg_search path. That cold import
// can comfortably exceed vitest's 30s default on a loaded dev machine.
vi.setConfig({ testTimeout: 90_000 });

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

// $lib/server/db/client.js reads DATABASE_URL from ENV at module-import time
// (top-level `new Pool(...)`). Vitest does not otherwise load .env/.env.local
// into process.env, so this must happen before that module is ever imported —
// including transitively (e.g. runAgentDAG -> ollama.ts -> runtime-contract.ts
// reading ROTORQUANT_MODEL_PATH). Load env with a top-level await first, then
// dynamically import the DB-dependent binding.
for (const file of ['.env', '.env.local']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    const { config } = await import('dotenv');
    config({ path, override: false });
  }
}
const { pool } = await import('$lib/server/db/client.js');

const RUN_ID = `dag-live-proof-${Date.now()}`;
const PRODUCER_REVISION = `${RUN_ID}:v1`;

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
  retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] as (
    'TOOL_ERROR' | 'TIMEOUT'
  )[],
};

const actionRepo = createTemporalActionPostgresRepository(pool);
// atlas_agent_action_events.ledger_sequence is UNIQUE across the whole table
// (not scoped per workflow_id), and all three scenarios below run in the same
// process before the shared afterAll fires — so each seeded event needs a
// globally distinct sequence number for the duration of this file's run.
let nextLedgerSequence = Date.now();
const seededWorkflowIds: string[] = [];
const seededRecommendationIds: string[] = [];

/**
 * Seeds a real FINALIZED/failure AgentActionEventV1 for one "K1" call,
 * exactly as a genuine failed execution would have appended it, and returns
 * everything needed to replay the real DRY-gate decision against it.
 */
async function seedFailedK1(scenario: string, call: { tool: string; args: Record<string, unknown> }) {
  const workflowId = `wf:${RUN_ID}:${scenario}`;
  seededWorkflowIds.push(workflowId);
  const applicability = noopApplicability();
  const descriptorBase = {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode: 'QDRANT_SEARCH',
    query_class: 'vector_search',
    target: { canonical_id: `${RUN_ID}:${scenario}:k1`, resource: null as string | null, target_class: 'symbol' },
    implementation_revision: `${RUN_ID}:impl:v1`,
    parameter_revision: `${RUN_ID}:param:v1`,
    context_manifest_hash: null as string | null,
    applicability,
  };
  const descriptor = { ...descriptorBase, input_hash: buildTemporalToolInputHash(call) };
  const executionKey = buildActionExecutionKey(descriptor);

  const event = buildAgentActionEvent({
    event_id: `evt:${RUN_ID}:${scenario}:k1`,
    ledger_sequence: nextLedgerSequence++,
    workflow_action: { workflow_id: workflowId, workflow_revision: 1, action_id: 'action:k1', sequence: 1 },
    descriptor,
    state: 'FINALIZED',
    outcome: 'TOOL_ERROR',
    result_ref: null,
    error_code: 'SIMULATED_QDRANT_TIMEOUT',
    evidence_refs: [],
    artifact_refs: [],
    cost: { latency_ms: 1200, gpu_bytes: null, tokens: null, tool_calls: 1 },
    observed_at: applicability.observed_at,
    producer_revision: PRODUCER_REVISION,
  });
  const appendReceipt = await actionRepo.append(event, PRODUCER_REVISION);
  expect(appendReceipt.inserted).toBe(true);

  const temporalContext = buildTemporalToolExecutionContext({
    call,
    descriptor: descriptorBase,
    retry_policy: RETRY_POLICY_NO_RETRY,
    producer_revision: PRODUCER_REVISION,
  });

  return { workflowId, executionKey, temporalContext, observedAt: applicability.observed_at };
}

function buildK2Plan(scenario: string, workflowId: string, call: { tool: string; args: Record<string, unknown> }) {
  const applicability = noopApplicability();
  const descriptorBase = {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode: 'RG_SEARCH',
    query_class: null as string | null,
    target: { canonical_id: `${RUN_ID}:${scenario}:k2`, resource: null as string | null, target_class: 'symbol' },
    implementation_revision: `${RUN_ID}:impl:v1`,
    parameter_revision: `${RUN_ID}:param:v1`,
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

  const plan = {
    schema: 'atlas.temporal-alternative-plan.v1' as const,
    workflow_id: workflowId,
    workflow_revision: 1,
    candidates: [
      {
        candidate: {
          candidate_action_id: `candidate:${scenario}:rg_search`,
          opcode: 'RG_SEARCH',
          query_class: null as string | null,
          target_class: 'symbol',
          semantic_affinity: 0.7,
          structural_affinity: 0.6,
          query_class_affinity: 0.5,
          expected_information_gain: 0.8,
          execution_cost: 0.2,
          estimated_latency: 0.2,
          mutation_risk: 0,
          token_savings: 0.5,
          dependency_readiness: 1,
          downstream_utility: 0.7,
          latency_budget_ms: 5_000,
          prior_failure_error_code: null as string | null,
          evidence_refs: [] as string[],
          feature_revision: `${RUN_ID}:features:v1`,
        },
        execution_key: executionKey,
        call,
        temporal,
      },
    ],
    history_limit: 512,
    history_scope: 'WORKFLOW' as const,
    excluded_execution_keys: [] as string[],
    persist_outcome_receipt: false, // caller flips true only for scenarios that opt in
    created_at: applicability.observed_at,
    producer_revision: PRODUCER_REVISION,
  };

  return { plan, executionKey };
}

afterAll(async () => {
  for (const workflowId of seededWorkflowIds) {
    await pool.query(`DELETE FROM atlas_agent_action_events WHERE workflow_id = $1`, [workflowId]);
  }
  for (const recommendationId of seededRecommendationIds) {
    await pool.query(`DELETE FROM atlas_recommendation_outcome_receipts WHERE recommendation_id = $1`, [recommendationId]);
  }
});

describeIf('ACT-REC-OUT-DAG live proof (real Postgres, real tool dispatch)', () => {
  it('DAG-01/DAG-04: exact known K1 failure selects K2, K2 executes for real, one downstream-success receipt is persisted with the execution key preserved end to end', async () => {
    const k1Call = { tool: 'atlas_lookup', args: { query: `${RUN_ID}-dag01`, limit: 1 } };
    const k2Call = { tool: 'rg_search', args: { query: 'temporalActionChecksum', paths: ['src/lib/server/atlas/temporal'], limit: 5 } };

    const { workflowId, executionKey: k1ExecutionKey, temporalContext: k1Temporal } = await seedFailedK1('dag01', k1Call);
    const { plan, executionKey: k2ExecutionKey } = buildK2Plan('dag01', workflowId, k2Call);

    const ctx: Record<string, unknown> = {
      temporalAction: k1Temporal,
      temporalAlternativePlan: plan,
    };

    const toolResult = (await executeTool(k1Call, ctx)) as { success?: boolean; tool?: string };

    // The real DRY gate actually redirected execution to K2, not K1.
    expect(toolResult.tool).toBe('codebase.rg_search');
    expect(typeof toolResult.success).toBe('boolean');

    const selection = ctx.temporalAlternativeSelection as Record<string, any>;
    expect(selection).toBeTruthy();
    expect(selection.failed_execution_key).toBe(k1ExecutionKey);
    expect(selection.selected_execution_key).toBe(k2ExecutionKey);
    expect(selection.package_selection.recommendation.candidates[0].execution_key).toBe(k2ExecutionKey);

    const outcomeBoundary = await persistTemporalRecommendationOutcomeFromPostgres({
      selection,
      downstream_success: toolResult.success === true,
      outcome: null,
      evidence_refs: ['dag-live-proof:k2-executed'],
      producer_revision: PRODUCER_REVISION,
    });
    seededRecommendationIds.push(outcomeBoundary.receipt.recommendation_id);

    // DAG-01
    expect(outcomeBoundary.append_receipt.inserted).toBe(true);
    expect(outcomeBoundary.receipt.downstream_success).toBe(true);
    expect(outcomeBoundary.receipt.outcome).toBeNull(); // no fabricated SUCCESS_EXACT

    // DAG-04: same selected execution key preserved from recommendation -> selection -> DRY gate -> receipt
    expect(outcomeBoundary.receipt.resulting_execution_key).toBe(k2ExecutionKey);
    expect(outcomeBoundary.receipt.selected_action_id).toBe(selection.selected_candidate_action_id);
  });

  it('DAG-02 (partial): the negative-outcome path accepts a genuine (not hand-built) selection and persists downstream_success=false distinctly', async () => {
    const k1Call = { tool: 'atlas_lookup', args: { query: `${RUN_ID}-dag02`, limit: 1 } };
    const k2Call = { tool: 'rg_search', args: { query: 'temporalActionChecksum', paths: ['src/lib/server/atlas/temporal'], limit: 5 } };

    const { workflowId, temporalContext: k1Temporal } = await seedFailedK1('dag02', k1Call);
    const { plan } = buildK2Plan('dag02', workflowId, k2Call);
    const ctx: Record<string, unknown> = { temporalAction: k1Temporal, temporalAlternativePlan: plan };

    await executeTool(k1Call, ctx);
    const selection = ctx.temporalAlternativeSelection as Record<string, any>;
    expect(selection).toBeTruthy();

    // Real selection object, but this scenario reports the downstream workflow
    // as having reached terminal failure (with an authoritative outcome
    // supplied) rather than forcing live infra to fail on command.
    const outcomeBoundary = await persistTemporalRecommendationOutcomeFromPostgres({
      selection,
      downstream_success: false,
      outcome: 'TEST_FAILED',
      evidence_refs: ['dag-live-proof:downstream-failed'],
      producer_revision: PRODUCER_REVISION,
    });
    seededRecommendationIds.push(outcomeBoundary.receipt.recommendation_id);

    expect(outcomeBoundary.append_receipt.inserted).toBe(true);
    expect(outcomeBoundary.receipt.downstream_success).toBe(false);
    expect(outcomeBoundary.receipt.outcome).toBe('TEST_FAILED');
  });

  it('DAG-03: with persist_outcome_receipt=false, the real langgraph-dag finalization path writes zero recommendation-outcome rows', async () => {
    const { runAgentDAG } = await import('$lib/server/ai/langgraph-dag.js');

    const k1Call = { tool: 'atlas_lookup', args: { query: `${RUN_ID}-dag03`, limit: 1 } };
    const k2Call = { tool: 'rg_search', args: { query: 'temporalActionChecksum', paths: ['src/lib/server/atlas/temporal'], limit: 5 } };

    const { workflowId, temporalContext: k1Temporal } = await seedFailedK1('dag03', k1Call);
    const { plan } = buildK2Plan('dag03', workflowId, k2Call);
    // Explicit: this scenario does NOT opt in to receipt persistence.
    expect(plan.persist_outcome_receipt).toBe(false);

    const ctx: Record<string, unknown> = {
      temporalAction: k1Temporal,
      temporalAlternativePlan: plan,
    };

    // shouldUseTool() forces the tool path only for graph|expand|neighbors
    // queries that don't also match search|find|rg; parseToolCall()'s
    // call:(\w+)(...) regex requires an underscore-style tool name (no dots).
    const query = `expand neighbors call:atlas_lookup(${JSON.stringify(k1Call.args)})`;

    const result = await runAgentDAG(query, ctx);
    expect(result.success).toBe(true);

    // ctx is mutated in place by the real node functions (same object
    // reference flows through LangGraph's channel reducers for `ctx`), so we
    // can inspect what the DAG actually did with it after the run.
    const selection = ctx.temporalAlternativeSelection as Record<string, any> | undefined;
    expect(selection).toBeTruthy();
    expect(ctx.temporalRecommendationOutcomePersisted).not.toBe(true);

    const recommendationId = selection!.package_selection.recommendation.recommendation_id as string;
    seededRecommendationIds.push(recommendationId);
    const rows = await pool.query(
      `SELECT count(*)::int AS count FROM atlas_recommendation_outcome_receipts WHERE recommendation_id = $1`,
      [recommendationId],
    );
    expect(rows.rows[0].count).toBe(0);
  });
});
