/**
 * Phase 78: Cutlass Error Brain Schema
 *
 * Tables for health monitoring, error collection, clustering, and LLM suggestions.
 * Integrates with Phase 72 (routes) and Phase 90 (safety shields).
 */

import {
	decimal,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================

export const routeHealthStateEnum = pgEnum('route_health_state', ['healthy', 'flaky', 'broken']);

export const errorSeverityEnum = pgEnum('error_severity', ['info', 'warn', 'error', 'fatal']);

export const errorKindEnum = pgEnum('error_kind', [
	'typescript',
	'svelte',
	'lint',
	'build',
	'runtime',
	'api',
	'other'
]);

export const suggestionStateEnum = pgEnum('suggestion_state', [
	'pending',
	'applied',
	'dismissed',
	'snoozed'
]);

// ============================================================================
// TABLES
// ============================================================================

/**
 * route_health: Current health state of each route (HMM-style state tracking)
 */
export const routeHealth = pgTable(
	'route_health',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		routePath: varchar('route_path', { length: 255 }).notNull().unique(),
		file: varchar('file', { length: 500 }),
		state: routeHealthStateEnum('state').notNull().default('healthy'),
		recentErrorCount: integer('recent_error_count').notNull().default(0),
		totalErrorCount: integer('total_error_count').notNull().default(0),
		lastErrorAt: timestamp('last_error_at'),
		lastErrorClusterId: uuid('last_error_cluster_id'),
		lastErrorMessageShort: text('last_error_message_short'),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		idxRoutePath: index('idx_route_health_path').on(table.routePath),
		idxState: index('idx_route_health_state').on(table.state),
		idxUpdatedAt: index('idx_route_health_updated').on(table.updatedAt)
	})
);

/**
 * error_events: Individual error occurrences
 */
export const errorEvents = pgTable(
	'error_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		routePath: varchar('route_path', { length: 255 }).notNull(),
		file: varchar('file', { length: 500 }),
		kind: errorKindEnum('kind').notNull().default('other'),
		severity: errorSeverityEnum('severity').notNull().default('warn'),
		tsCode: varchar('ts_code', { length: 50 }),
		message: text('message').notNull(),
		stack: text('stack'),
		lineNumber: integer('line_number'),
		columnNumber: integer('column_number'),
		sourceSnippet: text('source_snippet'),
		clusterId: uuid('cluster_id'),
		embedding: text('embedding'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		idxRoutePath: index('idx_error_events_route').on(table.routePath),
		idxClusterId: index('idx_error_events_cluster').on(table.clusterId),
		idxSeverity: index('idx_error_events_severity').on(table.severity),
		idxCreatedAt: index('idx_error_events_created').on(table.createdAt),
		idxRouteCluster: index('idx_error_events_route_cluster').on(table.routePath, table.clusterId)
	})
);

/**
 * error_clusters: Canonical error groups (via CUDA embedding + K-means)
 */
export const errorClusters = pgTable(
	'error_clusters',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		canonicalMessage: text('canonical_message').notNull(),
		embedding: text('embedding').notNull(),
		embeddingDim: integer('embedding_dim').notNull(),
		eventCount: integer('event_count').notNull().default(0),
		affectedRoutes: integer('affected_routes').notNull().default(0),
		severity: errorSeverityEnum('severity').notNull().default('warn'),
		kind: errorKindEnum('kind').notNull().default('other'),
		suggestedFix: text('suggested_fix'),
		successRate: decimal('success_rate', { precision: 3, scale: 2 }).default('0.00'),
		lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		idxSeverity: index('idx_error_clusters_severity').on(table.severity),
		idxEventCount: index('idx_error_clusters_count').on(table.eventCount)
	})
);

/**
 * error_suggestions: LLM-generated fix suggestions per cluster
 */
export const errorSuggestions = pgTable(
	'error_suggestions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clusterId: uuid('cluster_id')
			.notNull()
			.references(() => errorClusters.id, { onDelete: 'cascade' }),
		routePath: varchar('route_path', { length: 255 }),
		summary: text('summary').notNull(),
		patch: text('patch').notNull(),
		riskLevel: varchar('risk_level', { length: 20 }).notNull().default('medium'),
		affectedFiles: jsonb('affected_files').notNull().default([]),
		testsToRun: jsonb('tests_to_run').notNull().default([]),
		confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull().default('0.70'),
		appliedCount: integer('applied_count').notNull().default(0),
		approvedBy: uuid('approved_by'),
		approvedAt: timestamp('approved_at'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		idxClusterId: index('idx_suggestions_cluster').on(table.clusterId),
		idxRoutePath: index('idx_suggestions_route').on(table.routePath),
		idxRiskLevel: index('idx_suggestions_risk').on(table.riskLevel),
		uniqueRouteCluster: uniqueIndex('uniq_suggestions_route_cluster').on(
			table.routePath,
			table.clusterId
		)
	})
);

/**
 * error_patch_log: Audit trail of applied patches
 */
export const errorPatchLog = pgTable(
	'error_patch_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		suggestionId: uuid('suggestion_id')
			.notNull()
			.references(() => errorSuggestions.id, { onDelete: 'restrict' }),
		clusterId: uuid('cluster_id').notNull(),
		routePath: varchar('route_path', { length: 255 }).notNull(),
		file: varchar('file', { length: 500 }).notNull(),
		originalContent: text('original_content'),
		patchedContent: text('patched_content'),
		appliedBy: uuid('applied_by').notNull(),
		status: varchar('status', { length: 20 }).notNull().default('applied'),
		reason: text('reason'),
		appliedAt: timestamp('applied_at').notNull().defaultNow(),
		revertedAt: timestamp('reverted_at')
	},
	(table) => ({
		idxRoutePath: index('idx_patch_log_route').on(table.routePath),
		idxAppliedBy: index('idx_patch_log_user').on(table.appliedBy),
		idxStatus: index('idx_patch_log_status').on(table.status),
		idxAppliedAt: index('idx_patch_log_applied').on(table.appliedAt)
	})
);

/**
 * route_context_cache: Cached RAG + KAG context per route
 */
export const routeContextCache = pgTable(
	'route_context_cache',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		routePath: varchar('route_path', { length: 255 }).notNull().unique(),
		ragChunks: jsonb('rag_chunks').notNull().default([]),
		kagGraph: jsonb('kag_graph').notNull().default({}),
		relatedTests: jsonb('related_tests').notNull().default([]),
		relatedMigrations: jsonb('related_migrations').notNull().default([]),
		astSnippet: text('ast_snippet'),
		lastUpdatedAt: timestamp('last_updated_at').notNull().defaultNow(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(table) => ({
		idxRoutePath: index('idx_context_cache_route').on(table.routePath),
		idxUpdatedAt: index('idx_context_cache_updated').on(table.lastUpdatedAt)
	})
);

/**
 * error_suggestion_states: Per-route user feedback on AI suggestions
 */
export const errorSuggestionStates = pgTable(
	'error_suggestion_states',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		suggestionId: uuid('suggestion_id')
			.notNull()
			.references(() => errorSuggestions.id, { onDelete: 'cascade' }),
		routePath: text('route_path').notNull(),
		userId: uuid('user_id'),
		state: suggestionStateEnum('state').notNull().default('pending'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow()
	},
	(table) => ({
		suggestionRouteUserUnique: uniqueIndex('error_suggestion_states_suggestion_route_user_idx').on(
			table.suggestionId,
			table.routePath,
			table.userId
		)
	})
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type RouteHealth = typeof routeHealth.$inferSelect;
export type RouteHealthInsert = typeof routeHealth.$inferInsert;

export type ErrorEvent = typeof errorEvents.$inferSelect;
export type ErrorEventInsert = typeof errorEvents.$inferInsert;

export type ErrorCluster = typeof errorClusters.$inferSelect;
export type ErrorClusterInsert = typeof errorClusters.$inferInsert;

export type ErrorSuggestion = typeof errorSuggestions.$inferSelect;
export type ErrorSuggestionInsert = typeof errorSuggestions.$inferInsert;

export type ErrorPatchLog = typeof errorPatchLog.$inferSelect;
export type ErrorPatchLogInsert = typeof errorPatchLog.$inferInsert;

export type RouteContextCache = typeof routeContextCache.$inferSelect;
export type RouteContextCacheInsert = typeof routeContextCache.$inferInsert;

export type ErrorSuggestionState = typeof errorSuggestionStates.$inferSelect;
export type ErrorSuggestionStateInsert = typeof errorSuggestionStates.$inferInsert;

