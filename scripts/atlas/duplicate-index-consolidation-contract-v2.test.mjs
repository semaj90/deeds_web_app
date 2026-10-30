import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'sveltekit-frontend/drizzle/manual/20261029_duplicate_index_consolidation_v2';
const migration = fs.readFileSync(`${base}.sql`, 'utf8');
const preflight = fs.readFileSync(`${base}_preflight.sql`, 'utf8');
const postcheck = fs.readFileSync(`${base}_postcheck.sql`, 'utf8');
const rollback = fs.readFileSync(`${base}_rollback.sql`, 'utf8');
const schemaPatch = fs.readFileSync(`${base}_schema.patch`, 'utf8');
const sidecarMigrations = JSON.parse(fs.readFileSync('sveltekit-frontend/drizzle/sidecar-migrations.json', 'utf8'));
const activeDrops = migration.split(/\r?\n/).filter((line) => /^DROP INDEX CONCURRENTLY IF EXISTS public\./.test(line));
const activeNames = activeDrops.map((line) => line.match(/public\.(\w+);/)?.[1]);
const preflightPairs = [...preflight.matchAll(/\('([^']+)','([^']+)','([^']+)','([^']+)'\)/g)];

test('V2 is prepared only, concurrent, and transaction-free', () => {
	assert.match(migration, /STATE: PREPARED_NOT_APPLIED/);
	assert.equal(activeDrops.length, 32);
	assert.doesNotMatch(migration.split(/\r?\n/).filter((line) => !line.startsWith('--')).join('\n'), /\b(BEGIN|COMMIT)\b/i);
	for (const line of activeDrops) assert.match(line, /^DROP INDEX CONCURRENTLY IF EXISTS public\.\w+;$/);
	assert.doesNotMatch(migration, /^\s*(DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/im);
	const registration = sidecarMigrations.sidecars.find((entry) => entry.file === 'manual/20261029_duplicate_index_consolidation_v2.sql');
	assert.equal(registration?.status, 'active_candidate');
	assert.equal(registration?.appliedBy, null);
	assert.equal(registration?.appliedAt, null);
});

test('each active drop has rollback, preflight, and postcheck coverage', () => {
	const rollbackNames = [...rollback.matchAll(/^CREATE INDEX CONCURRENTLY IF NOT EXISTS (\w+)/gm)].map((match) => match[1]);
	const preflightNames = new Set(preflightPairs.flatMap((match) => [match[3], match[4]]));
	for (const name of activeNames) {
		assert.ok(rollbackNames.includes(name), `${name} lacks rollback recreation`);
		assert.ok(preflightNames.has(name), `${name} is absent from preflight`);
		assert.ok(postcheck.includes(`'${name}'`), `${name} is absent from postcheck`);
	}
});

test('preflight includes all 36 non-protected manifest pairs', () => {
	assert.equal(preflightPairs.length, 36);
	assert.ok(preflight.includes('Every row must be PASS before ANY group runs'));
	assert.ok(preflight.includes('PROTECTED HNSW member is intentionally absent'));
});

test('script-conflict, unique, and HNSW candidates are excluded from active drops', () => {
	for (const excluded of [
		'idx_atlas_packets_payload_path',
		'idx_atlas_packets_source_feature',
		'idx_atlas_packets_metadata_gin',
		'graph_communities_unique_idx',
		'idx_agent_observations_hnsw_768',
	]) assert.ok(!activeNames.includes(excluded), `${excluded} must remain excluded`);
});

test('schema patch removes active Drizzle duplicates and updates the exact-name validator', () => {
	const schemaDropNames = migration.split(/\r?\n/)
		.filter((line) => line.includes('[G2_SCHEMA_EDIT]'))
		.map((line) => line.match(/drop (\w+)/)?.[1])
		.filter(Boolean);
	const removedSchemaNames = new Set([...schemaPatch.matchAll(/^-.*index\('([^']+)'/gm)].map((match) => match[1]));
	assert.equal(schemaDropNames.length, 13);
	for (const name of schemaDropNames) assert.ok(removedSchemaNames.has(name), `${name} remains declared in Drizzle`);
	assert.match(schemaPatch, /-  metadataGin: index\('idx_task_semantic_packets_metadata_gin'\)/);
	assert.match(schemaPatch, /\+      'idx_task_semantic_packets_metadata',/);
	assert.match(schemaPatch, /-      'idx_task_semantic_packets_metadata_gin',/);
	assert.match(schemaPatch, /-    CREATE INDEX IF NOT EXISTS cluster_cards_centroid_dim_idx/);
	assert.match(schemaPatch, /\+    CREATE INDEX IF NOT EXISTS cluster_cards_centroid_dim/);
	assert.match(schemaPatch, /-      `CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lane_ids_gin/);
	assert.match(schemaPatch, /\+      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_lane_ids_gin/);
	assert.match(migration, /G2 must ship in the SAME reviewed change as 20261029_duplicate_index_consolidation_v2_schema\.patch/);
});

test('plan probes are estimates only and never run ANALYZE', () => {
	const planProbe = fs.readFileSync(`${base}_plan_probe.sql`, 'utf8');
	assert.match(planProbe, /EXPLAIN \(COSTS OFF\)/);
	assert.doesNotMatch(planProbe, /\bEXPLAIN\s*\([^)]*\bANALYZE\b/i);
});
