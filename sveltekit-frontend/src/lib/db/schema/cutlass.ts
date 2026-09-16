import { integer, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// FIXED 2026-09-14 (PHASE78-LIVE-PROPOSAL-NO-PERSIST-01 investigation): errorClustersTable and
// errorEventsTable below were stale relative to the live database -- confirmed via
// information_schema.columns and pg_enum directly, not assumed. The live tables already have
// real data (148 error_events rows) with these exact column names/types; this file was wrong,
// not the database (Postgres is truth -- see root CLAUDE.md). No ALTER/migration was needed or
// run for this fix; only this TypeScript declaration changed.
export const errorKindEnum = pgEnum('error_kind', ['runtime', 'api', 'other']);
export const errorSeverityEnum = pgEnum('error_severity', ['info', 'warn', 'error', 'critical']);

export const routeHealthTable = pgTable('route_health', {
	id: uuid('id').defaultRandom().primaryKey(),
	routePath: text('route_path').notNull().unique(),
	file: text('file'),
	state: text('state').notNull().default('healthy'), // 'healthy', 'broken', 'flaky'
	recentErrorCount: integer('recent_error_count').default(0),
	totalErrorCount: integer('total_error_count').default(0),
	lastErrorAt: timestamp('last_error_at'),
	lastErrorClusterId: uuid('last_error_cluster_id'),
	lastErrorMessageShort: text('last_error_message_short'),
	updatedAt: timestamp('updated_at').defaultNow(),
	createdAt: timestamp('created_at').defaultNow(),
});

export const errorClustersTable = pgTable('error_clusters', {
	id: uuid('id').defaultRandom().primaryKey(),
	kind: errorKindEnum('kind').notNull(),
	severity: errorSeverityEnum('severity').notNull(),
	pattern: text('pattern').notNull(),
	errorCount: integer('error_count').notNull().default(0),
	routePaths: text('route_paths').array(),
	radius: numeric('radius'),
	lastUpdated: timestamp('last_updated').defaultNow().notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const errorEventsTable = pgTable('error_events', {
	id: uuid('id').defaultRandom().primaryKey(),
	routePath: varchar('route_path', { length: 255 }).notNull(),
	file: varchar('file', { length: 255 }),
	kind: errorKindEnum('kind').notNull(),
	severity: errorSeverityEnum('severity').notNull(),
	tsCode: varchar('ts_code', { length: 255 }), // TypeScript error code
	message: text('message').notNull(),
	stack: text('stack'),
	lineNumber: integer('line_number'),
	columnNumber: integer('column_number'),
	clusterId: uuid('cluster_id').references(() => errorClustersTable.id, { onDelete: 'set null' }),
	collectedAt: timestamp('collected_at').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const errorSuggestionsTable = pgTable('error_suggestions', {
  id: uuid('id').defaultRandom().primaryKey(),
  routePath: text('route_path').notNull(),
  summary: text('summary').notNull(),
  patch: text('patch').notNull(),
  riskLevel: text('risk_level').default('medium'),
  source: text('source').default('synthesized'), // 'synthesized', 'cache'
  createdAt: timestamp('created_at').defaultNow(),
});


