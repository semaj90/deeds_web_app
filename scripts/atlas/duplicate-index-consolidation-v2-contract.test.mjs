import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'sveltekit-frontend/drizzle/manual/20261029_duplicate_index_consolidation_v2';
const read = (s) => fs.readFileSync(`${base}${s}`, 'utf8');
const mig = read('.sql');
const rb = read('_rollback.sql');
const pf = read('_preflight.sql');
const patch = read('_schema.patch');
const man = JSON.parse(fs.readFileSync('docs/reports/duplicate-index-consolidation-manifest-v2.json', 'utf8'));
const live = mig.split(/\r?\n/).filter((l) => /^DROP INDEX/.test(l));
const dropNames = live.map((l) => l.match(/public\.(\w+);/)[1]);
const byDrop = (n) => man.candidates.find((c) => c.drop === n);

test('state and reconciliation are explicit', () => {
	for (const t of [mig, rb, pf]) assert.match(t, /PREPARED_NOT_APPLIED/);
	assert.equal(man.state, 'PREPARED_NOT_APPLIED');
	const r = man.reconciliation;
	assert.equal(r.duplicateGroups, 35);
	assert.equal(r.extraMembers, 37);
	assert.equal(r.preflightPairs, r.extraMembers - r.protectedMembers);
	assert.equal(man.candidates.length, r.extraMembers);
});
test('only approvable groups are live; no candidate is pre-approved', () => {
	assert.ok(man.candidates.every((c) => c.approvedForApply === false));
	for (const n of dropNames) assert.ok(['G0_V1_REHEARSED', 'G1_NO_SCHEMA_EDIT', 'G2_SCHEMA_EDIT'].includes(byDrop(n).group), n);
	const excluded = man.candidates.filter((c) => /^(PROTECTED|REVIEW_)/.test(c.group));
	for (const c of excluded) assert.ok(!dropNames.includes(c.drop), `${c.drop} must not be live`);
	assert.ok(excluded.some((c) => c.group === 'PROTECTED' && c.method === 'hnsw'));
});
test('statements are CONCURRENTLY IF EXISTS and the file has no transaction', () => {
	for (const l of live) assert.match(l, /^DROP INDEX CONCURRENTLY IF EXISTS public\.\w+;$/);
	assert.doesNotMatch(mig.split(/\r?\n/).filter((l) => !l.startsWith('--')).join('\n'), /\b(BEGIN|COMMIT)\b/i);
});
test('migration and rollback modify index structures only', () => {
	const migrationStatements = mig.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('--'));
	const rollbackStatements = rb.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('--'));
	assert.ok(migrationStatements.length > 0);
	assert.ok(migrationStatements.every((line) => /^DROP INDEX CONCURRENTLY IF EXISTS public\.\w+;$/.test(line)));
	assert.ok(rollbackStatements.length > 0);
	assert.ok(rollbackStatements.every((line) => /^CREATE (UNIQUE )?INDEX CONCURRENTLY IF NOT EXISTS \w+ /.test(line)));
});
test('every live drop has rollback, preflight pair, and no unique/constraint definition', () => {
	for (const n of dropNames) {
		const c = byDrop(n);
		assert.match(rb, new RegExp(`CREATE (UNIQUE )?INDEX CONCURRENTLY IF NOT EXISTS ${n} `));
		assert.ok(pf.includes(`'${n}'`));
		assert.doesNotMatch(c.definition, /UNIQUE/);
		assert.notEqual(c.keep, c.drop);
	}
});
test('G2 statements are covered by the schema patch; G1/G0 are not declared in it', () => {
	const removed = patch.split(/\r?\n/).filter((l) => /^-\s+(\w+:\s*)?index\(/.test(l));
	const g2 = man.candidates.filter((c) => c.group === 'G2_SCHEMA_EDIT');
	assert.equal(removed.length, g2.length);
	for (const c of g2) assert.ok(patch.includes(`'${c.drop}'`), c.drop);
	for (const c of man.candidates.filter((x) => x.group === 'G1_NO_SCHEMA_EDIT' || x.group === 'G0_V1_REHEARSED')) assert.ok(!patch.includes(`'${c.drop}'`), c.drop);
});
test('script-named drop targets are never live', () => {
	for (const c of man.candidates.filter((x) => x.group === 'REVIEW_SCRIPT_CONFLICT')) assert.ok(!dropNames.includes(c.drop));
	const laneIds = byDrop('nes_chrom_packets_lane_ids_gin');
	assert.ok(laneIds);
	assert.ok(patch.includes(`'${laneIds.keep}'`));
	assert.doesNotMatch(patch, /diff --git a\/scripts\/atlas\/repair-packet-contract-mirrors\.mjs/);
	const addedScriptIndexStatements = patch
		.split(/\r?\n/)
		.filter((line) => /^\+.*CREATE INDEX IF NOT EXISTS/.test(line));
	for (const candidate of man.candidates) {
		assert.ok(
			!addedScriptIndexStatements.some((line) => line.includes(candidate.drop)),
			`schema patch must not make scripts recreate proposed drop ${candidate.drop}`
		);
	}
});
