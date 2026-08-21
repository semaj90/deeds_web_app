import { z } from 'zod';

import {
  actionExecutionDescriptorSchema,
  actionOutcomeSchema,
  adaptWorkflowActionEventToTemporalHistory,
  createTemporalActionPostgresRepository,
  isSuccessfulOutcome,
  type ActionExecutionDescriptorV1,
  type ActionOutcomeV1,
  type AgentActionEventV1,
  type TemporalActionAppendReceiptV1,
  type TemporalActionSequenceReservationReceiptV1,
} from '@deeds/parent-atlas';
import {
  workflowActionEventSchema,
  type WorkflowActionEventV1,
} from '@deeds/parent-atlas/core/workflow-action-event';
import { pool } from '$lib/server/db/client.js';
import {
  artifactAddressSchema,
  type ArtifactAddressV1,
} from '$lib/server/queue/artifact-work-item-v1.js';
import { materializePostgresJsonArtifact } from '$lib/server/queue/postgres-json-artifact-v1.js';

const id = z.string().min(1);

export const temporalPostDispatchCostSchema = z.object({
  latency_ms: z.number().finite().nonnegative().nullable().default(null),
  gpu_bytes: z.number().int().nonnegative().nullable().default(null),
  tokens: z.number().int().nonnegative().nullable().default(null),
  tool_calls: z.number().int().nonnegative().nullable().default(null),
}).strict().default({ latency_ms: null, gpu_bytes: null, tokens: null, tool_calls: null });

export const temporalPostDispatchRecordInputSchema = z.object({
  descriptor: actionExecutionDescriptorSchema,
  outcome: actionOutcomeSchema,
  result_payload: z.unknown().optional(),
  result_schema_id: id.nullable().default(null),
  artifact_revisions: z.record(z.string(), id).default({}),
  error_code: id.nullable().default(null),
  evidence_refs: z.array(id).default([]),
  cost: temporalPostDispatchCostSchema,
  producer_revision: id,
}).strict().superRefine((value, ctx) => {
  const success = isSuccessfulOutcome(value.outcome);
  if (success && value.result_payload === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['result_payload'], message: 'successful dispatch requires a result payload' });
  }
  if (success && !value.result_schema_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['result_schema_id'], message: 'successful dispatch requires result_schema_id' });
  }
  if (success && Object.keys(value.artifact_revisions).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifact_revisions'], message: 'successful dispatch artifact requires explicit revision metadata' });
  }
  if (!success && !value.error_code) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error_code'], message: 'failed dispatch requires explicit error_code' });
  }
});

export type TemporalPostDispatchRecordInputV1 = z.infer<typeof temporalPostDispatchRecordInputSchema>;

export type WorkflowTerminalEventRequestV1 = {
  descriptor: ActionExecutionDescriptorV1;
  outcome: ActionOutcomeV1;
  terminal_kind: 'completed' | 'failed';
  result_artifact: ArtifactAddressV1 | null;
  error_code: string | null;
  evidence_refs: string[];
};

/**
 * This callback is deliberately the workflow identity authority. The temporal
 * recorder may request a terminal event, but it cannot mint workflowId,
 * workflowRevision, actionId, workflow sequence, receiptId, or dagNodeId.
 */
export type WorkflowTerminalEventEmitter = (
  request: WorkflowTerminalEventRequestV1,
) => Promise<WorkflowActionEventV1> | WorkflowActionEventV1;

export type TemporalPostDispatchRecorderDeps = {
  materialize_result: (input: {
    schemaId: string;
    payload: unknown;
    revisions: Record<string, string>;
  }) => Promise<ArtifactAddressV1>;
  emit_workflow_terminal_event: WorkflowTerminalEventEmitter;
  reserve_ledger_sequence: (producerRevision: string) => Promise<TemporalActionSequenceReservationReceiptV1>;
  append_temporal_event: (
    event: AgentActionEventV1,
    producerRevision: string,
  ) => Promise<TemporalActionAppendReceiptV1>;
};

export type TemporalPostDispatchRecordResultV1 = {
  artifact: ArtifactAddressV1 | null;
  workflow_event: WorkflowActionEventV1;
  sequence_reservation: TemporalActionSequenceReservationReceiptV1;
  temporal_event: AgentActionEventV1;
  append_receipt: TemporalActionAppendReceiptV1;
};

function assertWorkflowTerminalOwnership(input: {
  event: WorkflowActionEventV1;
  success: boolean;
  artifact: ArtifactAddressV1 | null;
  errorCode: string | null;
}): void {
  const { event, success, artifact, errorCode } = input;
  if (success) {
    if (event.kind !== 'completed') {
      throw new Error(`TEMPORAL_WORKFLOW_TERMINAL_KIND_MISMATCH:expected=completed:actual=${event.kind}`);
    }
    if (!artifact) throw new Error('TEMPORAL_SUCCESS_ARTIFACT_MISSING');
    if (!event.artifactRefs.includes(artifact.artifactId)) {
      throw new Error(`TEMPORAL_WORKFLOW_ARTIFACT_REF_MISSING:${artifact.artifactId}`);
    }
  } else {
    if (event.kind !== 'failed') {
      throw new Error(`TEMPORAL_WORKFLOW_TERMINAL_KIND_MISMATCH:expected=failed:actual=${event.kind}`);
    }
    if (!event.errorCode || event.errorCode !== errorCode) {
      throw new Error('TEMPORAL_WORKFLOW_ERROR_CODE_MISMATCH');
    }
  }
}

/**
 * Closes the post-dispatch half of Parent Atlas temporal memory without taking
 * ownership of workflow identity or result storage.
 *
 * Order is intentional:
 *   successful tool result -> canonical artifact -> workflow-owned terminal event
 *   -> storage-owned ledger sequence -> temporal adaptation -> append/readback.
 *
 * ActionOutcomeV1 is always supplied explicitly by the caller. Neither MCP
 * success booleans nor workflow completion are allowed to manufacture it.
 */
export async function recordTemporalPostDispatch(
  raw: z.input<typeof temporalPostDispatchRecordInputSchema>,
  deps: TemporalPostDispatchRecorderDeps,
): Promise<TemporalPostDispatchRecordResultV1> {
  const input = temporalPostDispatchRecordInputSchema.parse(raw);
  const descriptor = actionExecutionDescriptorSchema.parse(input.descriptor);
  const success = isSuccessfulOutcome(input.outcome);

  const artifact = success
    ? artifactAddressSchema.parse(await deps.materialize_result({
        schemaId: input.result_schema_id!,
        payload: input.result_payload,
        revisions: input.artifact_revisions,
      }))
    : null;

  const workflowEvent = workflowActionEventSchema.parse(await deps.emit_workflow_terminal_event({
    descriptor,
    outcome: input.outcome,
    terminal_kind: success ? 'completed' : 'failed',
    result_artifact: artifact,
    error_code: input.error_code,
    evidence_refs: input.evidence_refs,
  }));

  assertWorkflowTerminalOwnership({
    event: workflowEvent,
    success,
    artifact,
    errorCode: input.error_code,
  });

  const sequenceReservation = await deps.reserve_ledger_sequence(input.producer_revision);
  const temporalEvent = adaptWorkflowActionEventToTemporalHistory({
    workflow_event: workflowEvent,
    ledger_sequence: sequenceReservation.ledger_sequence,
    descriptor,
    outcome: input.outcome,
    result_ref: artifact?.artifactId ?? null,
    error_code: input.error_code,
    evidence_refs: input.evidence_refs,
    artifact_refs: artifact ? [artifact.artifactId] : [],
    cost: input.cost,
    producer_revision: input.producer_revision,
  });
  const appendReceipt = await deps.append_temporal_event(temporalEvent, input.producer_revision);

  if (appendReceipt.event_id !== temporalEvent.event_id || appendReceipt.event_checksum !== temporalEvent.event_checksum) {
    throw new Error(`TEMPORAL_POST_DISPATCH_APPEND_READBACK_MISMATCH:${temporalEvent.event_id}`);
  }

  return {
    artifact,
    workflow_event: workflowEvent,
    sequence_reservation: sequenceReservation,
    temporal_event: temporalEvent,
    append_receipt: appendReceipt,
  };
}

/**
 * Live persistence wrapper. Workflow identity still comes from the injected
 * emitter; this function only binds the already-owned Postgres artifact store
 * and append-only temporal repository.
 *
 * Do not enable this path until both manual temporal migrations are applied in
 * the target environment and their readback proof gates pass.
 */
export async function recordTemporalPostDispatchFromPostgres(input: {
  record: z.input<typeof temporalPostDispatchRecordInputSchema>;
  emit_workflow_terminal_event: WorkflowTerminalEventEmitter;
}): Promise<TemporalPostDispatchRecordResultV1> {
  const repository = createTemporalActionPostgresRepository(pool);
  return recordTemporalPostDispatch(input.record, {
    materialize_result: materializePostgresJsonArtifact,
    emit_workflow_terminal_event: input.emit_workflow_terminal_event,
    reserve_ledger_sequence: (producerRevision) => repository.reserveLedgerSequence(producerRevision),
    append_temporal_event: (event, producerRevision) => repository.append(event, producerRevision),
  });
}
