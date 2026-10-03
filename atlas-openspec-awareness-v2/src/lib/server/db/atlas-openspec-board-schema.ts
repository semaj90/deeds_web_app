import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Optional PostgreSQL history projection for the OpenSpec board.
 * IMPORTANT: docs/reports receipts remain current authority. This table is
 * deliberately summary/history only and must never decide task executability.
 */
export const atlasOpenSpecBoardSnapshots = pgTable(
  'atlas_openspec_board_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    semanticChecksum: text('semantic_checksum').notNull(),
    workspaceRevision: text('workspace_revision'),
    source: text('source').notNull().default('openspec-execution-controller'),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
    topicCounts: jsonb('topic_counts').$type<Record<string, number>>().notNull().default({}),
    blockerCounts: jsonb('blocker_counts').$type<Record<string, number>>().notNull().default({}),
    reportRefs: jsonb('report_refs').$type<Array<Record<string, unknown>>>().notNull().default([]),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    checksumUq: uniqueIndex('atlas_openspec_board_snapshots_checksum_uq').on(table.semanticChecksum),
    capturedIdx: index('atlas_openspec_board_snapshots_captured_idx').on(table.capturedAt)
  })
);
