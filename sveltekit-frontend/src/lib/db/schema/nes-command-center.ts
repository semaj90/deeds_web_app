/**
 * NES Command Center Database Schema
 *
 * Persistent storage for route metadata, error tracking, health status,
 * and user interactions. Enables historical analysis, trend tracking,
 * and integration with Error Brain for AI-powered error resolution.
 *
 * @module schema/nes-command-center
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  decimal,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Route Metadata Table
 *
 * Stores metadata for all routes in the application including path, kind,
 * group, status, priority, and badges. Uses soft delete pattern with archived_at.
 */'route_metadata',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 }).unique().notNull(), // e.g., "/cases/[id]/overview", path: varchar('path', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 50 }).notNull(), // page, layout, server, endpoint
    group: varchar('group', { length: 100 }), // (app), (yorha), etc.
    status: varchar('status', { length: 50 }).default('healthy'), // healthy, flaky, broken
    priority: integer('priority').default(50),
    badges: jsonb('badges').default([]), // ["ai", "shield", "special"]
    // Enhanced columns (added 2025-12-21)
    description: text('description'),
    tags: jsonb('tags').default([]),
    metadata: jsonb('metadata').default({}),
    lastAccessedAt: timestamp('last_accessed_at'),
    accessCount: integer('access_count').default(0),
    errorCount: integer('error_count').default(0),
    healthScore: integer('health_score').default(100),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archivedAt: timestamp('archived_at'), // Soft delete pattern
  },
  (table) => ({
    routeIdIndex: index('idx_route_metadata_route_id').on(table.routeId),
    statusIndex: index('idx_route_metadata_status').on(table.status),
    archivedAtIndex: index('idx_route_metadata_archived_at').on(table.archivedAt),
    tagsIndex: index('idx_route_metadata_tags').on(table.tags),
    metadataIndex: index('idx_route_metadata_metadata').on(table.metadata),
    lastAccessedAtIndex: index('idx_route_metadata_last_accessed_at').on(table.lastAccessedAt),
    healthScoreIndex: index('idx_route_metadata_health_score').on(table.healthScore),
    errorCountIndex: index('idx_route_metadata_error_count').on(table.errorCount),
  })
);

/**
 * Error Cluster Table
 *
 * Stores clustered errors for each route including tool, code, severity,
 * and resolution status. Enables error tracking and trend analysis.
 */'error_cluster',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 })
      .notNull()
      .references(() => routeMetadata.routeId, { onDelete: 'cascade' }),
    tool: varchar('tool', { length: 100 }).notNull(), // svelte-check, tsc, vite, drizzle
    code: varchar('code', { length: 100 }).notNull(), // TS2345, import-type: etc.
    message: text('message').notNull(),
    severity: varchar('severity', { length: 50 }).notNull(), // error, warning, info
    count: integer('count').default(1).notNull(),
    filePath: varchar('file_path', { length: 255 }),
    rawLogSnippet: text('raw_log_snippet'),
    // Enhanced columns (added 2025-12-21)
    title: varchar('title', { length: 255 }), // Human-readable cluster name (e.g., "TS1005: Missing Semicolon")
    clusterId: varchar('cluster_id', { length: 255 }),
    errorCode: varchar('error_code', { length: 100 }),
    category: varchar('category', { length: 100 }),
    affectedRoutes: jsonb('affected_routes').default([]),
    firstSeenAt: timestamp('first_seen_at').defaultNow(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
    archivedAt: timestamp('archived_at'), // Soft delete pattern
  },
  (table) => ({
    routeIdIndex: index('idx_error_cluster_route_id').on(table.routeId),
    severityIndex: index('idx_error_cluster_severity').on(table.severity),
    createdAtIndex: index('idx_error_cluster_created_at').on(table.createdAt),
    resolvedAtIndex: index('idx_error_cluster_resolved_at').on(table.resolvedAt),
    toolIndex: index('idx_error_cluster_tool').on(table.tool),
    clusterIdIndex: index('idx_error_cluster_cluster_id').on(table.clusterId),
    errorCodeIndex: index('idx_error_cluster_error_code').on(table.errorCode),
    categoryIndex: index('idx_error_cluster_category').on(table.category),
    firstSeenAtIndex: index('idx_error_cluster_first_seen_at').on(table.firstSeenAt),
    lastSeenAtIndex: index('idx_error_cluster_last_seen_at').on(table.lastSeenAt),
    updatedAtIndex: index('idx_error_cluster_updated_at').on(table.updatedAt),
  })
);

/**
 * Route Health Event Table
 *
 * Tracks health status changes for routes over time. Enables historical
 * analysis of route stability and health trends.
 */'route_health_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 })
      .notNull()
      .references(() => routeMetadata.routeId, { onDelete: 'cascade' }),
    oldStatus: varchar('old_status', { length: 50 }), // healthy, flaky, broken
    newStatus: varchar('new_status', { length: 50 }).notNull(),
    reason: varchar('reason', { length: 255 }), // "error_cluster_created", "error_resolved", etc.
    // Enhanced columns (added 2025-12-21)
    metadata: jsonb('metadata').default({}),
    triggeredBy: varchar('triggered_by', { length: 255 }),
    errorCount: integer('error_count').default(0),
    healthScore: integer('health_score'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    routeIdIndex: index('idx_route_health_event_route_id').on(table.routeId),
    createdAtIndex: index('idx_route_health_event_created_at').on(table.createdAt),
    triggeredByIndex: index('idx_route_health_event_triggered_by').on(table.triggeredBy),
    metadataIndex: index('idx_route_health_event_metadata').on(table.metadata),
  })
);

/**
 * Error Brain Analysis Table
 *
 * Stores AI-powered error analysis results including suggestions,
 * selected suggestion, phase, and completion status.
 */'error_brain_analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 })
      .notNull()
      .references(() => routeMetadata.routeId, { onDelete: 'cascade' }),
    suggestions: jsonb('suggestions').notNull(), // Array of suggestion objects
    selectedSuggestionIndex: integer('selected_suggestion_index'),
    phase: varchar('phase', { length: 50 }), // analyzing, suggesting, applying, verifying, done, failed
    errorMessage: text('error_message'),
    // Enhanced columns (added 2025-12-21)
    status: varchar('status', { length: 50 }).default('pending'),
    modelVersion: varchar('model_version', { length: 100 }),
    confidenceScore: decimal('confidence_score', { precision: 5, scale: 2 }),
    executionTimeMs: integer('execution_time_ms'),
    metadata: jsonb('metadata').default({}),
    updatedAt: timestamp('updated_at').defaultNow(),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    routeIdIndex: index('idx_error_brain_analysis_route_id').on(table.routeId),
    createdAtIndex: index('idx_error_brain_analysis_created_at').on(table.createdAt),
    statusIndex: index('idx_error_brain_analysis_status').on(table.status),
    modelVersionIndex: index('idx_error_brain_analysis_model_version').on(table.modelVersion),
    confidenceScoreIndex: index('idx_error_brain_analysis_confidence_score').on(
      table.confidenceScore
    ),
    updatedAtIndex: index('idx_error_brain_analysis_updated_at').on(table.updatedAt),
  })
);

/**
 * Error Brain Patch Table
 *
 * Stores patches generated by Error Brain including content, verification
 * status, and application timestamp.
 */'error_brain_patch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => errorBrainAnalysis.id, { onDelete: 'cascade' }),
    routeId: varchar('route_id', { length: 255 })
      .notNull()
      .references(() => routeMetadata.routeId, { onDelete: 'cascade' }),
    patchContent: text('patch_content').notNull(),
    appliedAt: timestamp('applied_at'),
    verificationStatus: varchar('verification_status', { length: 50 }), // pending, passed, failed
    verificationTimestamp: timestamp('verification_timestamp'),
    verificationMessage: text('verification_message'),
    // Enhanced columns (added 2025-12-21)
    patchType: varchar('patch_type', { length: 50 }).default('code_fix'),
    filePath: varchar('file_path', { length: 500 }),
    lineStart: integer('line_start'),
    lineEnd: integer('line_end'),
    confidenceScore: decimal('confidence_score', { precision: 5, scale: 2 }),
    metadata: jsonb('metadata').default({}),
    updatedAt: timestamp('updated_at').defaultNow(),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    analysisIdIndex: index('idx_error_brain_patch_analysis_id').on(table.analysisId),
    routeIdIndex: index('idx_error_brain_patch_route_id').on(table.routeId),
    verificationStatusIndex: index('idx_error_brain_patch_verification_status').on(
      table.verificationStatus
    ),
    patchTypeIndex: index('idx_error_brain_patch_patch_type').on(table.patchType),
    filePathIndex: index('idx_error_brain_patch_file_path').on(table.filePath),
    confidenceScoreIndex: index('idx_error_brain_patch_confidence_score').on(table.confidenceScore),
    updatedAtIndex: index('idx_error_brain_patch_updated_at').on(table.updatedAt),
  })
);

/**
 * Route Interaction Log Table
 *
 * Logs user interactions with routes including views, navigations,
 * analyses, and patch applications. Enables usage analytics.
 */'route_interaction_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: varchar('route_id', { length: 255 })
      .notNull()
      .references(() => routeMetadata.routeId, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }),
    interactionType: varchar('interaction_type', { length: 50 }).notNull(), // view, navigate, analyze, patch_apply
    metadata: jsonb('metadata'), // Additional context
    // Enhanced columns (added 2025-12-21)
    sessionId: varchar('session_id', { length: 255 }),
    durationMs: integer('duration_ms'),
    success: boolean('success').default(true),
    errorMessage: text('error_message'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    routeIdIndex: index('idx_route_interaction_log_route_id').on(table.routeId),
    userIdIndex: index('idx_route_interaction_log_user_id').on(table.userId),
    createdAtIndex: index('idx_route_interaction_log_created_at').on(table.createdAt),
    sessionIdIndex: index('idx_route_interaction_log_session_id').on(table.sessionId),
    successIndex: index('idx_route_interaction_log_success').on(table.success),
    ipAddressIndex: index('idx_route_interaction_log_ip_address').on(table.ipAddress),
  })
);

/**
 * Relations
 *
 * Define relationships between tables for better query experience
 * with Drizzle ORM.
 */
export const routeMetadataRelations = relations(routeMetadata, ({ many }) => ({
	errorClusters: many(errorCluster),
	healthEvents: many(routeHealthEvent),
	analyses: many(errorBrainAnalysis),
	patches: many(errorBrainPatch),
	interactions: many(routeInteractionLog),
}));

export const errorClusterRelations = relations(errorCluster, ({ one }) => ({
	route: one(routeMetadata, {
		fields: [errorCluster.routeId],
		references: [routeMetadata.routeId],
	}),
}));

export const routeHealthEventRelations = relations(routeHealthEvent, ({ one }) => ({
	route: one(routeMetadata, {
		fields: [routeHealthEvent.routeId],
		references: [routeMetadata.routeId],
	}),
}));

export const errorBrainAnalysisRelations = relations(errorBrainAnalysis, ({ one, many }) => ({
	route: one(routeMetadata, {
		fields: [errorBrainAnalysis.routeId],
		references: [routeMetadata.routeId],
	}),
	patches: many(errorBrainPatch),
}));

export const errorBrainPatchRelations = relations(errorBrainPatch, ({ one }) => ({
	analysis: one(errorBrainAnalysis, {
		fields: [errorBrainPatch.analysisId],
		references: [errorBrainAnalysis.id],
	}),
	route: one(routeMetadata, {
		fields: [errorBrainPatch.routeId],
		references: [routeMetadata.routeId],
	}),
}));

export const routeInteractionLogRelations = relations(routeInteractionLog, ({ one }) => ({
	route: one(routeMetadata, {
		fields: [routeInteractionLog.routeId],
		references: [routeMetadata.routeId],
	}),
}));

/**
 * Type Exports
 *
 * TypeScript types for insert and select operations
 */
export type RouteMetadata = typeof routeMetadata.$inferSelect;
export type NewRouteMetadata = typeof routeMetadata.$inferInsert;

export type ErrorCluster = typeof errorCluster.$inferSelect;
export type NewErrorCluster = typeof errorCluster.$inferInsert;

export type RouteHealthEvent = typeof routeHealthEvent.$inferSelect;
export type NewRouteHealthEvent = typeof routeHealthEvent.$inferInsert;

export type ErrorBrainAnalysis = typeof errorBrainAnalysis.$inferSelect;
export type NewErrorBrainAnalysis = typeof errorBrainAnalysis.$inferInsert;

export type ErrorBrainPatch = typeof errorBrainPatch.$inferSelect;
export type NewErrorBrainPatch = typeof errorBrainPatch.$inferInsert;

export type RouteInteractionLog = typeof routeInteractionLog.$inferSelect;
export type NewRouteInteractionLog = typeof routeInteractionLog.$inferInsert;


