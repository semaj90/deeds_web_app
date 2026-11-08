import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sceneAssets } from './scene-assets.js';

/** Immutable members of a revision-qualified Streamed SOG package in SeaweedFS. */
export const sceneAssetFiles = pgTable('scene_asset_files', {
	assetId: uuid('asset_id').notNull().references(() => sceneAssets.assetId, { onDelete: 'restrict' }),
	relativePath: text('relative_path').notNull(),
	sha256: text('sha256').notNull(),
	byteLength: integer('byte_length').notNull(),
	contentType: text('content_type').notNull(),
	bucket: text('bucket').notNull(),
	objectKey: text('object_key').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	uniqueIndex('scene_asset_files_asset_path_uq').on(table.assetId, table.relativePath),
	uniqueIndex('scene_asset_files_bucket_key_uq').on(table.bucket, table.objectKey),
	index('scene_asset_files_asset_idx').on(table.assetId),
	check('scene_asset_files_path_ck', sql`${table.relativePath} ~ '^[A-Za-z0-9._/-]+$' and ${table.relativePath} !~ '(^/|(^|/)\\.\\.?(/|$)|//|\\\\)'`),
	check('scene_asset_files_sha_ck', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
	check('scene_asset_files_size_ck', sql`${table.byteLength} > 0 and ${table.byteLength} <= 67108864`),
	check('scene_asset_files_content_type_ck', sql`${table.contentType} in ('application/json', 'image/webp')`)
]);
