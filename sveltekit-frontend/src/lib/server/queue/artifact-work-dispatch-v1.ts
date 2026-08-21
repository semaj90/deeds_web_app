import { actionWorkItemSchema, type ActionWorkItemV1 } from './artifact-work-item-v1.js';
import { enqueueTask } from './outbox.js';
import { emit, makeEvent } from '$lib/server/analytics/analytics-sink.js';

/**
 * Policy limit, not a RabbitMQ protocol maximum. Artifact work should carry
 * references and compact control metadata; larger payloads must be
 * materialized first and referenced by ArtifactAddressV1.
 */
export const ARTIFACT_WORK_ENVELOPE_MAX_BYTES = 64 * 1024;

export function artifactWorkEnvelopeBytes(item: ActionWorkItemV1): number {
  return Buffer.byteLength(JSON.stringify(item), 'utf8');
}

function emitEnvelopeTelemetry(opts: {
  traceId?: string;
  actionKey: string;
  byteLength: number;
  accepted: boolean;
}): void {
  emit(makeEvent({
    eventType: 'lane.result',
    traceId: opts.traceId ?? `artifact-envelope:${opts.actionKey}`,
    laneId: 'queue.artifact.envelope',
    metadata: {
      actionKey: opts.actionKey,
      byteLength: opts.byteLength,
      maxBytes: ARTIFACT_WORK_ENVELOPE_MAX_BYTES,
      accepted: opts.accepted,
      policy: 'artifact-references-only-v1',
    },
  }));
}

/**
 * Authoritative dispatch path for Parent Atlas artifact computations.
 *
 * The large inputs live behind ArtifactAddressV1 references. This function
 * validates the work item, enforces the compact-envelope policy, then persists
 * workflow_task + workflow_outbox before RabbitMQ sees the command. Never
 * route artifact work through the generic fire-and-forget rabbitmq helper.
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
  const byteLength = artifactWorkEnvelopeBytes(item);
  const accepted = byteLength <= ARTIFACT_WORK_ENVELOPE_MAX_BYTES;

  emitEnvelopeTelemetry({
    traceId: opts.traceId,
    actionKey: item.actionKey,
    byteLength,
    accepted,
  });

  if (!accepted) {
    throw new Error(
      `Artifact work envelope ${byteLength} bytes exceeds policy limit ` +
      `${ARTIFACT_WORK_ENVELOPE_MAX_BYTES}; materialize large inputs and pass ArtifactAddressV1 references`,
    );
  }

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
