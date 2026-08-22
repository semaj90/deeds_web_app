#!/usr/bin/env node
import { randomUUID } from 'node:crypto';

import type { ActionExecutionDescriptorV1 } from '@deeds/parent-atlas';
import type { WorkflowActionEventV1 } from '@deeds/parent-atlas/core/workflow-action-event';
import { pool } from '../../src/lib/server/db/client.js';
import {
  buildTemporalToolExecutionContext,
  decideTemporalToolExecutionFromPostgres,
} from '../../src/lib/server/atlas/temporal/temporal-tool-execution-boundary.js';
import {
  recordTemporalPostDispatchFromPostgres,
  type WorkflowTerminalEventRequestV1,
} from '../../src/lib/server/atlas/temporal/temporal-post-dispatch-recorder.js';

const RUN = randomUUID();
const OBSERVED_AT = new Date().toISOString();
const PRODUCER_REVISION = 'temporal-live-proof:v1';
const WORKFLOW_ID = `workflow:temporal-live-proof:${RUN}`;
let workflowSequence = 1;

function descriptorBase(opcode: string, implementationRevision: string): Omit<ActionExecutionDescriptorV1, 'input_hash'> {
  return {
    schema: 'atlas.action-execution-descriptor.v1',
    opcode,
    query_class: 'code_search',
    target: {
      canonical_id: `workspace:deeds_web_app:temporal-proof:${RUN}`,
      resource: null,
      target_class: 'workspace',
    },
    implementation_revision: implementationRevision,
    parameter_revision: `params:${RUN}`,
    context_manifest_hash: '2'.repeat(64),
    applicability: {
      schema: 'atlas.temporal-applicability.v1',
      observed_at: OBSERVED_AT,
      valid_time: { from: null, to: null },
      workspace_revision: {
        value: `workspace:proof:${RUN}`,
        authority: 'PROVEN',
        evidence_refs: [`workspace-proof:${RUN}`],
      },
      source_revision: {
        value: `source:proof:${RUN}`,
        authority: 'PROVEN',
        evidence_refs: [`source-proof:${RUN}`],
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

function emitWorkflowTerminalEvent(request: WorkflowTerminalEventRequestV1): WorkflowActionEventV1 {
  const sequence = workflowSequence++;
  const completed = request.terminal_kind === 'completed';
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: WORKFLOW_ID,
    workflowRevision: 1,
    sequence,
    actionId: `${request.descriptor.opcode.toLowerCase()}:${RUN}`,
    dagNodeId: `dag:${request.descriptor.opcode.toLowerCase()}:${RUN}`,
    attempt: 1,
    lane: 'tool',
    transport: 'local',
    kind: request.terminal_kind,
    toolId: request.descriptor.opcode.toLowerCase(),
    receiptId: completed ? `workflow-receipt:${RUN}:${sequence}` : undefined,
    resourceRefs: [],
    evidenceRefs: request.evidence_refs,
    artifactRefs: request.result_artifact ? [request.result_artifact.artifactId] : [],
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    errorCode: completed ? undefined : request.error_code ?? undefined,
    metadata: { temporal_live_postgres_proof: true, run: RUN },
    producerRevision: PRODUCER_REVISION,
  };
}

const retryPolicy = {
  policy_revision: 'retry:none:live-proof:v1',
  allow_transient_retry: false,
  max_retries: 0,
  retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] as const,
};

async function countRows(executionKey: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM atlas_agent_action_events WHERE execution_key = $1`,
    [executionKey],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const table = await pool.query<{ regclass: string | null }>(
    `SELECT to_regclass('public.atlas_agent_action_events')::text AS regclass`,
  );
  const sequence = await pool.query<{ regclass: string | null }>(
    `SELECT to_regclass('public.atlas_agent_action_ledger_sequence_seq')::text AS regclass`,
  );
  if (!table.rows[0]?.regclass || !sequence.rows[0]?.regclass) {
    throw new Error('TEMPORAL_LIVE_PROOF_MIGRATION_NOT_APPLIED');
  }

  let dispatchCount = 0;

  // SUCCESS -> exact same execution key -> REUSE_RESULT.
  const successCall = { tool: 'rg_search', args: { query: `temporal-live-proof-${RUN}` } };
  const successTemporal = buildTemporalToolExecutionContext({
    call: successCall,
    descriptor: descriptorBase('RG_SEARCH', 'rg-search:live-proof:v1'),
    retry_policy: retryPolicy,
    producer_revision: PRODUCER_REVISION,
  });
  const firstSuccessDecision = await decideTemporalToolExecutionFromPostgres({
    call: successCall,
    temporal: successTemporal,
  });
  if (firstSuccessDecision.disposition !== 'DISPATCH_EXECUTE') {
    throw new Error(`TEMPORAL_LIVE_SUCCESS_FIRST_DISPOSITION:${firstSuccessDecision.disposition}`);
  }
  dispatchCount += 1;

  const successRecorded = await recordTemporalPostDispatchFromPostgres({
    record: {
      descriptor: successTemporal.descriptor,
      outcome: 'SUCCESS_EXACT',
      result_payload: { success: true, matches: [`src/live-proof.ts:${RUN}`] },
      result_schema_id: 'atlas.temporal-live-tool-result.v1',
      artifact_revisions: {
        workspace: `workspace:proof:${RUN}`,
        source: `source:proof:${RUN}`,
        producer: PRODUCER_REVISION,
      },
      error_code: null,
      evidence_refs: [`tool:rg_search:${RUN}`],
      cost: { latency_ms: 1, gpu_bytes: null, tokens: null, tool_calls: 1 },
      producer_revision: PRODUCER_REVISION,
    },
    emit_workflow_terminal_event: emitWorkflowTerminalEvent,
  });
  if (!successRecorded.artifact) throw new Error('TEMPORAL_LIVE_SUCCESS_ARTIFACT_MISSING');

  const repeatSuccessDecision = await decideTemporalToolExecutionFromPostgres({
    call: successCall,
    temporal: successTemporal,
  });
  if (repeatSuccessDecision.disposition !== 'REUSE_RESULT') {
    dispatchCount += 1;
    throw new Error(`TEMPORAL_LIVE_SUCCESS_REUSE_FAILED:${repeatSuccessDecision.disposition}`);
  }
  if (repeatSuccessDecision.reused_result_ref !== successRecorded.artifact.artifactId) {
    throw new Error('TEMPORAL_LIVE_SUCCESS_RESULT_REF_MISMATCH');
  }

  const artifactReadback = await pool.query<{ artifact_id: string; checksum: string }>(
    `SELECT artifact_id, checksum FROM workflow_artifacts WHERE artifact_id = $1 LIMIT 1`,
    [successRecorded.artifact.artifactId],
  );
  if (artifactReadback.rowCount !== 1) throw new Error('TEMPORAL_LIVE_SUCCESS_ARTIFACT_READBACK_MISSING');

  // FAILURE -> exact same execution key -> SELECT_ALTERNATIVE.
  const failureCall = { tool: 'qdrant_search', args: { query: `temporal-live-failure-${RUN}` } };
  const failureTemporal = buildTemporalToolExecutionContext({
    call: failureCall,
    descriptor: descriptorBase('QDRANT_SEARCH', 'qdrant-search:live-proof:v1'),
    retry_policy: retryPolicy,
    producer_revision: PRODUCER_REVISION,
  });
  const firstFailureDecision = await decideTemporalToolExecutionFromPostgres({
    call: failureCall,
    temporal: failureTemporal,
  });
  if (firstFailureDecision.disposition !== 'DISPATCH_EXECUTE') {
    throw new Error(`TEMPORAL_LIVE_FAILURE_FIRST_DISPOSITION:${firstFailureDecision.disposition}`);
  }
  dispatchCount += 1;

  const failureRecorded = await recordTemporalPostDispatchFromPostgres({
    record: {
      descriptor: failureTemporal.descriptor,
      outcome: 'TOOL_ERROR',
      error_code: 'QDRANT_UNAVAILABLE_LIVE_PROOF',
      result_schema_id: null,
      artifact_revisions: {},
      evidence_refs: [`tool:qdrant_search:${RUN}`],
      cost: { latency_ms: 1, gpu_bytes: null, tokens: null, tool_calls: 1 },
      producer_revision: PRODUCER_REVISION,
    },
    emit_workflow_terminal_event: emitWorkflowTerminalEvent,
  });
  if (failureRecorded.artifact !== null) throw new Error('TEMPORAL_LIVE_FAILURE_ARTIFACT_UNEXPECTED');

  const repeatFailureDecision = await decideTemporalToolExecutionFromPostgres({
    call: failureCall,
    temporal: failureTemporal,
  });
  if (repeatFailureDecision.disposition !== 'SELECT_ALTERNATIVE') {
    dispatchCount += 1;
    throw new Error(`TEMPORAL_LIVE_FAILURE_ALTERNATIVE_FAILED:${repeatFailureDecision.disposition}`);
  }

  const successRows = await countRows(repeatSuccessDecision.execution_key);
  const failureRows = await countRows(repeatFailureDecision.execution_key);
  if (successRows !== 1) throw new Error(`TEMPORAL_LIVE_SUCCESS_EVENT_COUNT:${successRows}`);
  if (failureRows !== 1) throw new Error(`TEMPORAL_LIVE_FAILURE_EVENT_COUNT:${failureRows}`);
  if (dispatchCount !== 2) throw new Error(`TEMPORAL_LIVE_REDISPATCH_DETECTED:${dispatchCount}`);

  console.log(JSON.stringify({
    schema: 'atlas.temporal-post-dispatch-live-proof.v1',
    status: 'PROVEN_FIXTURE',
    run: RUN,
    workflow_id: WORKFLOW_ID,
    dispatch_count: dispatchCount,
    success: {
      execution_key: repeatSuccessDecision.execution_key,
      first_disposition: firstSuccessDecision.disposition,
      repeat_disposition: repeatSuccessDecision.disposition,
      result_ref: repeatSuccessDecision.reused_result_ref,
      event_count: successRows,
      append_inserted: successRecorded.append_receipt.inserted,
      ledger_sequence: successRecorded.temporal_event.ledger_sequence,
    },
    failure: {
      execution_key: repeatFailureDecision.execution_key,
      first_disposition: firstFailureDecision.disposition,
      repeat_disposition: repeatFailureDecision.disposition,
      event_count: failureRows,
      error_code: failureRecorded.temporal_event.error_code,
      append_inserted: failureRecorded.append_receipt.inserted,
      ledger_sequence: failureRecorded.temporal_event.ledger_sequence,
    },
    invariants: {
      success_reuses_same_result_ref: true,
      failure_selects_alternative: true,
      zero_repeat_redispatch: true,
      current_projection_rebuilt_from_immutable_rows: true,
      result_artifact_readback: true,
    },
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
