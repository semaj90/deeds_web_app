/**
 * !!! MERGED-WITH-CANONICAL — 2026-05-30 !!!
 *
 * This sidecar was auto-extracted from `drizzle-kit introspect` to mirror the
 * LIVE DB shape. The CANONICAL declaration of this table lives in:
 *   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:1986
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
 * caseNoteVersions — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `case_note_versions`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const caseNoteVersions = pgTable("case_note_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	title: varchar({ length: 255 }),
	content: text().notNull(),
	versionNumber: integer("version_number").notNull(),
	editedBy: uuid("edited_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export type CaseNoteVersions = typeof caseNoteVersions.$inferSelect;
export type NewCaseNoteVersions = typeof caseNoteVersions.$inferInsert;
