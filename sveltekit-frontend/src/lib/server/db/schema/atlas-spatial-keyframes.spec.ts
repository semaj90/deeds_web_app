import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { atlasSpatialKeyframes } from './atlas-spatial-keyframes.js';

const root = existsSync(resolve(process.cwd(), 'drizzle/manual/20261106_atlas_spatial_keyframes_v1.sql'))
	? process.cwd()
	: resolve(process.cwd(), 'sveltekit-frontend');
const migrationPath = resolve(root, 'drizzle/manual/20261106_atlas_spatial_keyframes_v1.sql');
const migration = readFileSync(migrationPath, 'utf8');

function migrationColumns(tableName: string): string[] {
	const body = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tableName} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1] ?? '';
	return body.split('\n').flatMap((line) => {
		const match = /^\s+([a-z0-9_]+)\s+/.exec(line);
		return match ? [match[1]] : [];
	}).sort();
}

describe('atlas_spatial_keyframes_v1 candidate schema contract', () => {
	const table = getTableConfig(atlasSpatialKeyframes);

	it('matches the candidate SQL columns exactly', () => {
		expect(table.name).toBe('atlas_spatial_keyframes_v1');
		const expectedCols = migrationColumns(table.name);
		const actualCols = table.columns.map((c) => c.name).sort();
		expect(actualCols).toEqual(expectedCols);
	});

	it('includes 256-bit occupancy bitset, bytea transforms, and jsonb cluster metadata', () => {
		const colMap = new Map(table.columns.map((c) => [c.name, c.columnType]));
		expect(colMap.get('active_slot_bitset')).toBe('PgCustomColumn');
		expect(colMap.get('packed_transforms_blob')).toBe('PgCustomColumn');
		expect(colMap.get('int8_quantized_coords')).toBe('PgCustomColumn');
		expect(colMap.get('int4_quantized_scores')).toBe('PgCustomColumn');
		expect(colMap.get('hyperloglog_sketch')).toBe('PgCustomColumn');
		expect(colMap.get('cluster_metadata')).toBe('PgJsonb');
		expect(colMap.get('scene_id')).toBe('PgUUID');
		expect(colMap.get('case_id')).toBe('PgUUID');
		expect(colMap.get('title_id')).toBe('PgVarchar');
		expect(colMap.get('source_sha256')).toBe('PgChar');
	});

	it('uses case-scoped composite identity for scene revisions', () => {
		expect(table.primaryKeys).toHaveLength(1);
		expect(table.primaryKeys[0].columns.map((column) => column.name)).toEqual(['case_id', 'scene_id', 'revision_id']);
	});

	it('is registered as an active candidate in sidecar-migrations.json', () => {
		const sidecarPath = existsSync(resolve(root, 'drizzle/sidecar-migrations.json'))
			? resolve(root, 'drizzle/sidecar-migrations.json')
			: resolve(process.cwd(), 'sveltekit-frontend/drizzle/sidecar-migrations.json');
		const sidecars = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
			sidecars: Array<{ file: string; status?: string; reason?: string }>;
		};
		const candidate = sidecars.sidecars.find((entry) => entry.file === 'manual/20261106_atlas_spatial_keyframes_v1.sql');
		expect(candidate).toBeDefined();
		expect(candidate?.status).toBe('active_candidate');
	});
});
