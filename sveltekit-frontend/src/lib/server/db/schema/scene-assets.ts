import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cases } from '../schema-postgres.js';

/** Case scene object bytes in SeaweedFS; separate from both legal evidence and Atlas code artifacts. */
export const sceneAssets = pgTable('scene_assets', {
	assetId: uuid('asset_id').primaryKey().defaultRandom(),
	caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'restrict' }),
	sceneId: uuid('scene_id').notNull(),
	format: text('format').notNull(),
	sha256: text('sha256').notNull(),
	byteLength: integer('byte_length').notNull(),
	contentType: text('content_type').notNull(),
	bucket: text('bucket').notNull(),
	objectKey: text('object_key').notNull(),
	createdBy: integer('created_by').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	uniqueIndex('scene_assets_case_scene_sha_uq').on(table.caseId, table.sceneId, table.sha256),
	uniqueIndex('scene_assets_bucket_object_key_uq').on(table.bucket, table.objectKey),
	index('scene_assets_case_scene_idx').on(table.caseId, table.sceneId),
	check('scene_assets_format_ck', sql`${table.format} in ('GLB', 'SOG')`),
	check('scene_assets_sha256_ck', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
	check('scene_assets_byte_length_ck', sql`${table.byteLength} > 0 and ${table.byteLength} <= 67108864`),
	check('scene_assets_content_type_ck', sql`(${table.format} = 'GLB' and ${table.contentType} = 'model/gltf-binary') or (${table.format} = 'SOG' and ${table.contentType} = 'application/vnd.parent-atlas.streamed-sog+json')`)
]);
