/**
 * codebaseRelationshipReports — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `codebase_relationship_reports`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const codebaseRelationshipReports = pgTable("codebase_relationship_reports", {
	srcCommunity: integer("src_community").notNull(),
	dstCommunity: integer("dst_community").notNull(),
	summary: text(),
	purpose: text(),
	weight: integer(),
	builtAt: timestamp("built_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	primaryKey({ columns: [table.dstCommunity, table.srcCommunity], name: "codebase_relationship_reports_pkey"}),
]);

export type CodebaseRelationshipReports = typeof codebaseRelationshipReports.$inferSelect;
export type NewCodebaseRelationshipReports = typeof codebaseRelationshipReports.$inferInsert;
