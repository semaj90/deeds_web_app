import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Error Events
 * Logs individual error occurrences from build/runtime
 * Linked to route_health and error_suggestions
 */
export const errorEventsTable = pgTable(
 'error_events',
 {
 id: uuid('id').defaultRandom().primaryKey(),

 // Route path & file path (denormalized for easy querying)
 routePath: text('route_path').notNull(),
 filePath: text('file_path'),

 // TS/JS error code, e.g. "TS1005" or runtime "ReferenceError"
 tsCode: text('ts_code'),

 // "info" | "warn" | "error" | "fatal"
 severity: text('severity').notNull().default('error'),

 // Raw message and optional stack trace
 message: text('message').notNull(),
 stackTrace: text('stack_trace'),

    // Cluster ID from CUDA embedding+clustering (Phase 78)
    clusterId: text('cluster_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
 (table) => {
 return {
 routePathIdx: index('idx_error_events_route').on(table.routePath),
 clusterIdIdx: index('idx_error_events_cluster').on(table.clusterId),
 createdAtIdx: index('idx_error_events_created').on(table.createdAt),
 };
 }
);
);

export type ErrorEvent = typeof errorEventsTable.$inferSelect;
export type ErrorEventInsert = typeof errorEventsTable.$inferInsert;


