// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildActionExecutionKey,
  buildAgentActionEvent,
  buildFinalRecommendationOutcomeReceipt,
  decideExecutionReuse,
  projectActionCurrent,
  temporalActionChecksum,
  type AgentActionEventV1,
} from '@deeds/parent-atlas';
import { buildTemporalToolExecutionContext } from '../atlas/temporal/temporal-tool-execution-boundary.js';
import { selectTemporalAlternativeTool } from '../atlas/temporal/temporal-action-alternative-boundary.js';

const proof = vi.hoisted(() => ({
  history: [] as AgentActionEventV1[],
  boundaryCalls: [] as string[],
  dispatched: [] as Array<{ tool: string; args: unknown }>,
  receipts: [] as any[],
  k2Success: true,
}));

vi.mock('../cache/valkey-client.js', () => ({
  getValkeyClient: () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
  }),
}));

vi.mock('./auto-fix.js', () => ({ suggestFix: vi.fn(async () => 'fixture-fix') }));
vi.mock('./ace-builder.js', () => ({
  buildACEPacket: vi.fn(async () => ({ fixture: true })),
  injectACETableCache: vi.fn(async () => undefined),
}));
vi.mock('./learning-loop.js', () => ({
  recordExecutionOutcome: vi.fn(async () => undefined),
  mutatePromptWithLearnings: vi.fn(async (query: string) => query),
}));
vi.mock('../observability/synthesis-logger.js', () => ({ logSynthesisRun: vi.fn(async () => undefined) }));
vi.mock('./engram-registry.js', () => ({ reinforceEngramPath: vi.fn(async () => undefined) }));

vi.mock('../atlas/temporal/temporal-tool-execution-boundary.js', async () => {
  const actual = await vi.importActual<any>('../atlas/temporal/temporal-tool-execution-boundary.js');
  return {
    ...actual,
    decideTemporalToolExecutionFromPostgres: vi.fn(async ({ call, temporal }: any) => {
      proof.boundaryCalls.push(call.tool);
      const executionKey = buildActionExecutionKey(temporal.descriptor);
      const events = proof.history.filter((event) => event.execution_key === executionKey);
      const current = events.length ? projectActionCurrent(events) : null;
      const decision = decideExecutionReuse({
        descriptor: temporal.descriptor,
        current,
        retry_policy: temporal.retry_policy,
        producer_revision: temporal.producer_revision,
      });
      const disposition = decision.disposition === 'REUSE_RESULT'
        ? 'REUSE_RESULT'
        : decision.disposition === 'SELECT_ALTERNATIVE'
          ? 'SELECT_ALTERNATIVE'
          : decision.disposition === 'RETRY_PROPOSED'
            ? 'DISPATCH_RETRY'
            : decision.disposition === 'RECOMPUTE_AFTER_INVALIDATION'
              ? 'DISPATCH_RECOMPUTE'
              : 'DISPATCH_EXECUTE';
      const raw = {
        schema: 'atlas.temporal-tool-boundary-decision.v1' as const,
        execution_key: executionKey,
        tool: call.tool,
        disposition,
        reused_result_ref: decision.reused_result_ref,
        prior_event_id: decision.prior_event_id,
        lookup_event_count: events.length,
        reuse_decision: decision.decision,
        reason: decision.reason,
      };
      return {
        ...raw,
        boundary_checksum: temporalActionChecksum(raw),
      };
    }),
  };
});

vi.mock('../atlas/temporal/temporal-action-alternative-boundary.js', async () => {
  const actual = await vi.importActual<any>('../atlas/temporal/temporal-action-alternative-boundary.js');
  return {
    ...actual,
    selectTemporalAlternativeToolFromPostgres: vi.fn(async ({ failed_boundary, plan }: any) =>
      actual.selectTemporalAlternativeTool({
        failed_boundary,
        plan,
        history_events: proof.history,
        history_receipt_ref: 'fixture:history',
      })),
  };
});

vi.mock('../atlas/temporal/temporal-recommendation-outcome-boundary.js', async () => {
  const actual = await vi.importActual<any>('../atlas/temporal/temporal-recommendation-outcome-boundary.js');
  return {
    ...actual,
    persistTemporalRecommendationOutcomeFromPostgres: vi.fn(async (input: any) => {
      const recommendation = input.selection.package_selection.recommendation;
      const receipt = buildFinalRecommendationOutcomeReceipt({
        recommendation,
        selected_action_id: input.selection.selected_candidate_action_id,
        resulting_execution_key: input.selection.selected_execution_key,
        downstream_success: input.downstream_success,
        outcome: input.outcome ?? null,
        evidence_refs: input.evidence_refs ?? [],
        observed_at: '2026-08-21T23:30:00.000Z',
        producer_revision: input.producer_revision,
      });
      proof.receipts.push(receipt);
      return { receipt, receipt_checksum: temporalActionChecksum(receipt), append_receipt: null };
    }),
  };
});

vi.mock('./mcp-tool-dispatch.js', () => ({
  tool_codebase_rg_search: vi.fn(async (args: unknown) => {
    proof.dispatched.push({ tool: 'rg_search', args });
    return proof.k2Success
      ? { tool: 'rg_search', success: true, data: { matches: ['fixture-hit'] } }
      : { tool: 'rg_search', success: false, data: null, error: 'fixture-k2-failure' };
  }),
  tool_graph_expand_neighborhood: vi.fn(),
  tool_search_hybrid: vi.fn(async (args: unknown) => {
    proof.dispatched.push({ tool: 'atlas_lookup', args });
    return { tool: 'search.hybrid', success: true, data: { forbidden: true } };
  }),
}));

function descriptor(opcode: string, target: string, inputHash: string) {
  return {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode,
    query_class: 'fixture',
    target: { canonical_id: target, resource: null, target_class: 'fixture-target' },
    input_hash: inputHash,
    implementation_revision: 'impl:fixture:v1',
    parameter_revision: 'params:fixture:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1' as const,
      observed_at: '2026-08-21T23:29:00.000Z',
      valid_time: { from: null, to: null },
      workspace_revision: { value: 'workspace:fixture:1', authority: 'PROVEN' as const, evidence_refs: ['fixture:workspace'] },
      source_revision: { value: 'source:fixture:1', authority: 'PROVEN' as const, evidence_refs: ['fixture:source'] },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'] as const,
      evidence_frontier_hash: 'e'.repeat(64),
    },
  };
}

function buildFixture(run: string) {
  const k1Call = { tool: 'atlas_lookup', args: { query: `fixture-${run}` } };
  const k2Call = { tool: 'rg_search', args: { pattern: `fixture-${run}` } };
  const k1 = buildTemporalToolExecutionContext({
    call: k1Call,
    descriptor: descriptor('QDRANT_SEARCH', `target:${run}`, temporalActionChecksum(k1Call)) as any,
    retry_policy: { policy_revision: 'retry:fixture:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] },
    producer_revision: 'dag-proof:v1',
  });
  const k2 = buildTemporalToolExecutionContext({
    call: k2Call,
    descriptor: descriptor('RG_SEARCH', `target:${run}`, temporalActionChecksum(k2Call)) as any,
    retry_policy: { policy_revision: 'retry:fixture:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] },
    producer_revision: 'dag-proof:v1',
  });
  const k1Key = buildActionExecutionKey(k1.descriptor);
  const k2Key = buildActionExecutionKey(k2.descriptor);
  const failed = buildAgentActionEvent({
    event_id: `fixture:${run}:k1:failed`,
    ledger_sequence: 1,
    workflow_action: { workflow_id: `wf:${run}`, workflow_revision: 1, action_id: `action:${run}:k1`, sequence: 1 },
    descriptor: k1.descriptor,
    state: 'FINALIZED',
    outcome: 'TOOL_ERROR',
    result_ref: null,
    error_code: 'FIXTURE_K1_FAILED',
    evidence_refs: ['fixture:k1'],
    artifact_refs: [],
    cost: { latency_ms: 1, gpu_bytes: null, tokens: null, tool_calls: 1 },
    observed_at: k1.descriptor.applicability.observed_at,
    producer_revision: 'dag-proof:v1',
  });
  const plan = {
    schema: 'atlas.temporal-alternative-plan.v1' as const,
    workflow_id: `wf:${run}`,
    workflow_revision: 1,
    candidates: [{
      candidate: {
        candidate_action_id: `candidate:${run}:rg`,
        opcode: 'RG_SEARCH',
        query_class: 'fixture',
        target_class: 'fixture-target',
        semantic_affinity: 1,
        structural_affinity: 1,
        query_class_affinity: 1,
        expected_information_gain: 1,
        execution_cost: 0.1,
        estimated_latency: 0.1,
        mutation_risk: 0,
        token_savings: 1,
        dependency_readiness: 1,
        downstream_utility: 1,
        latency_budget_ms: 5000,
        prior_failure_error_code: null,
        evidence_refs: ['fixture:k2'],
        feature_revision: 'features:fixture:v1',
      },
      execution_key: k2Key,
      call: k2Call,
      temporal: k2,
    }],
    history_limit: 32,
    history_scope: 'WORKFLOW' as const,
    excluded_execution_keys: [],
    persist_outcome_receipt: true,
    created_at: '2026-08-21T23:29:30.000Z',
    producer_revision: 'dag-proof:v1',
  };
  return { k1Call, k2Call, k1, k2, k1Key, k2Key, failed, plan };
}

beforeEach(() => {
  proof.history.length = 0;
  proof.boundaryCalls.length = 0;
  proof.dispatched.length = 0;
  proof.receipts.length = 0;
  proof.k2Success = true;
});

describe('LangGraph temporal known-failure -> alternative -> outcome proof', () => {
  it('does not redispatch K1 and records downstream success for deterministic K2', async () => {
    const fixture = buildFixture('success');
    proof.history.push(fixture.failed);
    const ctx: any = {
      strategy: 'default',
      temporalAction: fixture.k1,
      temporalAlternativePlan: fixture.plan,
      temporalAuthoritativeActionOutcome: null,
    };
    const { runAgentDAG } = await import('./langgraph-dag.js');
    const result = await runAgentDAG(`graph call:atlas_lookup(${JSON.stringify(fixture.k1Call.args)})`, ctx);

    expect(result.success).toBe(true);
    expect(proof.boundaryCalls).toEqual(['atlas_lookup', 'rg_search']);
    expect(proof.dispatched).toEqual([{ tool: 'rg_search', args: fixture.k2Call.args }]);
    expect(ctx.temporalAlternativeSelection.failed_execution_key).toBe(fixture.k1Key);
    expect(ctx.temporalAlternativeSelection.selected_execution_key).toBe(fixture.k2Key);
    expect(proof.receipts).toHaveLength(1);
    expect(proof.receipts[0]).toMatchObject({
      recommendation_id: ctx.temporalAlternativeSelection.package_selection.recommendation.recommendation_id,
      selected_action_id: `candidate:success:rg`,
      resulting_execution_key: fixture.k2Key,
      followed_recommendation: true,
      downstream_success: true,
      outcome: null,
    });
  });

  it('records terminal downstream failure without redispatching K1', async () => {
    const fixture = buildFixture('failure');
    proof.history.push(fixture.failed);
    proof.k2Success = false;
    const ctx: any = {
      strategy: 'default',
      temporalAction: fixture.k1,
      temporalAlternativePlan: fixture.plan,
      temporalAuthoritativeActionOutcome: null,
    };
    const { runAgentDAG } = await import('./langgraph-dag.js');
    const result = await runAgentDAG(`graph call:atlas_lookup(${JSON.stringify(fixture.k1Call.args)})`, ctx);

    expect(result.success).toBe(false);
    expect(proof.dispatched.filter((entry) => entry.tool === 'atlas_lookup')).toHaveLength(0);
    expect(proof.dispatched.filter((entry) => entry.tool === 'rg_search')).toHaveLength(1);
    expect(proof.receipts).toHaveLength(1);
    expect(proof.receipts[0]).toMatchObject({
      selected_action_id: `candidate:failure:rg`,
      resulting_execution_key: fixture.k2Key,
      downstream_success: false,
      outcome: null,
    });
  });

  it('executes K2 but attempts no recommendation persistence when persist_outcome_receipt=false', async () => {
    const fixture = buildFixture('no-persist');
    proof.history.push(fixture.failed);
    const ctx: any = {
      strategy: 'default',
      temporalAction: fixture.k1,
      temporalAlternativePlan: {
        ...fixture.plan,
        persist_outcome_receipt: false,
      },
      temporalAuthoritativeActionOutcome: null,
    };
    const { runAgentDAG } = await import('./langgraph-dag.js');
    const result = await runAgentDAG(`graph call:atlas_lookup(${JSON.stringify(fixture.k1Call.args)})`, ctx);

    expect(result.success).toBe(true);
    expect(proof.boundaryCalls).toEqual(['atlas_lookup', 'rg_search']);
    expect(proof.dispatched.filter((entry) => entry.tool === 'atlas_lookup')).toHaveLength(0);
    expect(proof.dispatched.filter((entry) => entry.tool === 'rg_search')).toHaveLength(1);
    expect(proof.receipts).toHaveLength(0);
  });
});
