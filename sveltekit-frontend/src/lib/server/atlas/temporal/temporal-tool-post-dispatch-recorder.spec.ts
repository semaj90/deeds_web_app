import { describe, expect, it } from 'vitest';

import { recordTemporalToolDispatchOutcome } from './temporal-tool-post-dispatch-recorder';

const HASH = 'a'.repeat(64);
const descriptor = {
  schema: 'atlas.action-execution-descriptor.v1' as const,
  opcode: 'RG_SEARCH',
  query_class: 'exact_symbol',
  target: { canonical_id: 'symbol:one', resource: 'src/one.ts', target_class: 'typescript_symbol' },
  input_hash: HASH,
  implementation_revision: 'rg:v1',
  parameter_revision: 'params:v1',
  context_manifest_hash: null,
  applicability: {
    schema: 'atlas.temporal-applicability.v1' as const,
    observed_at: '2026-08-21T23:00:00.000Z',
    valid_time: { from: null, to: null },
    workspace_revision: { value: 'ws:1', authority: 'PROVEN' as const, evidence_refs: [] },
    source_revision: { value: 'src:1', authority: 'PROVEN' as const, evidence_refs: [] },
    graph_revision: { value: null, authority: 'NOT_APPLICABLE' as const, evidence_refs: [] },
    relevant_dimensions: ['workspace' as const, 'source' as const],
    evidence_frontier_hash: null,
  },
};

function workflow(kind: 'completed' | 'failed') {
  return {
    schema: 'atlas.workflow-action.v1' as const,
    workflowId: 'wf:proof', workflowRevision: 1, sequence: 7, actionId: 'action:rg',
    dagNodeId: 'node:rg', attempt: 1, lane: 'tool' as const, kind,
    toolId: 'rg_search', receiptId: kind === 'completed' ? 'receipt:rg' : undefined,
    resourceRefs: [], evidenceRefs: [], artifactRefs: [],
    startedAt: '2026-08-21T22:59:59.000Z',
    completedAt: '2026-08-21T23:00:00.000Z',
    errorCode: kind === 'failed' ? 'RG_FAILED' : undefined,
    metadata: {}, producerRevision: 'workflow-proof-v1',
  };
}

describe('temporal post-dispatch recorder', () => {
  it('materializes an explicit successful result then appends temporal history', async () => {
    const calls: string[] = [];
    const record = await recordTemporalToolDispatchOutcome({
      workflow_event: workflow('completed'), descriptor,
      outcome: 'SUCCESS_EXACT', tool_result: { matches: ['src/one.ts:10'] },
      producer_revision: 'post-dispatch-proof-v1',
      deps: {
        reserveSequence: async () => { calls.push('sequence'); return 42; },
        materializeResult: async () => {
          calls.push('artifact');
          return {
            schema: 'atlas.artifact-address.v1', artifactId: 'sha256:result', artifactHash: 'b'.repeat(64),
            schemaId: 'atlas.temporal-tool-result.v1', checksum: 'c'.repeat(64), revisionSetHash: 'd'.repeat(64),
            revisions: { producer: 'post-dispatch-proof-v1' },
            locator: { storage: 'POSTGRES', table: 'workflow_artifacts', primaryKey: 'sha256:result' },
          };
        },
        appendEvent: async (event) => {
          calls.push('append');
          return {
            schema: 'atlas.temporal-action-append-receipt.v1', event_id: event.event_id,
            execution_key: event.execution_key, ledger_sequence: event.ledger_sequence,
            event_checksum: event.event_checksum, inserted: true,
            readback_checksum: event.event_checksum, producer_revision: 'post-dispatch-proof-v1',
          };
        },
      },
    });

    expect(calls).toEqual(['artifact', 'sequence', 'append']);
    expect(record.event.outcome).toBe('SUCCESS_EXACT');
    expect(record.event.result_ref).toBe('sha256:result');
    expect(record.event.ledger_sequence).toBe(42);
  });

  it('records a failed action without fabricating a result artifact', async () => {
    let materialized = false;
    const record = await recordTemporalToolDispatchOutcome({
      workflow_event: workflow('failed'), descriptor,
      outcome: 'TOOL_ERROR', error_code: 'RG_FAILED', producer_revision: 'post-dispatch-proof-v1',
      deps: {
        reserveSequence: async () => 43,
        materializeResult: async () => { materialized = true; throw new Error('must not run'); },
        appendEvent: async (event) => ({
          schema: 'atlas.temporal-action-append-receipt.v1', event_id: event.event_id,
          execution_key: event.execution_key, ledger_sequence: event.ledger_sequence,
          event_checksum: event.event_checksum, inserted: true,
          readback_checksum: event.event_checksum, producer_revision: 'post-dispatch-proof-v1',
        }),
      },
    });

    expect(materialized).toBe(false);
    expect(record.result_artifact).toBeNull();
    expect(record.event.outcome).toBe('TOOL_ERROR');
    expect(record.event.result_ref).toBeNull();
  });

  it('never infers success from a completed transport result', async () => {
    await expect(recordTemporalToolDispatchOutcome({
      workflow_event: workflow('completed'), descriptor,
      outcome: 'TOOL_ERROR', tool_result: { ok: true }, producer_revision: 'post-dispatch-proof-v1',
      deps: {
        reserveSequence: async () => 44,
        materializeResult: async () => { throw new Error('unreachable'); },
        appendEvent: async () => { throw new Error('unreachable'); },
      },
    })).rejects.toThrow('TEMPORAL_COMPLETED_EVENT_REQUIRES_SUCCESS_OUTCOME');
  });
});
