import { describe, expect, it } from 'vitest';
import {
  buildAgentActionEvent,
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
} from './temporal-action-ledger.js';
import {
  aggregateHistoricalActions,
  compileActionFeatureRowFromHistory,
  compileOpenSpecActionLink,
  recommendNextActionsDeterministic,
} from './temporal-action-recommendation-runtime.js';

const H = temporalActionChecksum;

function descriptor(input: { opcode: string; queryClass?: string; targetClass?: string; observedAt?: string }): ActionExecutionDescriptorV1 {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode: input.opcode,
    query_class: input.queryClass ?? 'EXACT_SYMBOL',
    target: { canonical_id: `target:${input.opcode}`, resource: null, target_class: input.targetClass ?? 'symbol' },
    input_hash: H(`input:${input.opcode}`),
    implementation_revision: `${input.opcode}:v1`,
    parameter_revision: 'params:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: input.observedAt ?? '2026-08-21T12:00:00.000Z',
      valid_time: { from: null, to: null },
      workspace_revision: { value: 'W123', authority: 'PROVEN', evidence_refs: ['e:w'] },
      source_revision: { value: 'S517', authority: 'PROVEN', evidence_refs: ['e:s'] },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: H('frontier:v1'),
    },
  };
}

function event(input: { opcode: string; outcome: 'SUCCESS_EXACT' | 'NO_RESULT' | 'TOOL_ERROR' | 'CACHE_HIT'; sequence: number; errorCode?: string | null }) {
  const d = descriptor({ opcode: input.opcode, observedAt: `2026-08-21T12:00:${String(input.sequence).padStart(2, '0')}.000Z` });
  return buildAgentActionEvent({
    event_id: `evt:${input.sequence}:${input.opcode}`,
    ledger_sequence: input.sequence,
    workflow_action: { workflow_id: 'wf:1', workflow_revision: 1, action_id: `A:${input.opcode}`, sequence: input.sequence },
    descriptor: d,
    state: 'FINALIZED',
    outcome: input.outcome,
    result_ref: input.outcome === 'SUCCESS_EXACT' || input.outcome === 'CACHE_HIT' ? `cas:${input.opcode}:${input.sequence}` : null,
    error_code: input.errorCode ?? (input.outcome === 'TOOL_ERROR' ? 'QDRANT_TIMEOUT' : null),
    evidence_refs: [`e:${input.sequence}`],
    artifact_refs: [],
    cost: { latency_ms: input.opcode === 'SYNTHESIZE' ? 1200 : 20, gpu_bytes: null, tokens: input.opcode === 'SYNTHESIZE' ? 400 : 0, tool_calls: 1 },
    observed_at: d.applicability.observed_at,
    producer_revision: 'test:v1',
  });
}

describe('temporal action recommendation runtime', () => {
  it('aggregates finalized history deterministically', () => {
    const events = [
      event({ opcode: 'RG_SEARCH', outcome: 'SUCCESS_EXACT', sequence: 1 }),
      event({ opcode: 'RG_SEARCH', outcome: 'NO_RESULT', sequence: 2 }),
      event({ opcode: 'RG_SEARCH', outcome: 'CACHE_HIT', sequence: 3 }),
    ];
    const aggregate = aggregateHistoricalActions({ events, opcode: 'RG_SEARCH', query_class: 'EXACT_SYMBOL', target_class: 'symbol' });
    expect(aggregate.finalized_attempts).toBe(3);
    expect(aggregate.success_count).toBe(2);
    expect(aggregate.cache_hit_count).toBe(1);
    expect(aggregate.historical_success_rate).toBeCloseTo(2 / 3);
    expect(aggregate.cache_hit_probability).toBeCloseTo(1 / 3);
    expect(aggregate.aggregate_checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('compiles historical failures into action features', () => {
    const events = [event({ opcode: 'QDRANT_SEARCH', outcome: 'TOOL_ERROR', sequence: 1, errorCode: 'QDRANT_TIMEOUT' })];
    const row = compileActionFeatureRowFromHistory({
      events,
      candidate: {
        candidate_action_id: 'candidate:qdrant',
        opcode: 'QDRANT_SEARCH',
        query_class: 'EXACT_SYMBOL',
        target_class: 'symbol',
        semantic_affinity: 0.9,
        structural_affinity: 0.2,
        query_class_affinity: 0.8,
        expected_information_gain: 0.4,
        execution_cost: 0.3,
        estimated_latency: 0.2,
        mutation_risk: 0,
        token_savings: 0.2,
        dependency_readiness: 1,
        downstream_utility: 0.5,
        latency_budget_ms: 1000,
        prior_failure_error_code: 'QDRANT_TIMEOUT',
        evidence_refs: ['e:candidate'],
        feature_revision: 'action-features:v1',
      },
    });
    expect(row.historical_success_rate).toBe(0);
    expect(row.last_failure_similarity).toBe(1);
    expect(row.evidence_refs).toContain('evt:1:QDRANT_SEARCH');
  });

  it('ranks cheap high-information structural evidence ahead of early synthesis', () => {
    const rg = compileActionFeatureRowFromHistory({
      events: [event({ opcode: 'RG_SEARCH', outcome: 'SUCCESS_EXACT', sequence: 1 })],
      candidate: {
        candidate_action_id: 'candidate:rg', opcode: 'RG_SEARCH', query_class: 'EXACT_SYMBOL', target_class: 'symbol',
        semantic_affinity: 0.7, structural_affinity: 0.95, query_class_affinity: 1, expected_information_gain: 0.95,
        execution_cost: 0.05, estimated_latency: 0.05, mutation_risk: 0, token_savings: 0.9, dependency_readiness: 1,
        downstream_utility: 0.8, latency_budget_ms: 1000, prior_failure_error_code: null, evidence_refs: [], feature_revision: 'action-features:v1',
      },
    });
    const synth = compileActionFeatureRowFromHistory({
      events: [event({ opcode: 'SYNTHESIZE', outcome: 'NO_RESULT', sequence: 2 })],
      candidate: {
        candidate_action_id: 'candidate:synth', opcode: 'SYNTHESIZE', query_class: 'EXACT_SYMBOL', target_class: 'symbol',
        semantic_affinity: 0.8, structural_affinity: 0.2, query_class_affinity: 0.5, expected_information_gain: 0.2,
        execution_cost: 0.9, estimated_latency: 0.9, mutation_risk: 0.1, token_savings: 0, dependency_readiness: 0.4,
        downstream_utility: 0.4, latency_budget_ms: 1000, prior_failure_error_code: null, evidence_refs: [], feature_revision: 'action-features:v1',
      },
    });
    const rec = recommendNextActionsDeterministic({
      workflow_id: 'wf:1', workflow_revision: 1, rows: [synth, rg], created_at: '2026-08-21T12:10:00.000Z', producer_revision: 'recommend:v1',
    });
    expect(rec.candidates[0]?.candidate_action_id).toBe('candidate:rg');
    expect(rec.policy_family).toBe('DETERMINISTIC_FULL_SCAN');
  });

  it('links successful events as VERIFIED_BY and failed events as FAILED_BY only', () => {
    const success = event({ opcode: 'RUN_TEST', outcome: 'SUCCESS_EXACT', sequence: 1 });
    const failure = event({ opcode: 'RUN_TEST', outcome: 'TOOL_ERROR', sequence: 2 });
    const verified = compileOpenSpecActionLink({ change_id: 'change:1', task_id: 'TASK-01', task_revision: 'r3', relation: 'VERIFIED_BY', event: success, producer_revision: 'link:v1' });
    expect(verified.action_id).toBe('A:RUN_TEST');
    expect(() => compileOpenSpecActionLink({ change_id: 'change:1', task_id: 'TASK-01', task_revision: 'r3', relation: 'VERIFIED_BY', event: failure, producer_revision: 'link:v1' })).toThrow('OPENSPEC_ACTION_RELATION_INVALID');
    const failed = compileOpenSpecActionLink({ change_id: 'change:1', task_id: 'TASK-01', task_revision: 'r3', relation: 'FAILED_BY', event: failure, producer_revision: 'link:v1' });
    expect(failed.evidence_refs).toContain(failure.event_id);
  });

  it('rejects tampered historical events before aggregation', () => {
    const good = event({ opcode: 'RG_SEARCH', outcome: 'SUCCESS_EXACT', sequence: 1 });
    const tampered = { ...good, producer_revision: 'tampered:v9' };
    expect(() => aggregateHistoricalActions({ events: [tampered], opcode: 'RG_SEARCH', query_class: 'EXACT_SYMBOL', target_class: 'symbol' })).toThrow('ACTION_EVENT_CHECKSUM_MISMATCH');
  });
});
