// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  buildActionExecutionKey,
  buildAgentActionEvent,
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
} from '@deeds/parent-atlas';
import {
  buildTemporalToolExecutionContext,
  type TemporalToolBoundaryDecisionV1,
} from './temporal-tool-execution-boundary.js';
import { selectTemporalAlternativeTool } from './temporal-action-alternative-boundary.js';

const H = temporalActionChecksum;

function descriptor(opcode: string, observedAt: string): Omit<ActionExecutionDescriptorV1, 'input_hash'> {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode,
    query_class: 'EXACT_SYMBOL',
    target: { canonical_id: `target:${opcode}`, resource: null, target_class: 'symbol' },
    implementation_revision: `${opcode}:v1`,
    parameter_revision: 'params:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: observedAt,
      valid_time: { from: null, to: null },
      workspace_revision: { value: 'W123', authority: 'PROVEN', evidence_refs: ['e:w'] },
      source_revision: { value: 'S517', authority: 'PROVEN', evidence_refs: ['e:s'] },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: H('frontier:v1'),
    },
  };
}

function alternative(input: {
  id: string;
  tool: string;
  opcode: string;
  args: Record<string, unknown>;
  structural: number;
  informationGain: number;
  cost: number;
}) {
  const call = { tool: input.tool, args: input.args };
  const temporal = buildTemporalToolExecutionContext({
    call,
    descriptor: descriptor(input.opcode, '2026-08-21T19:40:00.000Z'),
    retry_policy: {
      policy_revision: 'retry:v1',
      allow_transient_retry: false,
      max_retries: 0,
      retryable_outcomes: [],
    },
    producer_revision: 'alternative-test:v1',
  });
  return {
    candidate: {
      candidate_action_id: input.id,
      opcode: input.opcode,
      query_class: 'EXACT_SYMBOL',
      target_class: 'symbol',
      semantic_affinity: 0.7,
      structural_affinity: input.structural,
      query_class_affinity: 1,
      expected_information_gain: input.informationGain,
      execution_cost: input.cost,
      estimated_latency: input.cost,
      mutation_risk: 0,
      token_savings: input.opcode === 'SYNTHESIZE' ? 0 : 0.8,
      dependency_readiness: 1,
      downstream_utility: 0.8,
      latency_budget_ms: 1000,
      prior_failure_error_code: null,
      evidence_refs: [`candidate:${input.id}`],
      feature_revision: 'action-features:v1',
    },
    execution_key: buildActionExecutionKey(temporal.descriptor),
    call,
    temporal,
  };
}

function historyEvent(opcode: string, outcome: 'SUCCESS_EXACT' | 'NO_RESULT', sequence: number) {
  const call = opcode === 'RG_SEARCH'
    ? { tool: 'rg_search', args: { pattern: 'resolveCanonicalCandidateId' } }
    : { tool: 'synthesize', args: { query: 'answer now' } };
  const temporal = buildTemporalToolExecutionContext({
    call,
    descriptor: descriptor(opcode, `2026-08-21T19:41:${String(sequence).padStart(2, '0')}.000Z`),
    retry_policy: { policy_revision: 'retry:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: [] },
    producer_revision: 'history-test:v1',
  });
  return buildAgentActionEvent({
    event_id: `evt:${sequence}:${opcode}`,
    ledger_sequence: sequence,
    workflow_action: { workflow_id: 'wf:1', workflow_revision: 1, action_id: `A:${opcode}`, sequence },
    descriptor: temporal.descriptor,
    state: 'FINALIZED',
    outcome,
    result_ref: outcome === 'SUCCESS_EXACT' ? `cas:${opcode}:${sequence}` : null,
    error_code: outcome === 'NO_RESULT' ? 'NO_RESULT' : null,
    evidence_refs: [],
    artifact_refs: [],
    cost: { latency_ms: opcode === 'SYNTHESIZE' ? 1000 : 20, gpu_bytes: null, tokens: opcode === 'SYNTHESIZE' ? 300 : 0, tool_calls: 1 },
    observed_at: temporal.descriptor.applicability.observed_at,
    producer_revision: 'history-test:v1',
  });
}

function failedBoundary(executionKey: string): TemporalToolBoundaryDecisionV1 {
  const raw = {
    schema: 'atlas.temporal-tool-boundary-decision.v1' as const,
    execution_key: executionKey,
    tool: 'search.hybrid',
    disposition: 'SELECT_ALTERNATIVE' as const,
    reused_result_ref: null,
    prior_event_id: 'evt:failed',
    lookup_event_count: 1,
    reuse_decision: 'HIT' as const,
    reason: 'EXACT_FAILURE_DO_NOT_REPEAT',
  };
  return { ...raw, boundary_checksum: H(raw) };
}

describe('temporal action alternative boundary', () => {
  it('maps the package recommendation back to the concrete evidence-first tool call', () => {
    const failedKey = H('failed:qdrant');
    const rg = alternative({ id: 'candidate:rg', tool: 'rg_search', opcode: 'RG_SEARCH', args: { pattern: 'resolveCanonicalCandidateId' }, structural: 0.95, informationGain: 0.95, cost: 0.05 });
    const synth = alternative({ id: 'candidate:synth', tool: 'terminal', opcode: 'SYNTHESIZE', args: { command: 'echo synth' }, structural: 0.2, informationGain: 0.2, cost: 0.9 });

    const result = selectTemporalAlternativeTool({
      failed_boundary: failedBoundary(failedKey),
      plan: {
        workflow_id: 'wf:1',
        workflow_revision: 1,
        candidates: [synth, rg],
        history_scope: 'WORKFLOW',
        created_at: '2026-08-21T19:45:00.000Z',
        producer_revision: 'alternative-test:v1',
      },
      history_events: [
        historyEvent('RG_SEARCH', 'SUCCESS_EXACT', 1),
        historyEvent('RG_SEARCH', 'SUCCESS_EXACT', 2),
        historyEvent('SYNTHESIZE', 'NO_RESULT', 3),
      ],
    });

    expect(result.selected_candidate_action_id).toBe('candidate:rg');
    expect(result.selected_call).toEqual(rg.call);
    expect(result.selected_temporal).toEqual(rg.temporal);
    expect(result.selected_execution_key).not.toBe(failedKey);
  });

  it('rejects a candidate whose declared execution key does not match its temporal descriptor', () => {
    const rg = alternative({ id: 'candidate:rg', tool: 'rg_search', opcode: 'RG_SEARCH', args: { pattern: 'x' }, structural: 1, informationGain: 1, cost: 0 });
    expect(() => selectTemporalAlternativeTool({
      failed_boundary: failedBoundary(H('failed')),
      plan: {
        workflow_id: 'wf:1', workflow_revision: 1,
        candidates: [{ ...rg, execution_key: H('wrong') }],
        created_at: '2026-08-21T19:46:00.000Z', producer_revision: 'alternative-test:v1',
      },
      history_events: [],
    })).toThrow('TEMPORAL_ALTERNATIVE_EXECUTION_KEY_MISMATCH');
  });

  it('rejects a concrete call whose args no longer match the temporal input hash', () => {
    const rg = alternative({ id: 'candidate:rg', tool: 'rg_search', opcode: 'RG_SEARCH', args: { pattern: 'x' }, structural: 1, informationGain: 1, cost: 0 });
    expect(() => selectTemporalAlternativeTool({
      failed_boundary: failedBoundary(H('failed')),
      plan: {
        workflow_id: 'wf:1', workflow_revision: 1,
        candidates: [{ ...rg, call: { ...rg.call, args: { pattern: 'changed' } } }],
        created_at: '2026-08-21T19:47:00.000Z', producer_revision: 'alternative-test:v1',
      },
      history_events: [],
    })).toThrow('TEMPORAL_ALTERNATIVE_INPUT_HASH_MISMATCH');
  });

  it('requires an actual SELECT_ALTERNATIVE boundary disposition', () => {
    const rg = alternative({ id: 'candidate:rg', tool: 'rg_search', opcode: 'RG_SEARCH', args: { pattern: 'x' }, structural: 1, informationGain: 1, cost: 0 });
    const boundary = { ...failedBoundary(H('failed')), disposition: 'REUSE_RESULT' as const, reused_result_ref: 'cas:old' };
    expect(() => selectTemporalAlternativeTool({
      failed_boundary: boundary,
      plan: {
        workflow_id: 'wf:1', workflow_revision: 1, candidates: [rg],
        created_at: '2026-08-21T19:48:00.000Z', producer_revision: 'alternative-test:v1',
      },
      history_events: [],
    })).toThrow('TEMPORAL_ALTERNATIVE_REQUIRES_SELECT_ALTERNATIVE');
  });
});
