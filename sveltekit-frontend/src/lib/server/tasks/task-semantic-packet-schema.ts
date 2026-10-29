import { sql } from 'drizzle-orm';
import { db, pgRows } from '$lib/server/db/client.js';

const taskSemanticPacketInsertColumns = [
  'point_kind', 'packet_key', 'qdrant_point_id', 'workspace_id', 'workspace_task_id',
  'feature_id', 'alias_id', 'source_ref', 'file_path', 'semantic_path',
  'related_feature_ids', 'related_task_ids', 'related_file_paths', 'cluster_id',
  'centroid_id', 'parent_centroid_id', 'summary_llm', 'summary_model', 'metadata',
  'next_action', 'summary_hash', 'confidence', 'status', 'agent_pickup_ready',
  'observed_at', 'valid_from', 'valid_to', 'created_at', 'updated_at', 'deleted',
] as const;

export async function assertTaskSemanticPacketSchemaCompatible(
  insertColumnNames: readonly string[] = taskSemanticPacketInsertColumns,
  nullValueColumnNames: readonly string[] = [],
): Promise<void> {
  const rows = await db.execute(sql`
    SELECT column_name, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_semantic_packets'
  `);
  const columns = pgRows<{
    column_name: string;
    is_nullable?: string;
    column_default?: string | null;
    is_identity?: string;
    is_generated?: string;
  }>(rows);
  const present = new Set(columns.map((row) => row.column_name));
  const missing = insertColumnNames.filter((column) => !present.has(column));
  const insertColumns = new Set(insertColumnNames);
  const nullValueColumns = new Set(nullValueColumnNames);
  const unprovidedRequired = columns
    .filter((column) =>
      column.is_nullable === 'NO'
      && column.column_default == null
      && column.is_identity !== 'YES'
      && column.is_generated !== 'ALWAYS'
      && (!insertColumns.has(column.column_name) || nullValueColumns.has(column.column_name)),
    )
    .map((column) => column.column_name);
  if (missing.length > 0 || unprovidedRequired.length > 0) {
    throw new Error(
      `TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE: missing=${missing.join(',')}; `
      + `unprovided_required=${unprovidedRequired.join(',')}; `
      + 'workflow blocked before Qdrant or PostgreSQL writes',
    );
  }
}
