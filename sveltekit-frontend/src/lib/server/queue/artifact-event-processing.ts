import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';
import type {
  ArtifactFailedEventV1,
  ArtifactMaterializedEventV1,
} from './event-fabric.js';

export type ArtifactLifecycleEventV1 = ArtifactMaterializedEventV1 | ArtifactFailedEventV1;

/**
 * Durable, replay-safe projection for artifact lifecycle notifications.
 * Postgres remains canonical; RabbitMQ delivery may repeat, so eventId is the
 * idempotency boundary and duplicate deliveries become ON CONFLICT no-ops.
 */
export async function persistArtifactLifecycleEvent(
  event: ArtifactLifecycleEventV1,
): Promise<{ inserted: boolean }> {
  const artifactId =
    event.eventType === 'artifact.materialized' ? event.payload.artifact.artifactId : null;

  const result = await db.execute<{ event_id: string }>(sql`
    INSERT INTO workflow_artifact_events (
      event_id, event_type, action_key, artifact_id, payload, occurred_at, projected_at
    ) VALUES (
      ${event.eventId}::uuid,
      ${event.eventType},
      ${event.payload.actionKey},
      ${artifactId},
      ${JSON.stringify(event.payload)}::jsonb,
      ${event.occurredAt}::timestamptz,
      NOW()
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `);

  return { inserted: Boolean(result.rows?.[0]) };
}
