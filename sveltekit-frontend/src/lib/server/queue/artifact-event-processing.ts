import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';
import { verifyArtifactMaterialization } from './artifact-materialization-verification.js';
import type {
  ArtifactFailedEventV1,
  ArtifactMaterializedEventV1,
} from './event-fabric.js';

export type ArtifactLifecycleEventV1 = ArtifactMaterializedEventV1 | ArtifactFailedEventV1;
export type ArtifactFailureDispositionV1 = 'RETRY' | 'SELECT_ALTERNATIVE' | 'STOP';

function numberFromMetadata(value: unknown, fallback = 0): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

/**
 * Queue failure handling is a deterministic projection, not a new action owner.
 * A retryable failure remains retryable only while its declared retry budget
 * has not been exhausted. Permanent/revision/identity failures prefer an
 * alternate plan; policy/schema failures stop rather than looping forever.
 */
export function classifyArtifactFailureDisposition(
  event: ArtifactFailedEventV1,
): ArtifactFailureDispositionV1 {
  const retryCount = numberFromMetadata(event.payload.metadata?.retryCount);
  const retryBudget = numberFromMetadata(event.payload.metadata?.retryBudget);

  if (event.payload.retryable && retryCount < retryBudget) return 'RETRY';

  switch (event.payload.failureClass) {
    case 'SCHEMA_REJECTED':
    case 'POLICY_REJECTED':
    case 'TOOL_PERMISSION':
      return 'STOP';
    default:
      return 'SELECT_ALTERNATIVE';
  }
}

async function lifecycleProjectionPayload(event: ArtifactLifecycleEventV1): Promise<Record<string, unknown>> {
  if (event.eventType === 'artifact.failed') {
    return {
      ...event.payload,
      projection: {
        schema: 'atlas.artifact-failure-projection.v1',
        disposition: classifyArtifactFailureDisposition(event),
        retryCount: numberFromMetadata(event.payload.metadata?.retryCount),
        retryBudget: numberFromMetadata(event.payload.metadata?.retryBudget),
      },
    };
  }

  const verification = await verifyArtifactMaterialization({
    actionKey: event.payload.actionKey,
    producerRevision: event.payload.producerRevision,
    artifact: event.payload.artifact,
  });
  if (verification.status !== 'PROVEN') {
    throw new Error(
      `ARTIFACT_MATERIALIZATION_NOT_PROVEN:${verification.reason ?? verification.status}`,
    );
  }

  return {
    ...event.payload,
    verification,
  };
}

/**
 * Durable, replay-safe projection for artifact lifecycle notifications.
 * Postgres remains canonical; RabbitMQ delivery may repeat, so eventId is the
 * idempotency boundary and duplicate deliveries become ON CONFLICT no-ops.
 *
 * A materialized event is not accepted merely because a path exists: file-backed
 * artifacts must pass byte/checksum verification before the event is projected.
 */
export async function persistArtifactLifecycleEvent(
  event: ArtifactLifecycleEventV1,
): Promise<{ inserted: boolean }> {
  const artifactId =
    event.eventType === 'artifact.materialized' ? event.payload.artifact.artifactId : null;
  const payload = await lifecycleProjectionPayload(event);

  const result = await db.execute<{ event_id: string }>(sql`
    INSERT INTO workflow_artifact_events (
      event_id, event_type, action_key, artifact_id, payload, occurred_at, projected_at
    ) VALUES (
      ${event.eventId}::uuid,
      ${event.eventType},
      ${event.payload.actionKey},
      ${artifactId},
      ${JSON.stringify(payload)}::jsonb,
      ${event.occurredAt}::timestamptz,
      NOW()
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `);

  return { inserted: Boolean(result.rows?.[0]) };
}
