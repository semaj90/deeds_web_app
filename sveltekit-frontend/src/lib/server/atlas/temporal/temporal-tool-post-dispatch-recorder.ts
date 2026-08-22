import {
  actionOutcomeSchema,
  adaptWorkflowActionEventToTemporalHistory,
  createTemporalActionPostgresRepository,
  reserveTemporalActionLedgerSequence,
  workflowActionEventSchema,
  type ActionExecutionDescriptorV1,
  type ActionOutcomeV1,
  type AgentActionEventV1,
  type TemporalActionAppendReceiptV1,
  type WorkflowActionEventV1,
} from '@deeds/parent-atlas';

import { materializePostgresJsonArtifact } from '$lib/server/queue/postgres-json-artifact-v1.js';
import type { ArtifactAddressV1 } from '$lib/server/queue/artifact-work-item-v1.js';

export type TemporalPostDispatchRecordV1 = {
  event: AgentActionEventV1;
  append_receipt: TemporalActionAppendReceiptV1;
  result_artifact: ArtifactAddressV1 | null;
};

export type TemporalPostDispatchRecorderDeps = {
  reserveSequence: (producerRevision: string) => Promise<number>;
  materializeResult: (input: {
    schemaId: string;
    payload: unknown;
    revisions: Record<string, string>;
  }) => Promise<ArtifactAddressV1>;
  appendEvent: (
    event: AgentActionEventV1,
    producerRevision: string,
  ) => Promise<TemporalActionAppendReceiptV1>;
};

/**
 * Records an already-executed tool action without acquiring any identity authority.
 *
 * - WorkflowActionEventV1 supplies workflow/action identity.
 * - ActionExecutionDescriptorV1 supplies deterministic execution identity.
 * - workflow_artifacts supplies immutable result materialization.
 * - the temporal ledger only appends observed execution history.
 *
 * The caller MUST provide ActionOutcomeV1 explicitly. Transport/tool return shape is
 * never interpreted as SUCCESS_EXACT.
 */
export async function recordTemporalToolDispatchOutcome(input: {
  workflow_event: WorkflowActionEventV1;
  descriptor: ActionExecutionDescriptorV1;
  outcome: ActionOutcomeV1;
  tool_result?: unknown;
  error_code?: string | null;
  evidence_refs?: string[];
  producer_revision: string;
  result_schema_id?: string;
  result_revisions?: Record<string, string>;
  deps: TemporalPostDispatchRecorderDeps;
}): Promise<TemporalPostDispatchRecordV1> {
  const workflowEvent = workflowActionEventSchema.parse(input.workflow_event);
  const outcome = actionOutcomeSchema.parse(input.outcome);
  const successful = outcome === 'SUCCESS_EXACT' || outcome === 'SUCCESS_PARTIAL' || outcome === 'CACHE_HIT';

  if (workflowEvent.kind === 'completed' && !successful) {
    throw new Error(`TEMPORAL_COMPLETED_EVENT_REQUIRES_SUCCESS_OUTCOME:${outcome}`);
  }
  if (workflowEvent.kind === 'failed' && successful) {
    throw new Error(`TEMPORAL_FAILED_EVENT_CANNOT_CARRY_SUCCESS_OUTCOME:${outcome}`);
  }
  if (successful && input.tool_result === undefined) {
    throw new Error('TEMPORAL_SUCCESS_RESULT_REQUIRED');
  }

  const resultArtifact = successful
    ? await input.deps.materializeResult({
        schemaId: input.result_schema_id ?? 'atlas.temporal-tool-result.v1',
        payload: input.tool_result,
        revisions: {
          execution: input.descriptor.implementation_revision,
          parameters: input.descriptor.parameter_revision,
          producer: input.producer_revision,
          ...(input.result_revisions ?? {}),
        },
      })
    : null;

  const ledgerSequence = await input.deps.reserveSequence(input.producer_revision);
  const event = adaptWorkflowActionEventToTemporalHistory({
    workflow_event: workflowEvent,
    ledger_sequence: ledgerSequence,
    descriptor: input.descriptor,
    outcome,
    result_ref: resultArtifact?.artifactId ?? null,
    error_code: input.error_code ?? workflowEvent.errorCode ?? null,
    evidence_refs: input.evidence_refs ?? [],
    artifact_refs: resultArtifact ? [resultArtifact.artifactId] : [],
    producer_revision: input.producer_revision,
  });

  const appendReceipt = await input.deps.appendEvent(event, input.producer_revision);
  return {
    event,
    append_receipt: appendReceipt,
    result_artifact: resultArtifact,
  };
}

export async function recordTemporalToolDispatchOutcomeFromPostgres(input: Omit<
  Parameters<typeof recordTemporalToolDispatchOutcome>[0],
  'deps'
>): Promise<TemporalPostDispatchRecordV1> {
  const { pool } = await import('$lib/server/db/client.js');
  const repository = createTemporalActionPostgresRepository(pool);
  return recordTemporalToolDispatchOutcome({
    ...input,
    deps: {
      reserveSequence: async (producerRevision) =>
        (await reserveTemporalActionLedgerSequence(pool, producerRevision)).ledger_sequence,
      materializeResult: materializePostgresJsonArtifact,
      appendEvent: (event, producerRevision) => repository.append(event, producerRevision),
    },
  });
}
