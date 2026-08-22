import { describe, expect, it } from 'vitest';
import { temporalActionChecksum } from './temporal-action-ledger.js';
import { adaptWorkflowActionEventToTemporalHistory } from './temporal-action-workflow-adapter.js';

const H = temporalActionChecksum;

function base() {
  return {
    workflow_event: {
      schema: 'atlas.workflow-action.v1' as const,
      workflowId: 'wf:graphify:1',
      workflowRevision: 7,
      sequence: 23,
      actionId: 'A53',
      dagNodeId: 'node:rg-search',
      attempt: 1,
      lane: 'lexical' as const,
      kind: 'completed' as const,
      toolId: 'rg',
      receiptId: 'receipt:rg:53',
      resourceRefs: [{ resource_type: 'symbol', resource_id: 'sym:foo', role: 'target', identity_status: 'canonical' as const }],
      evidenceRefs: ['e:workflow'],
      artifactRefs: ['artifact:workflow'],
      startedAt: '2026-08-21T17:00:00.000Z',
      completedAt: '2026-08-21T17:00:00.100Z',
      metadata: {},
      producerRevision: 'workflow:v1',
    },
    ledger_sequence: 101,
    descriptor: {
      schema: 'atlas.action-execution-descriptor.v1' as const,
      opcode: 'RG_SEARCH',
      query_class: 'EXACT_SYMBOL',
      target: { canonical_id: 'sym:foo', resource: null, target_class: 'symbol' },
      input_hash: H('input'),
      implementation_revision: 'rg:v1',
      parameter_revision: 'params:v1',
      context_manifest_hash: null,
      applicability: {
        schema: 'atlas.temporal-applicability.v1' as const,
        observed_at: '2026-08-21T16:59:59.000Z',
        valid_time: { from: null, to: null },
        workspace_revision: { value: 'W1', authority: 'PROVEN' as const, evidence_refs: ['e:w'] },
        source_revision: { value: 'S1', authority: 'PROVEN' as const, evidence_refs: ['e:s'] },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] },
        relevant_dimensions: ['workspace', 'source'] as ('workspace' | 'source' | 'graph')[],
        evidence_frontier_hash: H('frontier'),
      },
    },
    outcome: 'SUCCESS_EXACT' as const,
    result_ref: 'cas:result:53',
    error_code: null,
    evidence_refs: ['e:adapter'],
    artifact_refs: ['artifact:adapter'],
    cost: { latency_ms: 100, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    producer_revision: 'temporal-adapter:v1',
  };
}

describe('workflow temporal action adapter', () => {
  it('preserves canonical workflow/action identity exactly', () => {
    const input = base();
    const event = adaptWorkflowActionEventToTemporalHistory(input);
    expect(event.workflow_action).toEqual({
      workflow_id: input.workflow_event.workflowId,
      workflow_revision: input.workflow_event.workflowRevision,
      action_id: input.workflow_event.actionId,
      sequence: input.workflow_event.sequence,
    });
    expect(event.state).toBe('FINALIZED');
    expect(event.outcome).toBe('SUCCESS_EXACT');
    expect(event.result_ref).toBe('cas:result:53');
    expect(event.observed_at).toBe(input.workflow_event.completedAt);
    expect(event.descriptor.applicability.observed_at).toBe(input.workflow_event.completedAt);
    expect(event.evidence_refs.sort()).toEqual(['e:adapter', 'e:workflow']);
    expect(event.artifact_refs.sort()).toEqual(['artifact:adapter', 'artifact:workflow']);
  });

  it('refuses to infer reusable success from completed workflow state', () => {
    const input = base();
    expect(() => adaptWorkflowActionEventToTemporalHistory({ ...input, outcome: null }))
      .toThrow(/completed workflow event requires explicit action outcome/);
  });

  it('requires a result reference for completed actions', () => {
    const input = base();
    expect(() => adaptWorkflowActionEventToTemporalHistory({ ...input, result_ref: null }))
      .toThrow(/completed workflow event requires result_ref/);
  });

  it('uses explicit failed outcome and preserves runtime error code', () => {
    const input = base();
    const event = adaptWorkflowActionEventToTemporalHistory({
      ...input,
      workflow_event: {
        ...input.workflow_event,
        kind: 'failed',
        receiptId: undefined,
        errorCode: 'RG_EXIT_2',
        completedAt: '2026-08-21T17:00:00.050Z',
      },
      outcome: 'TOOL_ERROR',
      result_ref: null,
    });
    expect(event.state).toBe('FINALIZED');
    expect(event.outcome).toBe('TOOL_ERROR');
    expect(event.error_code).toBe('RG_EXIT_2');
  });
});
