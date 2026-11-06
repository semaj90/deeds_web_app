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
		sourceRevision: text('source_revision'),
		sourceSha256: text('source_sha256'),
		anchorKind: text('anchor_kind'),
		anchorU: doublePrecision('anchor_u'),
		anchorV: doublePrecision('anchor_v'),
		meshId: text('mesh_id'),
		triangleIndex: integer('triangle_index'),
		barycentric: jsonb('barycentric').$type<[number, number, number] | null>(),
		anchorStatus: text('anchor_status').notNull().default('DRAFT'),
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
		index('scene_markers_source_revision_idx').on(t.caseId, t.sourceRevision).where(sql`${t.sourceRevision} IS NOT NULL`),
		check('scene_markers_revision_check', sql`${t.revision} >= 1`),
		check('scene_markers_anchor_kind_check', sql`${t.anchorKind} IS NULL OR ${t.anchorKind} IN ('IMAGE_UV', 'MESH_SURFACE')`),
		check('scene_markers_image_uv_check', sql`${t.anchorKind} IS DISTINCT FROM 'IMAGE_UV' OR (
			${t.anchorU} IS NOT NULL AND ${t.anchorV} IS NOT NULL
			AND ${t.anchorU} NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
			AND ${t.anchorV} NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
			AND ${t.anchorU} BETWEEN 0 AND 1 AND ${t.anchorV} BETWEEN 0 AND 1)`),
		check('scene_markers_mesh_anchor_check', sql`${t.anchorKind} IS DISTINCT FROM 'MESH_SURFACE' OR (
			${t.meshId} IS NOT NULL AND ${t.triangleIndex} IS NOT NULL AND ${t.triangleIndex} >= 0
			AND ${t.barycentric} IS NOT NULL AND jsonb_typeof(${t.barycentric}) = 'array'
			AND jsonb_array_length(${t.barycentric}) = 3)`),
		check('scene_markers_anchor_status_check', sql`${t.anchorStatus} IN ('DRAFT', 'PROPOSED', 'REVIEWED')`)
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
