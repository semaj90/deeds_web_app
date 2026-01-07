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
 varchar,
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
 'other',
]);

export const suggestionStateEnum = pgEnum('suggestion_state', [
 'pending',
 'applied',
 'dismissed',
 'snoozed',
]);

// ============================================================================
// TABLES
// ============================================================================

/**
 * route_health: Current health state of each route (HMM-style state tracking)
 *
 * Stores the latest state from routeHealthMachine per route.
 * Joins with Phase 72 route-ast-graph.json via route_path.
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
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_route_health_path').on(table.routePath),
 idxState: index('idx_route_health_state').on(table.state),
 idxUpdatedAt: index('idx_route_health_updated').on(table.updatedAt),
 })
);

/**
 * error_events: Individual error occurrences
 *
 * Each row = one error log entry.
 * Batch-inserted during collection runs.
 * Clustered asynchronously via CUDA embedder.
 */
export const errorEvents = pgTable(
 'error_events',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 routePath: varchar('route_path', { length: 255 }).notNull(),
 file: varchar('file', { length: 500 }),
 kind: errorKindEnum('kind').notNull().default('other'),
 severity: errorSeverityEnum('severity').notNull().default('warn'),
 tsCode: varchar('ts_code', { length: 50 }), // TS1005, etc
 message: text('message').notNull(),
 stack: text('stack'),
 lineNumber: integer('line_number'),
 columnNumber: integer('column_number'),
 sourceSnippet: text('source_snippet'), // 3-5 lines of code
 clusterId: uuid('cluster_id'), // assigned after clustering
 embedding: text('embedding'), // JSON serialized vector (for indexing)
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_error_events_route').on(table.routePath),
 idxClusterId: index('idx_error_events_cluster').on(table.clusterId),
 idxSeverity: index('idx_error_events_severity').on(table.severity),
 idxCreatedAt: index('idx_error_events_created').on(table.createdAt),
 // Composite: route + cluster for easy grouping
 idxRouteCluster: index('idx_error_events_route_cluster').on(table.routePath, table.clusterId),
 })
);

/**
 * error_clusters: Canonical error groups (via CUDA embedding + K-means)
 *
 * Each cluster = one "type" of error.
 * Storing canonical message + embedding + count for fast lookup.
 */
export const errorClusters = pgTable(
 'error_clusters',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 canonicalMessage: text('canonical_message').notNull(),
 embedding: text('embedding').notNull(), // JSON-serialized vector
 embeddingDim: integer('embedding_dim').notNull(), // 384, 768, 1536, etc
 eventCount: integer('event_count').notNull().default(0),
 affectedRoutes: integer('affected_routes').notNull().default(0),
 severity: errorSeverityEnum('severity').notNull().default('warn'),
 kind: errorKindEnum('kind').notNull().default('other'),
 suggestedFix: text('suggested_fix'), // LLM-generated or manual
 successRate: decimal('success_rate', { precision: 3, scale: 2 }).default('0.00'), // 0.00-1.00
 lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxSeverity: index('idx_error_clusters_severity').on(table.severity),
 idxEventCount: index('idx_error_clusters_count').on(table.eventCount),
export const errorSuggestions = pgTable(
 'error_suggestions',
 {
 id: uuid('id').primaryKey().defaultRandom(),
 clusterId: uuid('cluster_id')
 .notNull()
 .references(() => errorClusters.id, {
 onDelete: 'cascade',
 }),
 routePath: varchar('route_path', { length: 255 }), // nullable: can apply to multiple routes
 summary: text('summary').notNull(), // One-liner
 patch: text('patch').notNull(), // Unified diff or code block
 riskLevel: varchar('risk_level', { length: 20 }).notNull().default('medium'), // low|medium|high
 affectedFiles: jsonb('affected_files').notNull().default('[]'), // string[]
 testsToRun: jsonb('tests_to_run').notNull().default('[]'), // string[] (jest/vitest paths)
 confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull().default('0.70'), // 0.00-1.00
 appliedCount: integer('applied_count').notNull().default(0),
 approvedBy: uuid('approved_by'), // user_id from Lucia
 approvedAt: timestamp('approved_at'),
 createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxClusterId: index('idx_suggestions_cluster').on(table.clusterId),
 idxRoutePath: index('idx_suggestions_route').on(table.routePath),
 idxRiskLevel: index('idx_suggestions_risk').on(table.riskLevel),
 uniqueRouteCluster: uniqueIndex('uniq_suggestions_route_cluster').on(
 table.routePath,
 table.clusterId
 ),
 })
);estsToRun: jsonb('tests_to_run').notNull().default('[]'), // string[] (jest/vitest paths)
 confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull().default('0.70'), // 0.00-1.00, appliedCount: integer('applied_count').notNull().default(0, approvedBy: uuid('approved_by'), // user_id from Lucia
 approvedAt: timestamp('approved_at', createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxClusterId: index('idx_suggestions_cluster').on(table.clusterId, idxRoutePath: index('idx_suggestions_route').on(table.routePath, idxRiskLevel: index('idx_suggestions_risk').on(table.riskLevel, uniqueRouteCluster: uniqueIndex('uniq_suggestions_route_cluster').on(
 table.routePath,
 table.clusterId
 ),
 })
);

/**
 * error_patch_log: Audit trail of applied patches (Phase 90 shield)
 *
 * Who applied what patch, when, to which file.
 * Tied to specific user, can be rolled back.
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
 originalContent: text('original_content'), // For rollback
 patchedContent: text('patched_content', appliedBy: uuid('applied_by').notNull(), // Lucia user_id
 status: varchar('status', { length: 20 }).notNull().default('applied'), // applied|rolled_back|reverted
 reason: text('reason'), // Why it was applied / reverted
 appliedAt: timestamp('applied_at').notNull().defaultNow( revertedAt: timestamp('reverted_at'),
 },
 (table) => ({
 idxRoutePath: index('idx_patch_log_route').on(table.routePath, idxAppliedBy: index('idx_patch_log_user').on(table.appliedBy, idxStatus: index('idx_patch_log_status').on(table.status, idxAppliedAt: index('idx_patch_log_applied').on(table.appliedAt),
 })
);

/**
 * route_context_cache: Cached RAG + KAG context per route
 *
 * Stores the last computed context (chunks, graph, test paths).
 * Refreshed periodically or on-demand to speed up LLM queries.
 *
 * Keyed by route_path for fast lookup.
 */
export const routeContextCache = pgTable(
 'route_context_cache',
 {
 id: uuid('id').primaryKey().defaultRandom( routePath: varchar('route_path', { length: 255 }).notNull().unique( ragChunks: jsonb('rag_chunks').notNull().default('[]'), // ErrorContextChunk[]
 kagGraph: jsonb('kag_graph').notNull().default('{}'), // nodes + edges
 relatedTests: jsonb('related_tests').notNull().default('[]'), // string[]
 relatedMigrations: jsonb('related_migrations').notNull().default('[]'), // string[]
 astSnippet: text('ast_snippet'), // Code around the route export
 lastUpdatedAt: timestamp('last_updated_at').notNull().defaultNow( createdAt: timestamp('created_at').notNull().defaultNow(),
 },
 (table) => ({
 idxRoutePath: index('idx_context_cache_route').on(table.routePath, idxUpdatedAt: index('idx_context_cache_updated').on(table.lastUpdatedAt),
 })
);

/**
 * error_suggestion_states: Per-route user feedback on AI suggestions
 *
 * Tracks user interactions with Error Brain suggestions:
 * - pending: new, untouched
 * - applied: user accepted / patch was used
 * - dismissed: user explicitly rejected
 * - snoozed: temporarily hidden
 *
 * One row per (suggestionId, routePath, userId) tuple.
 * Allows per-user filtering and analytics.
 */
export const errorSuggestionStates = pgTable(
 'error_suggestion_states',
 {
 id: uuid('id').defaultRandom().primaryKey( suggestionId: uuid('suggestion_id')
 .notNull()
 .references(() => errorSuggestions.id, { onDelete: 'cascade' }, routePath: text('route_path').notNull( userId: uuid('user_id'),
 // Note: nullable for anonymous users

 state: suggestionStateEnum('state').notNull().default('pending', createdAt: timestamp('created_at').notNull().defaultNow( updatedAt: timestamp('updated_at').notNull().defaultNow(),
 },
 (table) => ({
 suggestionRouteUserUnique: uniqueIndex('error_suggestion_states_suggestion_route_user_idx').on(
 table.suggestionId: table.routePath,
 table.userId
 ),
 })
);

// ============================================================================
// TYPE EXPORTS (for use in TypeScript)
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
