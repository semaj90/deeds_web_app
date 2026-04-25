import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  foreignKey,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────
// route_metadata: Stores route definitions and status
// ─────────────────────────────────────────────────────────

export const routeMetadata = pgTable(
  'route_metadata',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).notNull().unique(),
    path: varchar('path', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 50 }).notNull(), // page, layout, server, endpoint
    group: varchar('group', { length: 100 }), // (app), (yorha), etc.
    status: varchar('status', { length: 50 }).notNull().default('healthy'), // healthy, flaky, broken
    priority: integer('priority').default(50),
    badges: jsonb('badges').default(sql`'[]'::jsonb`), // ["ai", "shield", "special"]
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true })
  },
  (table) => ({
    routeIdIdx: uniqueIndex('idx_route_id_unique').on(table.routeId),
    statusIdx: index('idx_status').on(table.status),
    archivedAtIdx: index('idx_archived_at').on(table.archivedAt)
  })
);

// ─────────────────────────────────────────────────────────
// error_cluster: Stores grouped errors from build tools
// ─────────────────────────────────────────────────────────

export const errorCluster = pgTable(
  'error_cluster',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).notNull(),
    tool: varchar('tool', { length: 100 }).notNull(), // svelte-check, tsc, vite, drizzle
    code: varchar('code', { length: 100 }).notNull(), // TS2345, import-type, etc.
    message: text('message').notNull(),
    severity: varchar('severity', { length: 50 }).notNull(), // error, warning, info
    count: integer('count').default(1),
    filePath: varchar('file_path', { length: 255 }),
    rawLogSnippet: text('raw_log_snippet'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true })
  },
  (table) => ({
    routeIdIdx: index('idx_error_route_id').on(table.routeId),
    severityIdx: index('idx_error_severity').on(table.severity),
    createdAtIdx: index('idx_error_created_at').on(table.createdAt),
    resolvedAtIdx: index('idx_error_resolved_at').on(table.resolvedAt),
    routeFk: foreignKey({
      columns: [table.routeId],
      foreignColumns: [routeMetadata.routeId]
    })
  })
);

// ─────────────────────────────────────────────────────────
// route_health_event: Tracks health status changes over time
// ─────────────────────────────────────────────────────────

export const routeHealthEvent = pgTable(
  'route_health_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).notNull(),
    oldStatus: varchar('old_status', { length: 50 }), // healthy, flaky, broken
    newStatus: varchar('new_status', { length: 50 }).notNull(),
    reason: varchar('reason', { length: 255 }), // error_cluster_created, error_resolved, etc.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    routeIdIdx: index('idx_health_route_id').on(table.routeId),
    createdAtIdx: index('idx_health_created_at').on(table.createdAt),
    routeFk: foreignKey({
      columns: [table.routeId],
      foreignColumns: [routeMetadata.routeId]
    })
  })
);

// ─────────────────────────────────────────────────────────
// error_brain_analysis: Stores AI analysis results
// ─────────────────────────────────────────────────────────

export const errorBrainAnalysis = pgTable(
  'error_brain_analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).notNull(),
    suggestions: jsonb('suggestions').notNull(), // Array of suggestion objects
    selectedSuggestionIndex: integer('selected_suggestion_index'),
    phase: varchar('phase', { length: 50 }), // analyzing, suggesting, applying, verifying, done, failed
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true })
  },
  (table) => ({
    routeIdIdx: index('idx_analysis_route_id').on(table.routeId),
    createdAtIdx: index('idx_analysis_created_at').on(table.createdAt),
    routeFk: foreignKey({
      columns: [table.routeId],
      foreignColumns: [routeMetadata.routeId]
    })
  })
);

// ─────────────────────────────────────────────────────────
// error_brain_patch: Stores applied patches and verification
// ─────────────────────────────────────────────────────────

export const errorBrainPatch = pgTable(
  'error_brain_patch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id').notNull(),
    routeId: varchar('route_id', { length: 255 }).notNull(),
    patchContent: text('patch_content').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    verificationStatus: varchar('verification_status', { length: 50 }), // pending, passed, failed
    verificationTimestamp: timestamp('verification_timestamp', { withTimezone: true }),
    verificationMessage: text('verification_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    analysisIdIdx: index('idx_patch_analysis_id').on(table.analysisId),
    routeIdIdx: index('idx_patch_route_id').on(table.routeId),
    verificationStatusIdx: index('idx_patch_verification_status').on(table.verificationStatus),
    analysisFk: foreignKey({
      columns: [table.analysisId],
      foreignColumns: [errorBrainAnalysis.id]
    }),
    routeFk: foreignKey({
      columns: [table.routeId],
      foreignColumns: [routeMetadata.routeId]
    })
  })
);

// ─────────────────────────────────────────────────────────
// route_interaction_log: Tracks user interactions
// ─────────────────────────────────────────────────────────

export const routeInteractionLog = pgTable(
  'route_interaction_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 255 }),
    interactionType: varchar('interaction_type', { length: 50 }).notNull(), // view, navigate, analyze, patch_apply
    metadata: jsonb('metadata'), // Additional context
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    routeIdIdx: index('idx_interaction_route_id').on(table.routeId),
    userIdIdx: index('idx_interaction_user_id').on(table.userId),
    createdAtIdx: index('idx_interaction_created_at').on(table.createdAt),
    routeFk: foreignKey({
      columns: [table.routeId],
      foreignColumns: [routeMetadata.routeId]
    })
  })
);

// ─────────────────────────────────────────────────────────
// Archive tables for data retention
// ─────────────────────────────────────────────────────────

export const errorClusterArchive = pgTable(
  'error_cluster_archive',
  {
    id: uuid('id').primaryKey(), // Keep original ID
    routeId: varchar('route_id', { length: 255 }).notNull(),
    tool: varchar('tool', { length: 100 }).notNull(),
    code: varchar('code', { length: 100 }).notNull(),
    message: text('message').notNull(),
    severity: varchar('severity', { length: 50 }).notNull(),
    count: integer('count').default(1),
    filePath: varchar('file_path', { length: 255 }),
    rawLogSnippet: text('raw_log_snippet'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    routeIdIdx: index('idx_archive_error_route_id').on(table.routeId),
    archivedAtIdx: index('idx_archive_error_archived_at').on(table.archivedAt)
  })
);

export const routeInteractionLogArchive = pgTable(
  'route_interaction_log_archive',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 255 }),
    interactionType: varchar('interaction_type', { length: 50 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    routeIdIdx: index('idx_archive_interaction_route_id').on(table.routeId),
    archivedAtIdx: index('idx_archive_interaction_archived_at').on(table.archivedAt)
  })
);

export const routeHealthEventArchive = pgTable(
  'route_health_event_archive',
  {
    id: uuid('id').primaryKey(), // Keep original ID
    routeId: varchar('route_id', { length: 255 }).notNull(),
    oldStatus: varchar('old_status', { length: 50 }),
    newStatus: varchar('new_status', { length: 50 }).notNull(),
    reason: varchar('reason', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    routeIdIdx: index('idx_archive_health_route_id').on(table.routeId),
    archivedAtIdx: index('idx_archive_health_archived_at').on(table.archivedAt)
  })
);

// ─────────────────────────────────────────────────────────
// Type exports for use in API handlers
// ─────────────────────────────────────────────────────────

export type RouteMetadata = typeof routeMetadata.$inferSelect;
export type RouteMetadataInsert = typeof routeMetadata.$inferInsert;

export type ErrorCluster = typeof errorCluster.$inferSelect;
export type ErrorClusterInsert = typeof errorCluster.$inferInsert;

export type RouteHealthEvent = typeof routeHealthEvent.$inferSelect;
export type RouteHealthEventInsert = typeof routeHealthEvent.$inferInsert;

export type ErrorBrainAnalysis = typeof errorBrainAnalysis.$inferSelect;
export type ErrorBrainAnalysisInsert = typeof errorBrainAnalysis.$inferInsert;

export type ErrorBrainPatch = typeof errorBrainPatch.$inferSelect;
export type ErrorBrainPatchInsert = typeof errorBrainPatch.$inferInsert;

export type RouteInteractionLog = typeof routeInteractionLog.$inferSelect;
export type RouteInteractionLogInsert = typeof routeInteractionLog.$inferInsert;
