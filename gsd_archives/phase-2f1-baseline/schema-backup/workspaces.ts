/**
 * !!! MERGED-WITH-CANONICAL — 2026-05-30 !!!
 *
 * This sidecar was auto-extracted from `drizzle-kit introspect` to mirror the
 * LIVE DB shape. The CANONICAL declaration of this table lives in:
 *   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:2038
 *
 * Importers should use the schema-postgres.ts export to avoid duplicate
 * pgTable declarations. This file is retained as a live-DB reference snapshot
 * — diff it against the canonical source to spot drift.
 *
 * If you intentionally want this sidecar to BECOME the canonical source,
 * remove the canonical block from schema-postgres.ts and add an export here
 * to db/schema/index.ts. Don't keep both as canonical.
 */
/**
 * workspaces — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `workspaces`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const workspaces = pgTable("workspaces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	caseId: uuid("case_id"),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export type Workspaces = typeof workspaces.$inferSelect;
export type NewWorkspaces = typeof workspaces.$inferInsert;
