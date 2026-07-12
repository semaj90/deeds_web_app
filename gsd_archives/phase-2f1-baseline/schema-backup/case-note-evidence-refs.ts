/**
 * !!! MERGED-WITH-CANONICAL — 2026-05-30 !!!
 *
 * This sidecar was auto-extracted from `drizzle-kit introspect` to mirror the
 * LIVE DB shape. The CANONICAL declaration of this table lives in:
 *   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:2012
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
 * caseNoteEvidenceRefs — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `case_note_evidence_refs`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const caseNoteEvidenceRefs = pgTable("case_note_evidence_refs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("case_note_refs_unique").on(table.evidenceId, table.noteId),
]);

export type CaseNoteEvidenceRefs = typeof caseNoteEvidenceRefs.$inferSelect;
export type NewCaseNoteEvidenceRefs = typeof caseNoteEvidenceRefs.$inferInsert;
