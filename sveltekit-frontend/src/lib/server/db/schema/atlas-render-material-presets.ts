import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, real, smallint, text, timestamp } from 'drizzle-orm/pg-core';

/** Small renderer-neutral material presets; shader binaries and textures stay out of PostgreSQL. */
export const atlasRenderMaterialPresets = pgTable('atlas_render_material_presets_v1', {
	presetId: text('preset_id').notNull(),
	presetRevision: smallint('preset_revision').notNull(),
	displayName: text('display_name').notNull(),
	colorEncoding: text('color_encoding').notNull().default('SRGB_8BIT'),
	baseColorR: smallint('base_color_r').notNull(),
	baseColorG: smallint('base_color_g').notNull(),
	baseColorB: smallint('base_color_b').notNull(),
	alpha: real('alpha').notNull().default(1),
	metallic: real('metallic').notNull().default(0),
	roughness: real('roughness').notNull().default(1),
	materialModel: text('material_model').notNull().default('METALLIC_ROUGHNESS'),
	classification: text('classification').notNull().default('SYNTHETIC_DEMONSTRATIVE_PRESET'),
	sourceRef: text('source_ref').notNull(),
	sourceSha256: text('source_sha256').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	primaryKey({ columns: [table.presetId, table.presetRevision], name: 'atlas_render_material_presets_v1_pkey' }),
	index('atlas_render_material_presets_v1_class_idx').on(table.classification),
	check('atlas_render_material_presets_v1_revision_ck', sql`${table.presetRevision} > 0`),
	check('atlas_render_material_presets_v1_rgb_ck', sql`${table.baseColorR} between 0 and 255 and ${table.baseColorG} between 0 and 255 and ${table.baseColorB} between 0 and 255`),
	check('atlas_render_material_presets_v1_color_encoding_ck', sql`${table.colorEncoding} = 'SRGB_8BIT'`),
	check('atlas_render_material_presets_v1_alpha_ck', sql`${table.alpha} between 0 and 1`),
	check('atlas_render_material_presets_v1_metallic_ck', sql`${table.metallic} between 0 and 1`),
	check('atlas_render_material_presets_v1_roughness_ck', sql`${table.roughness} between 0 and 1`),
	check('atlas_render_material_presets_v1_model_ck', sql`${table.materialModel} = 'METALLIC_ROUGHNESS'`),
	check('atlas_render_material_presets_v1_source_sha_ck', sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`)
]);

export type AtlasRenderMaterialPreset = typeof atlasRenderMaterialPresets.$inferSelect;
