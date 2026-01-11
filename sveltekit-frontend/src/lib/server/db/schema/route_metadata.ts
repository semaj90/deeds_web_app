import { integer, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Route Metadata
 * Stores metadata about application routes for monitoring and management.
 */
export const routeMetadata = pgTable('route_metadata', {
	id: uuid('id').defaultRandom().primaryKey(),
	path: text('path').notNull().unique(),
	kind: varchar('kind', { length: 50 }).default('page'), // page, api, server
	status: varchar('status', { length: 50 }).default('healthy'), // healthy, degraded, critical, maintenance
	priority: integer('priority').default(1),
	group: varchar('group', { length: 100 }).default('default'),
});


