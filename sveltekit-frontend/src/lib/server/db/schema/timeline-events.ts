/**
 * !!! MERGED-WITH-CANONICAL — 2026-05-30 !!!
 *
 * This sidecar was auto-extracted from `drizzle-kit introspect` to mirror the
 * LIVE DB shape. The CANONICAL declaration of this table lives in:
 *   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:1316
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
 * timelineEvents — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `timeline_events`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const timelineEvents = pgTable("timeline_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	poiId: uuid("poi_id"),
	caseId: uuid("case_id"),
	title: varchar({ length: 500 }).notNull(),
	description: text(),
	eventDate: timestamp("event_date", { withTimezone: true, mode: 'string' }).notNull(),
	eventType: varchar("event_type", { length: 100 }).default('general'),
	location: varchar({ length: 500 }),
	severity: varchar({ length: 20 }).default('low'),
	metadata: jsonb(),
	timestamp: timestamp({ mode: 'string' }),
	type: varchar({ length: 100 }),
	evidenceIds: jsonb("evidence_ids").default([]),
	personIds: jsonb("person_ids").default([]),
	locationIds: jsonb("location_ids").default([]),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export type TimelineEvents = typeof timelineEvents.$inferSelect;
export type NewTimelineEvents = typeof timelineEvents.$inferInsert;
