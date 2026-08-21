// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildAgentActionEvent,
  projectActionCurrent,
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
} from '@deeds/parent-atlas';

import {
  buildTemporalToolInputHash,
  decideTemporalToolExecution,
  temporalBoundaryAllowsDispatch,
} from './temporal-tool-execution-boundary.js';

const call = { tool: 'rg_search', args: { pattern: 'resolveCanonicalCandidateId' } };

function descriptor(overrides: Partial<ActionExecutionDescriptorV1> = {}): ActionExecutionDescriptorV1 {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode: 'RG_SEARCH',
    query_class: 'EXACT_SYMBOL',
    target: {
      canonical_id: 'symbol:resolveCanonicalCandidateId',
      resource: null,
      target_class: 'symbol',
    },
    input_hash: buildTemporalToolInputHash(call),
    implementation_revision: 'rg-search:v1',
    parameter_revision: 'params:v1',
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: '2026-08-21T12:00:00.000Z',
      valid_time: { from: null, to: null },
      workspace_revision: {
        value: 'workspace:abc',
        authority: 'PROVEN',
        evidence_refs: ['revision-proof:workspace'],
      },
      source_revision: {
        value: 'source:def',
        authority: 'PROVEN',
        evidence_refs: ['revision-proof:source'],
      },
      graph_revision: {
        value: null,
        authority: 'NOT_APPLICABLE',
        evidence_refs: [],
      },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: temporalActionChecksum('frontier:v1'),
    },
    ...overrides,
  };
}

function finalized(input: {
  descriptor?: ActionExecutionDescriptorV1;
  outcome: 'SUCCESS_EXACT' | 'NO_RESULT' | 'TOOL_ERROR';
  resultRef?: string | null;
}) {
  const d = input.descriptor ?? descriptor();
  return buildAgentActionEvent({
    event_id: `event:${input.outcome}`,
    ledger_sequence: 1,
    workflow_action: {
      workflow_id: 'workflow:1',
      workflow_revision: 1,
      action_id: 'action:rg-search',
      sequence: 1,
    },
    descriptor: d,
    state: 'FINALIZED',
    outcome: input.outcome,
    result_ref: input.resultRef ?? null,
    error_code: input.outcome === 'TOOL_ERROR' ? 'RG_TIMEOUT' : null,
    evidence_refs: ['evidence:fixture'],
    artifact_refs: [],
    cost: { latency_ms: 10, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    observed_at: d.applicability.observed_at,
    producer_revision: 'fixture:v1',
  });
}

function temporal(d = descriptor(), allowRetry = false) {
  return {
    schema: 'atlas.temporal-tool-execution-context.v1' as const,
    expected_tool: call.tool,
    descriptor: d,
    retry_policy: {
      policy_revision: 'retry:v1',
      allow_transient_retry: allowRetry,
      max_retries: allowRetry ? 1 : 0,
      retryable_outcomes: allowRetry ? ['TOOL_ERROR' as const] : [],
    },
    producer_revision: 'boundary:v1',
  };
}

describe('temporal tool execution boundary', () => {
  it('dispatches when there is no prior execution', async () => {
    const decision = await decideTemporalToolExecution({
      call,
      temporal: temporal(),
      lookupCurrent: async () => ({ current: null, eventCount: 0 }),
    });

    expect(decision.reuse_decision).toBe('EXECUTE');
    expect(decision.disposition).toBe('DISPATCH_EXECUTE');
    expect(decision.reason).toBe('NO_HISTORY');
    expect(temporalBoundaryAllowsDispatch(decision)).toBe(true);
  });

  it('reuses a finalized exact successful result without dispatch', async () => {
    const event = finalized({ outcome: 'SUCCESS_EXACT', resultRef: 'artifact:result:1' });
    const current = projectActionCurrent([event]);
    const decision = await decideTemporalToolExecution({
      call,
      temporal: temporal(),
      lookupCurrent: async () => ({ current, eventCount: 1 }),
    });

    expect(decision.reuse_decision).toBe('HIT');
    expect(decision.disposition).toBe('REUSE_RESULT');
    expect(decision.reused_result_ref).toBe('artifact:result:1');
    expect(temporalBoundaryAllowsDispatch(decision)).toBe(false);
  });

  it('treats an exact known failure as alternative-selection evidence, not a cache miss', async () => {
    const event = finalized({ outcome: 'NO_RESULT' });
    const current = projectActionCurrent([event]);
    const decision = await decideTemporalToolExecution({
      call,
      temporal: temporal(),
      lookupCurrent: async () => ({ current, eventCount: 1 }),
    });

    expect(decision.reuse_decision).toBe('HIT');
    expect(decision.disposition).toBe('SELECT_ALTERNATIVE');
    expect(decision.reason).toBe('EXACT_FAILURE_DO_NOT_REPEAT');
    expect(temporalBoundaryAllowsDispatch(decision)).toBe(false);
  });

  it('permits only bounded policy-authorized retry for a transient failure', async () => {
    const event = finalized({ outcome: 'TOOL_ERROR' });
    const current = projectActionCurrent([event]);
    const decision = await decideTemporalToolExecution({
      call,
      temporal: temporal(descriptor(), true),
      lookupCurrent: async () => ({ current, eventCount: 1 }),
    });

    expect(decision.reuse_decision).toBe('RETRY');
    expect(decision.disposition).toBe('DISPATCH_RETRY');
    expect(decision.reason).toBe('TRANSIENT_RETRY_ALLOWED');
    expect(temporalBoundaryAllowsDispatch(decision)).toBe(true);
  });

  it('recomputes instead of reusing when relevant revision authority is unproven', async () => {
    const unsafe = descriptor({
      applicability: {
        ...descriptor().applicability,
        source_revision: {
          value: null,
          authority: 'UNPROVEN',
          evidence_refs: ['revision-owner-proof:red'],
        },
      },
    });
    const event = finalized({ descriptor: unsafe, outcome: 'SUCCESS_EXACT', resultRef: 'artifact:unsafe' });
    const current = projectActionCurrent([event]);
    const decision = await decideTemporalToolExecution({
      call,
      temporal: temporal(unsafe),
      lookupCurrent: async () => ({ current, eventCount: 1 }),
    });

    expect(decision.reuse_decision).toBe('INVALIDATE');
    expect(decision.disposition).toBe('DISPATCH_RECOMPUTE');
    expect(decision.reused_result_ref).toBeNull();
    expect(decision.reason).toBe('REVISION_AUTHORITY_UNPROVEN');
  });

  it('rejects a temporal descriptor that does not describe the exact tool call', async () => {
    await expect(decideTemporalToolExecution({
      call,
      temporal: { ...temporal(), expected_tool: 'graph_expand' },
      lookupCurrent: async () => ({ current: null, eventCount: 0 }),
    })).rejects.toThrow('TEMPORAL_TOOL_IDENTITY_MISMATCH');

    await expect(decideTemporalToolExecution({
      call,
      temporal: temporal(descriptor({ input_hash: temporalActionChecksum('different-input') })),
      lookupCurrent: async () => ({ current: null, eventCount: 0 }),
    })).rejects.toThrow('TEMPORAL_TOOL_INPUT_HASH_MISMATCH');
  });
});
