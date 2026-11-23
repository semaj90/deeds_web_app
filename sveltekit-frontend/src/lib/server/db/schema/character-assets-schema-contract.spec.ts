import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { characterAssets, characterAssetVersions, characterPartSlots } from './character-assets.js';

const root = process.cwd();
const migrationPath = resolve(root, 'drizzle/manual/character_assets_v1.sql');
const migration = readFileSync(migrationPath, 'utf8');
const sidecars = JSON.parse(readFileSync(resolve(root, 'drizzle/sidecar-migrations.json'), 'utf8')) as {
	sidecars: Array<{ file: string; status?: string; appliedBy?: string; reason?: string }>;
};

function sqlColumns(tableName: string): string[] {
	const body = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1];
	if (!body) throw new Error(`CHARACTER_SCHEMA_TABLE_MISSING:${tableName}`);
	return body.split('\n').flatMap((line) => {
		const match = /^  ([a-z][a-z0-9_]*)\s+/.exec(line);
		return match ? [match[1]] : [];
	}).sort();
}

describe('character assets schema candidate (MEM-05)', () => {
	const tables = [characterAssets, characterAssetVersions, characterPartSlots];

	it('matches the Drizzle schema to the SQL candidate columns', () => {
		for (const schema of tables) {
			const table = getTableConfig(schema);
			expect(sqlColumns(table.name), table.name).toEqual(table.columns.map((column) => column.name).sort());
		}
	});

	it('matches Drizzle index and check constraint names in candidate SQL', () => {
		for (const schema of tables) {
			const table = getTableConfig(schema);
			for (const index of table.indexes) expect(migration, `${table.name} index ${index.config.name}`).toContain(index.config.name);
			for (const check of table.checks) expect(migration, `${table.name} check ${check.name}`).toContain(check.name);
		}
	});

	it('maintains foreign-key constraints to cases and scene_assets', () => {
		expect(migration).toMatch(/case_id uuid NOT NULL REFERENCES cases\(id\) ON DELETE RESTRICT/i);
		expect(migration).toMatch(/asset_id uuid NOT NULL REFERENCES scene_assets\(asset_id\) ON DELETE RESTRICT/i);
		expect(migration).toMatch(/character_asset_id uuid NOT NULL REFERENCES character_assets\(id\) ON DELETE CASCADE/i);
	});

	it('is registered in sidecar-migrations.json as an unapplied candidate', () => {
		const candidate = sidecars.sidecars.find((entry) => entry.file === 'manual/character_assets_v1.sql');
		expect(candidate?.status).toBe('active_candidate');
		expect(candidate?.appliedBy).toBe('not-applied');
	});
});
