import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sceneGenerationJobs, sceneGenerationJobEvents } from './scene-generation-jobs.js';
import { analysisJobs } from '../schema-postgres.js';

const root = process.cwd();
const migrationPath = resolve(root, 'drizzle/manual/scene_generation_jobs_v1.sql');
const migration = readFileSync(migrationPath, 'utf8');
const sidecars = JSON.parse(readFileSync(resolve(root, 'drizzle/sidecar-migrations.json'), 'utf8')) as {
	sidecars: Array<{ file: string; status?: string; appliedBy?: string; reason?: string }>;
};

function sqlColumns(tableName: string): string[] {
	const body = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1];
	if (!body) throw new Error(`SCENE_SCHEMA_TABLE_MISSING:${tableName}`);
	return body.split('\n').flatMap((line) => {
		const match = /^  ([a-z][a-z0-9_]*)\s+/.exec(line);
		return match ? [match[1]] : [];
	}).sort();
}

describe('scene generation job schema candidate', () => {
	it('matches the Drizzle job and immutable event owners to the SQL columns, indexes, and checks', () => {
		for (const schema of [sceneGenerationJobs, sceneGenerationJobEvents]) {
			const table = getTableConfig(schema);
			expect(sqlColumns(table.name), table.name).toEqual(table.columns.map((column) => column.name).sort());
			for (const index of table.indexes) expect(migration, `${table.name} index ${index.config.name}`).toContain(index.config.name);
			for (const check of table.checks) expect(migration, `${table.name} check ${check.name}`).toContain(check.name);
		}
	});

	it('separates evidence-free blockouts from source-pinned jobs and keeps scene revisions canonical', () => {
		expect(migration).toMatch(/input_kind = 'BLOCKOUT' AND jsonb_array_length\(source_snapshot\) = 0/i);
		expect(migration).toMatch(/input_kind = 'EVIDENCE_BACKED' AND jsonb_array_length\(source_snapshot\) > 0/i);
		expect(migration).toMatch(/scene_generation_job_events_immutable_trg[\s\S]*?BEFORE UPDATE OR DELETE ON scene_generation_job_events/i);
		expect(migration).not.toMatch(/evidence_id\s+uuid\s+NOT NULL/i);
		expect(analysisJobs.evidenceId.notNull).toBe(true);
	});

	it('is registered as an unapplied candidate; it does not imply a writer, worker, or live schema', () => {
		const candidate = sidecars.sidecars.find((entry) => entry.file === 'manual/scene_generation_jobs_v1.sql');
		expect(candidate?.status).toBe('active_candidate');
		expect(candidate?.appliedBy).toBe('not-applied');
		expect(candidate?.reason).toMatch(/no route or worker writes/i);
	});
});
