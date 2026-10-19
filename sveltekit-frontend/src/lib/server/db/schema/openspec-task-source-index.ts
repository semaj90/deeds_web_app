import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const openspecTaskSourceSnapshotsV1 = pgTable('openspec_task_source_snapshots_v1', {
  snapshotId: text('snapshot_id').primaryKey(),
  workspaceRevision: text('workspace_revision').notNull(),
  inputChecksum: text('input_checksum').notNull(),
  sourceRowCount: integer('source_row_count').notNull(),
  snapshotStatus: text('snapshot_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const openspecTaskSourceIndexV1 = pgTable(
  'openspec_task_source_index_v1',
  {
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => openspecTaskSourceSnapshotsV1.snapshotId),
    sourceRef: text('source_ref').notNull(),
    changeId: text('change_id').notNull(),
    sourceLine: integer('source_line').notNull(),
    taskText: text('task_text').notNull(),
    taskHash: text('task_hash').notNull(),
    taskStatus: text('task_status').notNull(),
    identityStatus: text('identity_status').notNull(),
    canonicalTaskKeyCandidate: text('canonical_task_key_candidate'),
    archived: boolean('archived').notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.snapshotId, table.sourceRef] }),
    sourceRefIdx: index('openspec_task_source_index_v1_source_ref_idx').on(table.sourceRef, table.snapshotId),
    snapshotChangeIdx: index('openspec_task_source_index_v1_snapshot_change_idx').on(
      table.snapshotId,
      table.changeId,
      table.sourceLine,
    ),
  }),
);
