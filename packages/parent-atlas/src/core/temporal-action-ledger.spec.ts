import { describe, expect, it } from 'vitest';
import {
  buildActionExecutionKey,
  buildAgentActionEvent,
  decideExecutionReuse,
  projectActionCurrent,
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
} from './temporal-action-ledger.js';

const H = temporalActionChecksum;

function descriptor(overrides: Partial<ActionExecutionDescriptorV1> = {}): ActionExecutionDescriptorV1 {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode: 'RG_SEARCH',
    query_class: 'EXACT_SYMBOL',
    target: { canonical_id: 'symbol:resolveCanonicalCandidateId', resource: null, target_class: 'symbol' },
    input_hash: H('input-v1'),
    implementation_revision: 'rg:v1',
    parameter_revision: 'params:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: '2026-08-21T10:00:00.000Z',
      valid_time: { from: null, to: null },
      workspace_revision: { value: 'W123', authority: 'PROVEN', evidence_refs: ['e:workspace'] },
      source_revision: { value: 'S517', authority: 'PROVEN', evidence_refs: ['e:source'] },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: H('frontier-v1'),
    },
    ...overrides,
  };
}

function finalizedEvent(input: {
  descriptor?: ActionExecutionDescriptorV1;
  outcome: 'SUCCESS_EXACT' | 'TOOL_ERROR' | 'NO_RESULT';
  resultRef?: string | null;
  sequence?: number;
}) {
  const d = input.descriptor ?? descriptor();
  return buildAgentActionEvent({
    event_id: `evt:${input.sequence ?? 1}`,
    ledger_sequence: input.sequence ?? 1,
    workflow_action: { workflow_id: 'wf:1', workflow_revision: 1, action_id: 'A53', sequence: 1 },
    descriptor: d,
    state: 'FINALIZED',
    outcome: input.outcome,
    result_ref: input.resultRef ?? null,
    error_code: input.outcome === 'TOOL_ERROR' ? 'QDRANT_TIMEOUT' : null,
    evidence_refs: [],
    artifact_refs: [],
    cost: { latency_ms: 12, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    observed_at: d.applicability.observed_at,
    producer_revision: 'test:v1',
  });
}

describe('temporal action ledger DRY policy', () => {
  it('reuses an exact successful execution key when all relevant revisions are proven', () => {
    const d = descriptor();
    const event = finalizedEvent({ descriptor: d, outcome: 'SUCCESS_EXACT', resultRef: 'cas:result:1' });
    const current = projectActionCurrent([event]);
    const decision = decideExecutionReuse({
      descriptor: d,
      current,
      retry_policy: { policy_revision: 'retry:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: [] },
      producer_revision: 'reuse:v1',
    });

    expect(decision.execution_key).toBe(buildActionExecutionKey(d));
    expect(decision.decision).toBe('HIT');
    expect(decision.hit_kind).toBe('SUCCESS');
    expect(decision.disposition).toBe('REUSE_RESULT');
    expect(decision.reason).toBe('EXACT_SUCCESS_REUSE');
    expect(decision.reused_result_ref).toBe('cas:result:1');
  });

  it('treats an exact finalized failure as a hit and selects an alternative instead of repeating it', () => {
    const d = descriptor();
    const event = finalizedEvent({ descriptor: d, outcome: 'NO_RESULT' });
    const current = projectActionCurrent([event]);
    const decision = decideExecutionReuse({
      descriptor: d,
      current,
      retry_policy: { policy_revision: 'retry:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: [] },
      producer_revision: 'reuse:v1',
    });

    expect(decision.decision).toBe('HIT');
    expect(decision.hit_kind).toBe('FAILURE');
    expect(decision.disposition).toBe('SELECT_ALTERNATIVE');
    expect(decision.reason).toBe('EXACT_FAILURE_DO_NOT_REPEAT');
  });

  it('permits bounded retry only for explicitly transient outcomes', () => {
    const d = descriptor();
    const event = finalizedEvent({ descriptor: d, outcome: 'TOOL_ERROR' });
    const current = projectActionCurrent([event]);
    const decision = decideExecutionReuse({
      descriptor: d,
      current,
      retry_policy: {
        policy_revision: 'retry:v1',
        allow_transient_retry: true,
        max_retries: 1,
        retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'],
      },
      producer_revision: 'reuse:v1',
    });

    expect(decision.decision).toBe('RETRY');
    expect(decision.disposition).toBe('RETRY_PROPOSED');
    expect(decision.reason).toBe('TRANSIENT_RETRY_ALLOWED');
  });

  it('invalidates history when the relevant source revision changes', () => {
    const oldDescriptor = descriptor();
    const event = finalizedEvent({ descriptor: oldDescriptor, outcome: 'SUCCESS_EXACT', resultRef: 'cas:old' });
    const current = projectActionCurrent([event]);
    const newDescriptor = descriptor({
      applicability: {
        ...oldDescriptor.applicability,
        source_revision: { value: 'S518', authority: 'PROVEN', evidence_refs: ['e:source:518'] },
      },
    });
    const decision = decideExecutionReuse({
      descriptor: newDescriptor,
      current,
      retry_policy: { policy_revision: 'retry:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: [] },
      producer_revision: 'reuse:v1',
    });

    expect(buildActionExecutionKey(newDescriptor)).not.toBe(buildActionExecutionKey(oldDescriptor));
    expect(decision.decision).toBe('INVALIDATE');
    expect(decision.reason).toBe('EXECUTION_KEY_CHANGED');
  });

  it('invalidates an otherwise exact hit while relevant revision authority is unproven', () => {
    const d = descriptor({
      applicability: {
        ...descriptor().applicability,
        source_revision: { value: null, authority: 'UNPROVEN', evidence_refs: ['revision-owner-proof:red'] },
      },
    });
    const event = finalizedEvent({ descriptor: d, outcome: 'SUCCESS_EXACT', resultRef: 'cas:unsafe' });
    const current = projectActionCurrent([event]);
    const decision = decideExecutionReuse({
      descriptor: d,
      current,
      retry_policy: { policy_revision: 'retry:v1', allow_transient_retry: false, max_retries: 0, retryable_outcomes: [] },
      producer_revision: 'reuse:v1',
    });

    expect(decision.decision).toBe('INVALIDATE');
    expect(decision.world_state_applicable).toBe(false);
    expect(decision.reason).toBe('REVISION_AUTHORITY_UNPROVEN');
    expect(decision.reused_result_ref).toBeNull();
  });

  it('changes the execution key when the evidence frontier changes, blocking repeated failed synthesis on stale evidence', () => {
    const oldDescriptor = descriptor({ opcode: 'SYNTHESIZE' });
    const newDescriptor = descriptor({
      opcode: 'SYNTHESIZE',
      applicability: {
        ...oldDescriptor.applicability,
        evidence_frontier_hash: H('frontier-v2'),
      },
    });
    expect(buildActionExecutionKey(newDescriptor)).not.toBe(buildActionExecutionKey(oldDescriptor));
  });
});
