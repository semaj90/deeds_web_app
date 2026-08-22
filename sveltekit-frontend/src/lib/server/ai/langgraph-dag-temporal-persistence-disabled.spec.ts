// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildActionExecutionKey,
  buildAgentActionEvent,
  decideExecutionReuse,
  projectActionCurrent,
  temporalActionChecksum,
  type AgentActionEventV1,
} from '@deeds/parent-atlas';
import { buildTemporalToolExecutionContext } from '../atlas/temporal/temporal-tool-execution-boundary.js';

const proof = vi.hoisted(() => ({
  history: [] as AgentActionEventV1[],
  dispatched: [] as Array<{ tool: string; args: unknown }>,
  persistenceCalls: 0,
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
      return { ...raw, boundary_checksum: temporalActionChecksum(raw) };
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
        history_receipt_ref: 'fixture:history:persistence-disabled',
      })),
  };
});

vi.mock('../atlas/temporal/temporal-recommendation-outcome-boundary.js', async () => {
  const actual = await vi.importActual<any>('../atlas/temporal/temporal-recommendation-outcome-boundary.js');
  return {
    ...actual,
    persistTemporalRecommendationOutcomeFromPostgres: vi.fn(async () => {
      proof.persistenceCalls += 1;
      throw new Error('PERSISTENCE_MUST_NOT_BE_CALLED_WHEN_DISABLED');
    }),
  };
});

vi.mock('./mcp-tool-dispatch.js', () => ({
  tool_codebase_rg_search: vi.fn(async (args: unknown) => {
    proof.dispatched.push({ tool: 'rg_search', args });
    return { tool: 'rg_search', success: true, data: { matches: ['fixture-hit'] } };
  }),
  tool_graph_expand_neighborhood: vi.fn(),
  tool_search_hybrid: vi.fn(async (args: unknown) => {
    proof.dispatched.push({ tool: 'atlas_lookup', args });
    return { tool: 'search.hybrid', success: true, data: { forbidden: true } };
  }),
}));

function descriptor(opcode: string, target: string) {
  return {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode,
    query_class: 'fixture',
    target: { canonical_id: target, resource: null, target_class: 'fixture-target' },
    implementation_revision: 'impl:fixture:v1',
    parameter_revision: 'params:fixture:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1' as const,
      observed_at: '2026-08-21T23:40:00.000Z',
      valid_time: { from: null, to: null },
      workspace_revision: { value: 'workspace:fixture:1', authority: 'PROVEN' as const, evidence_refs: ['fixture:workspace'] },
      source_revision: { value: 'source:fixture:1', authority: 'PROVEN' as const, evidence_refs: ['fixture:source'] },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'] as const,
      evidence_frontier_hash: 'f'.repeat(64),
    },
  };
}

function buildFixture() {
  const k1Call = { tool: 'atlas_lookup', args: { query: 'fixture-persistence-disabled' } };
  const k2Call = { tool: 'rg_search', args: { pattern: 'fixture-persistence-disabled' } };
  const k1 = buildTemporalToolExecutionContext({
    call: k1Call,
    descriptor: descriptor('QDRANT_SEARCH', 'target:persistence-disabled') as any,
    retry_policy: { policy_revision: 'retry:fixture:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] },
    producer_revision: 'dag-proof:v1',
  });
  const k2 = buildTemporalToolExecutionContext({
    call: k2Call,
    descriptor: descriptor('RG_SEARCH', 'target:persistence-disabled') as any,
    retry_policy: { policy_revision: 'retry:fixture:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] },
    producer_revision: 'dag-proof:v1',
  });
  const k1Key = buildActionExecutionKey(k1.descriptor);
  const k2Key = buildActionExecutionKey(k2.descriptor);
  const failed = buildAgentActionEvent({
    event_id: 'fixture:persistence-disabled:k1:failed',
    ledger_sequence: 1,
    workflow_action: { workflow_id: 'wf:persistence-disabled', workflow_revision: 1, action_id: 'action:k1', sequence: 1 },
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
    workflow_id: 'wf:persistence-disabled',
    workflow_revision: 1,
    candidates: [{
      candidate: {
        candidate_action_id: 'candidate:persistence-disabled:rg',
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
    persist_outcome_receipt: false,
    created_at: '2026-08-21T23:40:30.000Z',
    producer_revision: 'dag-proof:v1',
  };
  return { k1Call, k2Call, k1Key, k2Key, k1, failed, plan };
}

beforeEach(() => {
  proof.history.length = 0;
  proof.dispatched.length = 0;
  proof.persistenceCalls = 0;
});

describe('LangGraph temporal recommendation persistence negative control', () => {
  it('executes selected K2 but performs zero outcome-receipt persistence when disabled', async () => {
    const fixture = buildFixture();
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
    expect(proof.dispatched.filter((entry) => entry.tool === 'atlas_lookup')).toHaveLength(0);
    expect(proof.dispatched).toEqual([{ tool: 'rg_search', args: fixture.k2Call.args }]);
    expect(ctx.temporalAlternativeSelection.failed_execution_key).toBe(fixture.k1Key);
    expect(ctx.temporalAlternativeSelection.selected_execution_key).toBe(fixture.k2Key);
    expect(proof.persistenceCalls).toBe(0);
    expect(ctx.temporalRecommendationOutcome).toBeUndefined();
    expect(ctx.temporalRecommendationOutcomePersisted).not.toBe(true);
  });
});
