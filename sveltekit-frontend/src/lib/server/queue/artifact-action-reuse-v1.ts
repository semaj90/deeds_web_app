import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import {
  artifactWorkResultSchema,
  type ArtifactWorkResultV1,
} from './artifact-work-item-v1.js';

export type ReusableArtifactActionV1 = {
  taskId: string;
  completedAt: Date | null;
  result: ArtifactWorkResultV1;
};

/**
 * Reuse only a succeeded workflow task whose action/revision identity matches
 * exactly and whose result still validates as ArtifactWorkResultV1.
 */
export async function findReusableArtifactAction(opts: {
  actionKey: string;
  revisionSetHash: string;
}): Promise<ReusableArtifactActionV1 | null> {
  const rows = await db.execute(sql`
    SELECT id, result, completed_at
    FROM workflow_tasks
    WHERE status = 'succeeded'
      AND payload->>'actionKey' = ${opts.actionKey}
      AND payload->>'requiredRevisionSetHash' = ${opts.revisionSetHash}
      AND result IS NOT NULL
    ORDER BY completed_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `);

  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const parsed = artifactWorkResultSchema.safeParse(row.result);
  if (!parsed.success) return null;

  if (
    parsed.data.actionKey !== opts.actionKey ||
    parsed.data.revisionSetHash !== opts.revisionSetHash
  ) {
    return null;
  }

  return {
    taskId: String(row.id),
    completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
    result: parsed.data,
  };
}
