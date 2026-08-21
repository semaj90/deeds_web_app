import {
  artifactFailedPayloadSchema,
  artifactMaterializedPayloadSchema,
  type ArtifactFailedPayloadV1,
  type ArtifactMaterializedPayloadV1,
} from './event-fabric.js';
import { writeIntegrationEventOutboxRow } from './outbox.js';
import { EVENT_ROUTING_KEYS } from './topology.js';

type Transaction = Parameters<typeof writeIntegrationEventOutboxRow>[0];

export async function writeArtifactMaterializedOutboxRow(
  tx: Transaction,
  opts: {
    runId: string;
    payload: ArtifactMaterializedPayloadV1;
    traceId?: string;
    sourceRef?: string;
  },
): Promise<{ eventId: string }> {
  const payload = artifactMaterializedPayloadSchema.parse(opts.payload);
  return writeIntegrationEventOutboxRow(tx, {
    runId: opts.runId,
    eventType: 'artifact.materialized',
    routingKey: EVENT_ROUTING_KEYS.artifactMaterialized,
    payload,
    traceId: opts.traceId,
    sourceRef: opts.sourceRef,
  });
}

export async function writeArtifactFailedOutboxRow(
  tx: Transaction,
  opts: {
    runId: string;
    payload: ArtifactFailedPayloadV1;
    traceId?: string;
    sourceRef?: string;
  },
): Promise<{ eventId: string }> {
  const payload = artifactFailedPayloadSchema.parse(opts.payload);
  return writeIntegrationEventOutboxRow(tx, {
    runId: opts.runId,
    eventType: 'artifact.failed',
    routingKey: EVENT_ROUTING_KEYS.artifactFailed,
    payload,
    traceId: opts.traceId,
    sourceRef: opts.sourceRef,
  });
}
