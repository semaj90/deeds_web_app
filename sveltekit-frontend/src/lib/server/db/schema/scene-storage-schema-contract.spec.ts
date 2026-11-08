import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sceneDocumentRevisions } from './scene-document-revisions.js';
import { sceneAssets } from './scene-assets.js';
import { sceneAssetFiles } from './scene-asset-files.js';

const root = process.cwd();
const migrationPath = resolve(root, 'drizzle/manual/scene_document_revisions.sql');
const migration = readFileSync(migrationPath, 'utf8');
const sidecars = JSON.parse(readFileSync(resolve(root, 'drizzle/sidecar-migrations.json'), 'utf8')) as {
	sidecars: Array<{ file: string; status?: string; appliedBy?: string; reason?: string }>;
};

function tableBody(tableName: string): string {
	const body = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1];
	if (!body) throw new Error(`SCENE_SCHEMA_TABLE_MISSING:${tableName}`);
	return body;
}

function sqlColumns(tableName: string): string[] {
	return tableBody(tableName).split('\n').flatMap((line) => {
		const match = /^  ([a-z][a-z0-9_]*)\s+/.exec(line);
		return match ? [match[1]] : [];
	}).sort();
}

describe('case scene candidate SQL and Drizzle contract', () => {
	const tables = [sceneDocumentRevisions, sceneAssets, sceneAssetFiles];

	it('has the same columns as all three Drizzle owners', () => {
		for (const schema of tables) {
			const table = getTableConfig(schema);
			expect(sqlColumns(table.name), table.name).toEqual(table.columns.map((column) => column.name).sort());
		}
	});

	it('uses the exact Drizzle index and check names in SQL', () => {
		for (const schema of tables) {
			const table = getTableConfig(schema);
			for (const index of table.indexes) expect(migration, `${table.name} index ${index.config.name}`).toContain(index.config.name);
			for (const check of table.checks) expect(migration, `${table.name} check ${check.name}`).toContain(check.name);
		}
		expect(migration).toMatch(/scene_document_revisions_head_idx\s+ON scene_document_revisions \(case_id, scene_id, revision DESC\)/i);
	});

	it('keeps append-only triggers and restrictive case/asset references in the candidate', () => {
		for (const tableName of ['scene_document_revisions', 'scene_assets', 'scene_asset_files']) {
			expect(migration).toMatch(new RegExp(`CREATE TRIGGER ${tableName}_immutable_trg[\\s\\S]*?BEFORE UPDATE OR DELETE ON ${tableName}`, 'i'));
		}
		expect(migration).toMatch(/case_id uuid NOT NULL REFERENCES cases\(id\) ON DELETE RESTRICT/i);
		expect(migration).toMatch(/asset_id uuid NOT NULL REFERENCES scene_assets\(asset_id\) ON DELETE RESTRICT/i);
	});

	it('remains an explicitly unapplied sidecar candidate', () => {
		const candidate = sidecars.sidecars.find((entry) => entry.file === 'manual/scene_document_revisions.sql');
		expect(candidate?.status).toBe('active_candidate');
		expect(candidate?.appliedBy).toBe('not-applied');
		expect(candidate?.reason).toMatch(/not rehearsed or applied/i);
	});
});
