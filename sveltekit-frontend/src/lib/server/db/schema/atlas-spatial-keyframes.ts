import { sql } from 'drizzle-orm';
import { char, customType, index, integer, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { cases } from '../schema-postgres.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	}
});

const bit256 = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'bit(256)';
	}
});

/**
 * PostgreSQL 18 AIO Bitmap & Keyframe occupancy bitset table.
 * Candidate sidecar schema: unapplied until isolated scratch DB rehearsal is authorized.
 */
export const atlasSpatialKeyframes = pgTable('atlas_spatial_keyframes_v1', {
	caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'restrict' }),
	sceneId: uuid('scene_id').notNull(),
	titleId: varchar('title_id', { length: 64 }).notNull(),
	sourceSha256: char('source_sha256', { length: 64 }).notNull(),
	revisionId: integer('revision_id').notNull().default(1),
	activeSlotBitset: bit256('active_slot_bitset').notNull(),
	packedTransformsBlob: bytea('packed_transforms_blob').notNull(),
	int8QuantizedCoords: bytea('int8_quantized_coords').notNull().default(sql`'\\x'::bytea`),
	int4QuantizedScores: bytea('int4_quantized_scores').notNull().default(sql`'\\x'::bytea`),
	hyperloglogSketch: bytea('hyperloglog_sketch').notNull().default(sql`'\\x'::bytea`),
	clusterMetadata: jsonb('cluster_metadata').notNull().default(sql`'{}'::jsonb`),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	primaryKey({ columns: [table.caseId, table.sceneId, table.revisionId], name: 'atlas_spatial_keyframes_v1_pkey' }),
	index('idx_spatial_keyframes_sha256').on(table.sourceSha256),
	index('idx_spatial_keyframes_title').on(table.titleId)
]);

export type AtlasSpatialKeyframe = typeof atlasSpatialKeyframes.$inferSelect;
export type AtlasSpatialKeyframeInsert = typeof atlasSpatialKeyframes.$inferInsert;
