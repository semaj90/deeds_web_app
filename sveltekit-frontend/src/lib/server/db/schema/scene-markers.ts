/**
 * Drizzle declarations for scene-marker persistence.
 *
 * Mirrors drizzle/manual/scene_markers.sql. That SQL is the migration of record and is
 * NOT applied by drizzle-kit (manual sidecar). Do not run `drizzle-kit push` against
 * a database that lacks these tables. Parent tables come from the canonical schema.
 */
import { sql } from 'drizzle-orm';
import {
	bigint,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { cases, evidence } from '../schema-postgres.js';

export const sceneMarkers = pgTable(
	'scene_markers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'restrict' }),
		sceneKey: text('scene_key').notNull(),
		markerKey: text('marker_key').notNull(),
		evidenceId: uuid('evidence_id')
			.notNull()
			.references(() => evidence.id, { onDelete: 'restrict' }),
		posX: doublePrecision('pos_x').notNull(),
		posY: doublePrecision('pos_y').notNull(),
		posZ: doublePrecision('pos_z').notNull(),
		label: text('label'),
		revision: integer('revision').notNull().default(1),
		createdBy: integer('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('scene_markers_natural_key_uq').on(t.caseId, t.sceneKey, t.markerKey),
		index('scene_markers_case_scene_idx')
			.on(t.caseId, t.sceneKey)
			.where(sql`${t.deletedAt} is null`),
		index('scene_markers_evidence_idx').on(t.evidenceId),
		check('scene_markers_revision_check', sql`${t.revision} >= 1`)
	]
);

export const sceneEvents = pgTable(
	'scene_events',
	{
		id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
		caseId: uuid('case_id')
			.notNull()
			.references(() => cases.id, { onDelete: 'restrict' }),
		sceneKey: text('scene_key').notNull(),
		commandId: uuid('command_id').notNull(),
		eventType: text('event_type').notNull(),
		markerId: uuid('marker_id').references(() => sceneMarkers.id, { onDelete: 'restrict' }),
		aggregateRevision: integer('aggregate_revision').notNull(),
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
		createdBy: integer('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('scene_events_command_uq').on(t.commandId),
		index('scene_events_case_scene_idx').on(t.caseId, t.sceneKey, t.id)
	]
);

export const sceneEventOutbox = pgTable(
	'scene_event_outbox',
	{
		id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
		eventId: bigint('event_id', { mode: 'number' })
			.notNull()
			.references(() => sceneEvents.id, { onDelete: 'restrict' }),
		status: text('status').notNull().default('pending'),
		attemptCount: integer('attempt_count').notNull().default(0),
		lastError: text('last_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		deliveredAt: timestamp('delivered_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('scene_event_outbox_event_uq').on(t.eventId),
		index('scene_event_outbox_pending_idx')
			.on(t.createdAt)
			.where(sql`${t.status} = 'pending'`)
	]
);
