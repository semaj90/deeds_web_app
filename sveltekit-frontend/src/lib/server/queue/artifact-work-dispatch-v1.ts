import { actionWorkItemSchema, type ActionWorkItemV1 } from './artifact-work-item-v1.js';
import { assertArtifactReferenceEnvelopeSize } from './message-size-policy-v1.js';
import { enqueueTask } from './outbox.js';

/**
 * Authoritative dispatch path for Parent Atlas artifact computations.
 *
 * The large inputs live behind ArtifactAddressV1 references. This function
 * validates and size-checks the work item, then persists workflow_task +
 * workflow_outbox before RabbitMQ sees the command. Never route artifact work
 * through the generic fire-and-forget rabbitmq-client helper.
 */
export async function enqueueArtifactWorkItem(opts: {
  runId: string;
  requestId: string;
  traceId?: string;
  capability: string;
  targetWorkerClass: string;
  item: ActionWorkItemV1;
}): Promise<{ taskId: string; commandId: string; idempotencyKey: string }> {
  const item = actionWorkItemSchema.parse(opts.item);
  assertArtifactReferenceEnvelopeSize(item);

  return enqueueTask({
    runId: opts.runId,
    requestId: opts.requestId,
    traceId: opts.traceId,
    commandType: item.commandType,
    capability: opts.capability,
    targetWorkerClass: opts.targetWorkerClass,
    payload: item,
    timeoutMs: item.budget.timeoutMs,
  });
}
