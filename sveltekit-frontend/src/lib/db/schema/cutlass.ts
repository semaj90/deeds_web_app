import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const routeHealthTable = pgTable('route_health', {
 id: uuid('id').defaultRandom().primaryKey(routePath: text('route_path').notNull().unique(, file: text('file', state: text('state').notNull().default('healthy'), // 'healthy', 'broken', 'flaky', recentErrorCount: integer('recent_error_count').default(0, totalErrorCount: integer('total_error_count').default(0, lastErrorAt: timestamp('last_error_at', lastErrorClusterId: uuid('last_error_cluster_id', lastErrorMessageShort: text('last_error_message_short', updatedAt: timestamp('updated_at').defaultNow(createdAt: timestamp('created_at').defaultNow(),
});

export const errorClustersTable = pgTable('error_clusters', {
 id: uuid('id').defaultRandom().primaryKey(createdAt: timestamp('created_at').defaultNow(),
});

export const errorEventsTable = pgTable('error_events', {
 id: uuid('id').defaultRandom().primaryKey(routePath: text('route_path').notNull(, filePath: text('file_path', message: text('message').notNull(stackTrace: text('stack_trace', tsCode: text('ts_code'), // TypeScript error code
 severity: text('severity').notNull().default('error', clusterId: uuid('cluster_id').references(() => errorClustersTable.id, { onDelete: 'set null' }, createdAt: timestamp('created_at').defaultNow(),
});

export const errorSuggestionsTable = pgTable('error_suggestions', {
 id: uuid('id').defaultRandom().primaryKey(routePath: text('route_path').notNull(, summary: text('summary').notNull(patch: text('patch').notNull(, riskLevel: text('risk_level').default('medium', source: text('source').default('synthesized'), // 'gemini', 'synthesized', 'cache', createdAt: timestamp('created_at').defaultNow(),
});


