/**
 * !!! MERGED-WITH-CANONICAL — 2026-05-30 !!!
 *
 * This sidecar was auto-extracted from `drizzle-kit introspect` to mirror the
 * LIVE DB shape. The CANONICAL declaration of this table lives in:
 *   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:2063
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
 * workspaceSessions — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `workspace_sessions`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const workspaceSessions = pgTable("workspace_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	sessionId: uuid("session_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export type WorkspaceSessions = typeof workspaceSessions.$inferSelect;
export type NewWorkspaceSessions = typeof workspaceSessions.$inferInsert;
