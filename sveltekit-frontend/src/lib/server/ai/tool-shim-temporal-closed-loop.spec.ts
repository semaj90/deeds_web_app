// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
  type AgentActionEventV1,
} from '@deeds/parent-atlas';
import type { ArtifactAddressV1 } from '$lib/server/queue/artifact-work-item-v1.js';

const state = vi.hoisted(() => ({
  events: [] as AgentActionEventV1[],
  dispatchCount: 0,
  materializeCount: 0,
  nextLedgerSequence: 900,
}));

vi.mock('../atlas/temporal/temporal-tool-execution-boundary.js', async () => {
  const atlas = await import('@deeds/parent-atlas');
  return {
    temporalBoundaryAllowsDispatch(decision: any) {
      return String(decision.disposition).startsWith('DISPATCH_');
    },
    async decideTemporalToolExecutionFromPostgres(input: any) {
      const descriptor = input.temporal.descriptor;
      const current = state.events.length ? atlas.projectActionCurrent(state.events) : null;
      const decision = atlas.decideExecutionReuse({
        descriptor,
        current,
        retry_policy: input.temporal.retry_policy,
        producer_revision: 'shim-closed-loop:v1',
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
      return {
        schema: 'atlas.temporal-tool-boundary-decision.v1',
        execution_key: decision.execution_key,
        tool: input.call.tool,
        disposition,
        reused_result_ref: decision.reused_result_ref,
        prior_event_id: decision.prior_event_id,
        lookup_event_count: state.events.length,
        reuse_decision: decision.decision,
        reason: decision.reason,
        boundary_checksum: decision.decision_checksum,
      };
    },
  };
});

vi.mock('./mcp-tool-dispatch.js', () => ({
  tool_codebase_rg_search: vi.fn(async () => {
    state.dispatchCount += 1;
    return { success: true, tool: 'rg_search', matches: ['needle:42'] };
  }),
  tool_graph_expand_neighborhood: vi.fn(),
  tool_search_hybrid: vi.fn(),
}));

const CALL = { tool: 'rg_search', args: { pattern: 'needle' } };
const OBSERVED_AT = '2026-08-21T22:00:00.000Z';

function descriptor(): ActionExecutionDescriptorV1 {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode: 'RG_SEARCH',
    query_class: 'code_search',
    target: {
      canonical_id: 'workspace:deeds_web_app',
      resource: null,
      target_class: 'workspace',
    },
    input_hash: temporalActionChecksum(CALL),
    implementation_revision: 'rg-search:v1',
    parameter_revision: 'params:v1',
    context_manifest_hash: '2'.repeat(64),
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: OBSERVED_AT,
      valid_time: { from: null, to: null },
      workspace_revision: {
        value: 'workspace:742',
        authority: 'PROVEN',
        evidence_refs: ['workspace-revision:742'],
      },
      source_revision: {
        value: 'source:109',
        authority: 'PROVEN',
        evidence_refs: ['source-revision:109'],
      },
      graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: '3'.repeat(64),
    },
  };
}

function fakeArtifact(payload: unknown): ArtifactAddressV1 {
  const artifactHash = temporalActionChecksum({ payload, kind: 'tool-result' });
  const artifactId = `sha256:${artifactHash}`;
  return {
    schema: 'atlas.artifact-address.v1',
    artifactId,
    artifactHash,
    schemaId: 'atlas.tool-result.v1',
    checksum: temporalActionChecksum(payload),
    revisionSetHash: '4'.repeat(64),
    revisions: { workspace: 'workspace:742', source: 'source:109' },
    locator: { storage: 'POSTGRES', table: 'workflow_artifacts', primaryKey: artifactId },
  };
}

beforeEach(() => {
  state.events.length = 0;
  state.dispatchCount = 0;
  state.materializeCount = 0;
  state.nextLedgerSequence = 900;
});

describe('tool shim temporal closed loop', () => {
  it('executes RG_SEARCH once, records the result, then reuses it without redispatch', async () => {
    const [{ executeTool }, { recordTemporalPostDispatch }] = await Promise.all([
      import('./tool-shim.js'),
      import('../atlas/temporal/temporal-post-dispatch-recorder.js'),
    ]);
    const d = descriptor();
    const temporalAction = {
      schema: 'atlas.temporal-tool-execution-context.v1',
      expected_tool: 'rg_search',
      descriptor: d,
      retry_policy: {
        policy_revision: 'retry:none:v1',
        allow_transient_retry: false,
        max_retries: 0,
        retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'],
      },
      producer_revision: 'shim-closed-loop:v1',
    };

    const context: Record<string, unknown> = {
      temporalAction,
      temporalPostDispatch: async ({ result }: any) => {
        await recordTemporalPostDispatch({
          descriptor: d,
          outcome: 'SUCCESS_EXACT',
          result_payload: result,
          result_schema_id: 'atlas.tool-result.v1',
          artifact_revisions: { workspace: 'workspace:742', source: 'source:109' },
          error_code: null,
          evidence_refs: ['tool:rg_search'],
          cost: { latency_ms: 8, gpu_bytes: null, tokens: null, tool_calls: 1 },
          producer_revision: 'shim-closed-loop:v1',
        }, {
          async materialize_result(input) {
            state.materializeCount += 1;
            return fakeArtifact(input.payload);
          },
          emit_workflow_terminal_event(request) {
            const artifactId = request.result_artifact?.artifactId;
            return {
              schema: 'atlas.workflow-action.v1',
              workflowId: 'workflow:closed-loop',
              workflowRevision: 1,
              sequence: 11,
              actionId: 'action:rg-search',
              dagNodeId: 'dag:rg-search',
              attempt: 1,
              lane: 'tool',
              transport: 'local',
              kind: 'completed',
              toolId: 'rg_search',
              receiptId: 'workflow-receipt:11',
              resourceRefs: [],
              evidenceRefs: request.evidence_refs,
              artifactRefs: artifactId ? [artifactId] : [],
              startedAt: OBSERVED_AT,
              completedAt: OBSERVED_AT,
              metadata: {},
              producerRevision: 'workflow-runtime:test-v1',
            };
          },
          async reserve_ledger_sequence(producerRevision) {
            return {
              schema: 'atlas.temporal-action-sequence-reservation-receipt.v1',
              ledger_sequence: state.nextLedgerSequence++,
              allocator: 'atlas_agent_action_ledger_sequence_seq',
              identity_authority: false,
              producer_revision: producerRevision,
            };
          },
          async append_temporal_event(event, producerRevision) {
            state.events.push(event);
            return {
              schema: 'atlas.temporal-action-append-receipt.v1',
              event_id: event.event_id,
              execution_key: event.execution_key,
              ledger_sequence: event.ledger_sequence,
              event_checksum: event.event_checksum,
              inserted: true,
              readback_checksum: event.event_checksum,
              producer_revision: producerRevision,
            };
          },
        });
      },
    };

    const first = await executeTool(CALL, context) as any;
    expect(first).toEqual({ success: true, tool: 'rg_search', matches: ['needle:42'] });
    expect(state.dispatchCount).toBe(1);
    expect(state.materializeCount).toBe(1);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.outcome).toBe('SUCCESS_EXACT');
    expect(state.events[0]?.result_ref).toMatch(/^sha256:/);

    const second = await executeTool(CALL, context) as any;
    expect(second.temporalDisposition).toBe('REUSE_RESULT');
    expect(second.reused).toBe(true);
    expect(second.resultRef).toBe(state.events[0]?.result_ref);
    expect(state.dispatchCount).toBe(1);
    expect(state.materializeCount).toBe(1);
    expect(state.events).toHaveLength(1);
  });
});
