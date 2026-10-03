import { sql } from 'drizzle-orm';
import { bigint, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Drizzle mirror for drizzle/manual/20260916_workspace_event_head_v1.sql.
 *
 * The SQL sidecar remains the migration authority. These definitions make the
 * existing canonical schema barrel aware of the event-sourced workspace head
 * without applying the sidecar or creating a second storage owner.
 */
export const atlasWorkspaceEvents = pgTable('atlas_workspace_events', {
  eventId: uuid('event_id').primaryKey().notNull(),
  workspaceId: text('workspace_id').notNull(),
  sequence: bigint('sequence', { mode: 'bigint' }).notNull(),
  baseSnapshotRevision: text('base_snapshot_revision').notNull(),
  previousHeadRevision: text('previous_head_revision').notNull(),
  workspaceHeadRevision: text('workspace_head_revision').notNull(),
  deltaRootChecksum: text('delta_root_checksum').notNull(),
  eventType: text('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
  correlationId: uuid('correlation_id').notNull(),
  causationId: uuid('causation_id'),
  producerRevision: text('producer_revision').notNull(),
  beforeStateChecksum: text('before_state_checksum'),
  afterStateChecksum: text('after_state_checksum').notNull(),
  eventChecksum: text('event_checksum').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  workspaceSequenceUnique: unique('atlas_workspace_events_workspace_snapshot_sequence_key').on(
    table.workspaceId,
    table.baseSnapshotRevision,
    table.sequence,
  ),
  eventChecksumUnique: unique('atlas_workspace_events_event_checksum_key').on(table.eventChecksum),
  workspaceSequenceIdx: index('atlas_workspace_events_workspace_sequence_idx').on(
    table.workspaceId,
    table.baseSnapshotRevision,
    table.sequence,
  ),
}));

export const atlasWorkspaceEventParticipants = pgTable('atlas_workspace_event_participants', {
  eventId: uuid('event_id').notNull(),
  participantOrdinal: integer('participant_ordinal').notNull(),
  role: text('role').notNull(),
  canonicalId: text('canonical_id').notNull(),
  revision: text('revision'),
  relation: text('relation').notNull(),
}, (table) => ({
  participantPk: primaryKey({ columns: [table.eventId, table.participantOrdinal] }),
  eventFk: foreignKey({
    columns: [table.eventId],
    foreignColumns: [atlasWorkspaceEvents.eventId],
    name: 'atlas_workspace_event_participants_event_id_fkey',
  }),
  canonicalIdx: index('atlas_workspace_event_participants_canonical_idx').on(
    table.canonicalId,
    table.role,
    table.relation,
  ),
}));

export const atlasWorkspaceHeads = pgTable('atlas_workspace_heads', {
  workspaceId: text('workspace_id').primaryKey().notNull(),
  baseSnapshotRevision: text('base_snapshot_revision').notNull(),
  lastEventSequence: bigint('last_event_sequence', { mode: 'bigint' }).notNull().default(0n),
  lastEventId: uuid('last_event_id'),
  lastEventChecksum: text('last_event_checksum'),
  deltaRootChecksum: text('delta_root_checksum').notNull(),
  eventCountSinceSnapshot: integer('event_count_since_snapshot').notNull().default(0),
  changedSourceCount: integer('changed_source_count').notNull().default(0),
  workspaceHeadRevision: text('workspace_head_revision').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  lastEventFk: foreignKey({
    columns: [table.lastEventId],
    foreignColumns: [atlasWorkspaceEvents.eventId],
    name: 'atlas_workspace_heads_last_event_id_fkey',
  }).onDelete('restrict'),
}));

export type AtlasWorkspaceEvent = typeof atlasWorkspaceEvents.$inferSelect;
export type NewAtlasWorkspaceEvent = typeof atlasWorkspaceEvents.$inferInsert;
export type AtlasWorkspaceEventParticipant = typeof atlasWorkspaceEventParticipants.$inferSelect;
export type NewAtlasWorkspaceEventParticipant = typeof atlasWorkspaceEventParticipants.$inferInsert;
export type AtlasWorkspaceHead = typeof atlasWorkspaceHeads.$inferSelect;
export type NewAtlasWorkspaceHead = typeof atlasWorkspaceHeads.$inferInsert;

export const atlasWorkspaceEventSchemaMirror = {
  tables: ['atlas_workspace_events', 'atlas_workspace_event_participants', 'atlas_workspace_heads'] as const,
  migration: 'manual/20260916_workspace_event_head_v1.sql',
  applied: false as const,
  writesPerformed: false as const,
  checksumExpression: sql`sha256 canonical event checksums remain owned by the runtime contract`,
};
