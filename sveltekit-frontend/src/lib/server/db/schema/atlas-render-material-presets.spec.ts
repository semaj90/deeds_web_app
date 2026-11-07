import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { atlasRenderMaterialPresets } from './atlas-render-material-presets.js';

const root = process.cwd();
const migrationPath = resolve(root, 'drizzle/manual/20261106_atlas_render_material_presets_v1.sql');
const presetPath = resolve(root, '../scripts/blender/material-presets-v1.json');
const migration = readFileSync(migrationPath, 'utf8');
const presetDocument = JSON.parse(readFileSync(presetPath, 'utf8')) as {
	presets: Array<{ id: string; baseColorSrgb: string; metallic: number; roughness: number }>;
};

function migrationColumns(tableName: string): string[] {
	const body = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1] ?? '';
	return body.split('\n').flatMap((line) => {
		const match = /^  ([a-z0-9_]+)\s+/.exec(line);
		return match ? [match[1]] : [];
	}).sort();
}

describe('render material preset candidate schema', () => {
	const table = getTableConfig(atlasRenderMaterialPresets);

	it('matches the candidate SQL columns without reusing the NES LUT table', () => {
		expect(table.name).toBe('atlas_render_material_presets_v1');
		expect(migrationColumns(table.name)).toEqual(table.columns.map((column) => column.name).sort());
		expect(migration).not.toMatch(/(?:CREATE|ALTER|INSERT INTO)\s+(?:public\.)?atlas_nes_lut_v1/i);
		expect(migration).not.toMatch(/\b(?:bytea|jsonb|vector\s*\()/i);
	});

	it('keeps the UI palette mapped to bounded sRGB and PBR fields', () => {
		expect(presetDocument.presets).toHaveLength(4);
		for (const preset of presetDocument.presets) {
			expect(preset.baseColorSrgb).toMatch(/^#[0-9A-F]{6}$/i);
			expect(preset.metallic).toBeGreaterThanOrEqual(0);
			expect(preset.metallic).toBeLessThanOrEqual(1);
			expect(preset.roughness).toBeGreaterThanOrEqual(0);
			expect(preset.roughness).toBeLessThanOrEqual(1);
		}
	});

	it('is explicitly an unapplied sidecar candidate', () => {
		const sidecars = JSON.parse(readFileSync(resolve(root, 'drizzle/sidecar-migrations.json'), 'utf8')) as {
			sidecars: Array<{ file: string; status?: string; reason?: string }>;
		};
		const candidate = sidecars.sidecars.find((entry) => entry.file === 'manual/20261106_atlas_render_material_presets_v1.sql');
		expect(candidate).toBeDefined();
		expect(candidate?.reason).toMatch(/Candidate only/i);
	});
});
