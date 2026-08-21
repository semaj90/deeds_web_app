// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  decideExecutionReuse,
  projectActionCurrent,
  temporalActionChecksum,
  type ActionExecutionDescriptorV1,
  type AgentActionEventV1,
} from '@deeds/parent-atlas';
import type { ArtifactAddressV1 } from '$lib/server/queue/artifact-work-item-v1.js';
import {
  recordTemporalPostDispatch,
  type TemporalPostDispatchRecorderDeps,
  type WorkflowTerminalEventRequestV1,
} from './temporal-post-dispatch-recorder.js';

const OBSERVED_AT = '2026-08-21T20:00:00.000Z';

function descriptor(opcode = 'RG_SEARCH'): ActionExecutionDescriptorV1 {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode,
    query_class: 'code_search',
    target: {
      canonical_id: 'workspace:deeds_web_app',
      resource: null,
      target_class: 'workspace',
    },
    input_hash: '1'.repeat(64),
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
      graph_revision: {
        value: null,
        authority: 'NOT_APPLICABLE',
        evidence_refs: [],
      },
      relevant_dimensions: ['workspace', 'source'],
      evidence_frontier_hash: '3'.repeat(64),
    },
  };
}

function artifact(payload: unknown): ArtifactAddressV1 {
  const checksum = temporalActionChecksum(payload);
  const artifactHash = temporalActionChecksum({ payload, schema: 'atlas.tool-result.v1' });
  return {
    schema: 'atlas.artifact-address.v1',
    artifactId: `sha256:${artifactHash}`,
    artifactHash,
    schemaId: 'atlas.tool-result.v1',
    checksum,
    revisionSetHash: '4'.repeat(64),
    revisions: { workspace: 'workspace:742', source: 'source:109' },
    locator: {
      storage: 'POSTGRES',
      table: 'workflow_artifacts',
      primaryKey: `sha256:${artifactHash}`,
    },
  };
}

function makeHarness() {
  const events: AgentActionEventV1[] = [];
  const materialized: ArtifactAddressV1[] = [];
  let nextLedgerSequence = 100;
  let nextWorkflowSequence = 7;

  const deps: TemporalPostDispatchRecorderDeps = {
    async materialize_result(input) {
      const address = artifact(input.payload);
      materialized.push(address);
      return address;
    },
    emit_workflow_terminal_event(request: WorkflowTerminalEventRequestV1) {
      const sequence = nextWorkflowSequence++;
      const completed = request.terminal_kind === 'completed';
      return {
        schema: 'atlas.workflow-action.v1',
        workflowId: 'workflow:parent-atlas-proof',
        workflowRevision: 3,
        sequence,
        actionId: 'action:rg-search',
        dagNodeId: 'dag:rg-search',
        attempt: 1,
        lane: 'tool',
        transport: 'local',
        kind: request.terminal_kind,
        toolId: 'rg_search',
        receiptId: completed ? `workflow-receipt:${sequence}` : undefined,
        resourceRefs: [],
        evidenceRefs: request.evidence_refs,
        artifactRefs: request.result_artifact ? [request.result_artifact.artifactId] : [],
        startedAt: OBSERVED_AT,
        completedAt: OBSERVED_AT,
        errorCode: completed ? undefined : request.error_code ?? undefined,
        metadata: { temporal_test_fixture: true },
        producerRevision: 'workflow-runtime:test-v1',
      };
    },
    async reserve_ledger_sequence(producerRevision) {
      return {
        schema: 'atlas.temporal-action-sequence-reservation-receipt.v1',
        ledger_sequence: nextLedgerSequence++,
        allocator: 'atlas_agent_action_ledger_sequence_seq',
        identity_authority: false,
        producer_revision: producerRevision,
      };
    },
    async append_temporal_event(event, producerRevision) {
      events.push(event);
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
  };

  return { events, materialized, deps };
}

function reuseDecision(descriptorInput: ActionExecutionDescriptorV1, events: AgentActionEventV1[]) {
  return decideExecutionReuse({
    descriptor: descriptorInput,
    current: events.length ? projectActionCurrent(events) : null,
    retry_policy: {
      policy_revision: 'retry:none:v1',
      allow_transient_retry: false,
      max_retries: 0,
      retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'],
    },
    producer_revision: 'closed-loop-test:v1',
  });
}

describe('temporal post-dispatch recorder', () => {
  it('closes execute once -> append -> exact repeat -> zero redispatch', async () => {
    const d = descriptor();
    const harness = makeHarness();
    let dispatchCount = 0;

    const firstDecision = reuseDecision(d, harness.events);
    expect(firstDecision.disposition).toBe('EXECUTE_PROPOSED');

    dispatchCount += 1;
    const toolResult = { success: true, matches: ['src/lib/server/example.ts:42'] };
    const recorded = await recordTemporalPostDispatch({
      descriptor: d,
      outcome: 'SUCCESS_EXACT',
      result_payload: toolResult,
      result_schema_id: 'atlas.tool-result.v1',
      artifact_revisions: { workspace: 'workspace:742', source: 'source:109' },
      error_code: null,
      evidence_refs: ['tool:rg_search'],
      cost: { latency_ms: 12, gpu_bytes: null, tokens: null, tool_calls: 1 },
      producer_revision: 'temporal-recorder:test-v1',
    }, harness.deps);

    expect(recorded.temporal_event.result_ref).toBe(recorded.artifact?.artifactId);
    expect(recorded.temporal_event.artifact_refs).toContain(recorded.artifact?.artifactId);
    expect(recorded.sequence_reservation.identity_authority).toBe(false);
    expect(harness.events).toHaveLength(1);
    expect(harness.materialized).toHaveLength(1);

    const repeatDecision = reuseDecision(d, harness.events);
    if (repeatDecision.disposition !== 'REUSE_RESULT') dispatchCount += 1;

    expect(repeatDecision.decision).toBe('HIT');
    expect(repeatDecision.hit_kind).toBe('SUCCESS');
    expect(repeatDecision.disposition).toBe('REUSE_RESULT');
    expect(repeatDecision.reused_result_ref).toBe(recorded.artifact?.artifactId);
    expect(dispatchCount).toBe(1);
    expect(harness.materialized).toHaveLength(1);
  });

  it('records an explicit failed dispatch and makes the exact repeat SELECT_ALTERNATIVE without redispatch', async () => {
    const d = descriptor('QDRANT_SEARCH');
    const harness = makeHarness();
    let dispatchCount = 0;

    expect(reuseDecision(d, harness.events).disposition).toBe('EXECUTE_PROPOSED');
    dispatchCount += 1;

    const recorded = await recordTemporalPostDispatch({
      descriptor: d,
      outcome: 'TOOL_ERROR',
      error_code: 'QDRANT_UNAVAILABLE',
      result_schema_id: null,
      artifact_revisions: {},
      evidence_refs: ['tool:qdrant_search'],
      cost: { latency_ms: 25, gpu_bytes: null, tokens: null, tool_calls: 1 },
      producer_revision: 'temporal-recorder:test-v1',
    }, harness.deps);

    expect(recorded.artifact).toBeNull();
    expect(recorded.temporal_event.result_ref).toBeNull();
    expect(recorded.temporal_event.error_code).toBe('QDRANT_UNAVAILABLE');
    expect(harness.materialized).toHaveLength(0);

    const repeatDecision = reuseDecision(d, harness.events);
    if (repeatDecision.disposition !== 'SELECT_ALTERNATIVE') dispatchCount += 1;

    expect(repeatDecision.decision).toBe('HIT');
    expect(repeatDecision.hit_kind).toBe('FAILURE');
    expect(repeatDecision.disposition).toBe('SELECT_ALTERNATIVE');
    expect(repeatDecision.reused_result_ref).toBeNull();
    expect(dispatchCount).toBe(1);
  });

  it('rejects a workflow emitter that omits the canonical result artifact reference', async () => {
    const d = descriptor();
    const harness = makeHarness();
    const badDeps: TemporalPostDispatchRecorderDeps = {
      ...harness.deps,
      emit_workflow_terminal_event: async (request) => ({
        ...(await harness.deps.emit_workflow_terminal_event(request)),
        artifactRefs: [],
      }),
    };

    await expect(recordTemporalPostDispatch({
      descriptor: d,
      outcome: 'SUCCESS_EXACT',
      result_payload: { success: true },
      result_schema_id: 'atlas.tool-result.v1',
      artifact_revisions: { workspace: 'workspace:742' },
      error_code: null,
      evidence_refs: [],
      producer_revision: 'temporal-recorder:test-v1',
    }, badDeps)).rejects.toThrow('TEMPORAL_WORKFLOW_ARTIFACT_REF_MISSING');
  });

  it('does not infer success or materialize an artifact for an explicit TOOL_ERROR', async () => {
    const d = descriptor();
    const harness = makeHarness();

    await recordTemporalPostDispatch({
      descriptor: d,
      outcome: 'TOOL_ERROR',
      error_code: 'REMOTE_TOOL_ERROR',
      result_payload: { success: true, misleading: true },
      result_schema_id: 'atlas.tool-result.v1',
      artifact_revisions: { workspace: 'workspace:742' },
      evidence_refs: [],
      producer_revision: 'temporal-recorder:test-v1',
    }, harness.deps);

    expect(harness.materialized).toHaveLength(0);
    expect(harness.events[0]?.outcome).toBe('TOOL_ERROR');
    expect(harness.events[0]?.result_ref).toBeNull();
  });
});
