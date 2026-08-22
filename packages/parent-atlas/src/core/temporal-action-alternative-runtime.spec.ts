import { describe, expect, it } from 'vitest';

import {
  buildAgentActionEvent,
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
} from './temporal-action-ledger.js';
import { recommendAlternativeActionFromHistory } from './temporal-action-alternative-runtime.js';

const H = temporalActionChecksum;

function descriptor(opcode: string, sequence: number): ActionExecutionDescriptorV1 {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode,
    query_class: 'EXACT_SYMBOL',
    target: { canonical_id: `target:${opcode}`, resource: null, target_class: 'symbol' },
    input_hash: H(`input:${opcode}`),
    implementation_revision: `${opcode}:v1`,
    parameter_revision: 'params:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: `2026-08-21T19:30:${String(sequence).padStart(2, '0')}.000Z`,
      valid_time: { from: null, to: null },
      workspace_revision: { value: 'W123', authority: 'PROVEN', evidence_refs: ['e:w'] },
      source_revision: { value: 'S517', authority: 'PROVEN', evidence_refs: ['e:s'] },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: H('frontier:v1'),
    },
  };
}

function event(input: {
  opcode: string;
  outcome: 'SUCCESS_EXACT' | 'NO_RESULT' | 'TOOL_ERROR';
  sequence: number;
  errorCode?: string | null;
}) {
  const d = descriptor(input.opcode, input.sequence);
  return buildAgentActionEvent({
    event_id: `evt:${input.sequence}:${input.opcode}`,
    ledger_sequence: input.sequence,
    workflow_action: {
      workflow_id: 'wf:1',
      workflow_revision: 1,
      action_id: `A:${input.opcode}`,
      sequence: input.sequence,
    },
    descriptor: d,
    state: 'FINALIZED',
    outcome: input.outcome,
    result_ref: input.outcome === 'SUCCESS_EXACT' ? `cas:${input.opcode}:${input.sequence}` : null,
    error_code: input.errorCode ?? (input.outcome === 'TOOL_ERROR' ? 'TOOL_TIMEOUT' : null),
    evidence_refs: [`e:${input.sequence}`],
    artifact_refs: [],
    cost: {
      latency_ms: input.opcode === 'SYNTHESIZE' ? 1000 : 20,
      gpu_bytes: null,
      tokens: input.opcode === 'SYNTHESIZE' ? 300 : 0,
      tool_calls: 1,
    },
    observed_at: d.applicability.observed_at,
    producer_revision: 'test:v1',
  });
}

function candidate(input: {
  id: string;
  opcode: string;
  executionKey: string;
  structural: number;
  informationGain: number;
  cost: number;
  latency: number;
  priorFailure?: string | null;
}) {
  return {
    execution_key: input.executionKey,
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
      estimated_latency: input.latency,
      mutation_risk: 0,
      token_savings: input.opcode === 'SYNTHESIZE' ? 0 : 0.8,
      dependency_readiness: 1,
      downstream_utility: 0.8,
      latency_budget_ms: 1000,
      prior_failure_error_code: input.priorFailure ?? null,
      evidence_refs: [`candidate:${input.id}`] as string[],
      feature_revision: 'action-features:v1',
    },
  };
}

describe('temporal alternative action runtime', () => {
  it('hard-excludes the exact failed execution key even when its features would otherwise win', () => {
    const failedKey = H('failed-exact-key');
    const selection = recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: failedKey,
      candidates: [
        candidate({ id: 'candidate:failed-again', opcode: 'QDRANT_SEARCH', executionKey: failedKey, structural: 1, informationGain: 1, cost: 0, latency: 0 }),
        candidate({ id: 'candidate:rg', opcode: 'RG_SEARCH', executionKey: H('rg-key'), structural: 0.9, informationGain: 0.9, cost: 0.05, latency: 0.05 }),
      ],
      events: [event({ opcode: 'QDRANT_SEARCH', outcome: 'TOOL_ERROR', sequence: 1, errorCode: 'QDRANT_TIMEOUT' })],
      created_at: '2026-08-21T19:35:00.000Z',
      producer_revision: 'alternative:v1',
    });

    expect(selection.selected_candidate_action_id).toBe('candidate:rg');
    expect(selection.selected_execution_key).toBe(H('rg-key'));
    expect(selection.excluded_execution_keys).toContain(failedKey);
    expect(selection.recommendation.candidates.some((candidate) => candidate.execution_key === failedKey)).toBe(false);
  });

  it('uses checksum-verified history to rank evidence-first alternatives ahead of synthesis', () => {
    const selection = recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: H('qdrant-failed-key'),
      candidates: [
        candidate({ id: 'candidate:rg', opcode: 'RG_SEARCH', executionKey: H('rg-key'), structural: 0.95, informationGain: 0.95, cost: 0.05, latency: 0.05 }),
        candidate({ id: 'candidate:synth', opcode: 'SYNTHESIZE', executionKey: H('synth-key'), structural: 0.2, informationGain: 0.2, cost: 0.9, latency: 0.9 }),
      ],
      events: [
        event({ opcode: 'RG_SEARCH', outcome: 'SUCCESS_EXACT', sequence: 1 }),
        event({ opcode: 'RG_SEARCH', outcome: 'SUCCESS_EXACT', sequence: 2 }),
        event({ opcode: 'SYNTHESIZE', outcome: 'NO_RESULT', sequence: 3 }),
      ],
      created_at: '2026-08-21T19:36:00.000Z',
      producer_revision: 'alternative:v1',
    });

    expect(selection.selected_candidate_action_id).toBe('candidate:rg');
    expect(selection.recommendation.policy_family).toBe('DETERMINISTIC_FULL_SCAN');
    expect(selection.selection_checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects tampered history instead of using it as procedural evidence', () => {
    const good = event({ opcode: 'RG_SEARCH', outcome: 'SUCCESS_EXACT', sequence: 1 });
    const tampered = { ...good, producer_revision: 'tampered:v9' };
    expect(() => recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: H('failed-key'),
      candidates: [candidate({ id: 'candidate:rg', opcode: 'RG_SEARCH', executionKey: H('rg-key'), structural: 0.9, informationGain: 0.9, cost: 0.1, latency: 0.1 })],
      events: [tampered],
      created_at: '2026-08-21T19:37:00.000Z',
      producer_revision: 'alternative:v1',
    })).toThrow('ACTION_EVENT_CHECKSUM_MISMATCH');
  });

  it('fails closed when every candidate is excluded', () => {
    const failedKey = H('only-key');
    expect(() => recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: failedKey,
      candidates: [candidate({ id: 'candidate:same', opcode: 'RG_SEARCH', executionKey: failedKey, structural: 1, informationGain: 1, cost: 0, latency: 0 })],
      events: [],
      created_at: '2026-08-21T19:38:00.000Z',
      producer_revision: 'alternative:v1',
    })).toThrow('ACTION_ALTERNATIVE_CANDIDATES_EXHAUSTED');
  });
});
