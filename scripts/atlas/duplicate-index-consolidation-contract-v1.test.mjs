import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'sveltekit-frontend/drizzle/manual/20261029_duplicate_index_consolidation_v1';
const mig = fs.readFileSync(`${base}.sql`, 'utf8');
const rb = fs.readFileSync(`${base}_rollback.sql`, 'utf8');
const pf = fs.readFileSync(`${base}_preflight.sql`, 'utf8');
const manifest = JSON.parse(fs.readFileSync('docs/reports/duplicate-index-consolidation-manifest-v1.json', 'utf8'));
const activeLines = mig.split(/\r?\n/).filter((l) => /^DROP INDEX/.test(l));
const activeNames = activeLines.map((l) => l.match(/public\.(\w+);/)?.[1]);

test('state is PREPARED_NOT_APPLIED everywhere', () => {
	for (const t of [mig, rb, pf]) assert.match(t, /PREPARED_NOT_APPLIED/);
	assert.equal(manifest.state, 'PREPARED_NOT_APPLIED');
});
test('active drops are CONCURRENTLY IF EXISTS and the file has no transaction', () => {
	assert.ok(activeLines.length > 0);
	for (const l of activeLines) assert.match(l, /^DROP INDEX CONCURRENTLY IF EXISTS public\.\w+;$/);
	assert.doesNotMatch(mig.split(/\r?\n/).filter((l) => !l.startsWith('--')).join('\n'), /\b(BEGIN|COMMIT)\b/i);
});
test('every active drop is an EXACT_DUPLICATE_CANDIDATE with a rollback recreate and a preflight pair', () => {
	for (const n of activeNames) {
		const c = manifest.candidates.find((x) => x.drop === n);
		assert.ok(c, `${n} missing from manifest`);
		assert.equal(c.class, 'EXACT_DUPLICATE_CANDIDATE');
		assert.match(rb, new RegExp(`CREATE (UNIQUE )?INDEX CONCURRENTLY IF NOT EXISTS ${n} `));
		assert.ok(pf.includes(`'${n}'`));
	}
});
test('no vector, unique, constraint-backed or schema-declared index is in the active set', () => {
	for (const n of activeNames) {
		const c = manifest.candidates.find((x) => x.drop === n);
		assert.ok(!['hnsw', 'ivfflat'].includes(c.method));
		assert.doesNotMatch(c.definition, /UNIQUE/);
		assert.doesNotMatch(n, /_pkey$|_key$/);
	}
	assert.ok(manifest.candidates.filter((x) => x.method === 'hnsw').every((x) => x.class === 'PROTECTED'));
});
test('phase 2 statements stay commented out', () => {
	const live = mig.split(/\r?\n/).filter((l) => /^DROP INDEX/.test(l)).length;
	assert.equal(live, manifest.candidates.filter((x) => x.class === 'EXACT_DUPLICATE_CANDIDATE').length);
});
