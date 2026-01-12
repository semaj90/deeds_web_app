import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Route Health Tracking
 * Maintains current health state per route
 * Linked to error_events and error_suggestions
 */
export const routeHealthTable = pgTable(
 'route_health',
 {
 id: uuid('id').defaultRandom().primaryKey(),

 // SvelteKit route path: e.g. "/cases/[id]/overview"
 routePath: text('route_path').notNull(),

 // "healthy" | "flaky" | "broken"
 errorState: text('error_state').notNull().default('healthy'),

 // Number of recent errors
 recentErrorCount: integer('error_count').notNull().default(0),

 // Last checked timestamp
 lastErrorAt: timestamp('last_checked', { withTimezone: true }),

 // Health score (0-100)
 healthScore: integer('health_score').default(100),

 // Metadata JSON
 metadata: text('metadata'),

 // Route cluster
 lastErrorClusterId: text('route_cluster'),

 // Route owner
 routeOwner: text('route_owner'),
 },
 (table) => {
 return {
 routePathIdx: uniqueIndex('route_health_route_path_idx').on(table.routePath),
 };
 }
);

export type RouteHealth = typeof routeHealthTable.$inferSelect;
export type RouteHealthInsert = typeof routeHealthTable.$inferInsert;


