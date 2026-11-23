import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cases } from '../schema-postgres.js';
import { sceneAssets } from './scene-assets.js';

/**
 * Parent Atlas Character Assets Schema (`MEM-05`)
 *
 * Foreign-keyed to `cases.id` and `scene_assets.asset_id`.
 * Replaces draft raw SQL from `sql/001_character_registry_pg18.sql` with a canonical Drizzle schema.
 */

export const characterAssets = pgTable('character_assets', {
	id: uuid('id').primaryKey().defaultRandom(),
	caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'restrict' }),
	assetId: uuid('asset_id').notNull().references(() => sceneAssets.assetId, { onDelete: 'restrict' }),
	handle: text('handle').notNull(),
	label: text('label').notNull(),
	archetype: text('archetype').notNull(),
	rigSignature: text('rig_signature').notNull(),
	createdBy: integer('created_by').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	uniqueIndex('character_assets_case_handle_uq').on(table.caseId, table.handle),
	index('character_assets_case_idx').on(table.caseId),
	check('character_assets_handle_ck', sql`${table.handle} ~ '^CHAR-[A-Z0-9-]{1,48}$'`),
	check('character_assets_archetype_ck', sql`${table.archetype} in ('neutral_humanoid', 'lowpoly_detective', 'custom_glb')`)
]);

export const characterAssetVersions = pgTable('character_asset_versions', {
	id: uuid('id').primaryKey().defaultRandom(),
	characterAssetId: uuid('character_asset_id').notNull().references(() => characterAssets.id, { onDelete: 'cascade' }),
	version: integer('version').notNull(),
	lodTier: text('lod_tier').notNull(),
	sha256: text('sha256').notNull(),
	byteLength: integer('byte_length').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	uniqueIndex('character_asset_versions_character_ver_lod_uq').on(table.characterAssetId, table.version, table.lodTier),
	index('character_asset_versions_character_idx').on(table.characterAssetId),
	check('character_asset_versions_lod_ck', sql`${table.lodTier} in ('retro', 'balanced', 'detailed')`),
	check('character_asset_versions_sha_ck', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
	check('character_asset_versions_byte_length_ck', sql`${table.byteLength} > 0 and ${table.byteLength} <= 67108864`)
]);

export const characterPartSlots = pgTable('character_part_slots', {
	id: uuid('id').primaryKey().defaultRandom(),
	characterAssetId: uuid('character_asset_id').notNull().references(() => characterAssets.id, { onDelete: 'cascade' }),
	slotName: text('slot_name').notNull(),
	mountedAssetId: uuid('mounted_asset_id').references(() => sceneAssets.assetId, { onDelete: 'restrict' }),
	offsetTransform: jsonb('offset_transform'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	uniqueIndex('character_part_slots_char_slot_uq').on(table.characterAssetId, table.slotName),
	index('character_part_slots_character_idx').on(table.characterAssetId),
	check('character_part_slots_slot_name_ck', sql`${table.slotName} ~ '^[a-z][a-z0-9_.]+$'`)
]);
