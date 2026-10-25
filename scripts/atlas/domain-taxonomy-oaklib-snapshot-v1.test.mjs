import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildDomainTaxonomyOaklibReceiptV1,
	buildDomainTaxonomyOaklibSnapshotV1,
	verifyDomainTaxonomyOaklibReceiptV1,
} from './lib/domain-taxonomy-oaklib-snapshot-v1.mjs';

const fixtureRows = [
	{ group_id: 'database.postgresql', group_label: 'PostgreSQL', parent_group_id: 'database', description: 'Database engine', taxonomy_level: 1 },
	{ group_id: 'database', group_label: 'Database & Persistence', parent_group_id: null, description: 'Data stores', taxonomy_level: 0 },
];

test('snapshot serialization is deterministic and preserves explicit parent edges', () => {
	const first = buildDomainTaxonomyOaklibSnapshotV1(fixtureRows);
	const second = buildDomainTaxonomyOaklibSnapshotV1([...fixtureRows].reverse());
	assert.equal(first.oboText, second.oboText);
	assert.equal(first.sourceTaxonomyRevision, second.sourceTaxonomyRevision);
	assert.equal(first.parentEdgeCount, 1);
	assert.match(first.oboText, /id: ATLAS-DOMAIN:database\.postgresql/);
	assert.match(first.oboText, /is_a: ATLAS-DOMAIN:database ! Database & Persistence/);
	assert.equal(first.groupIdMap[0].groupId, 'database');
});

test('snapshot rejects duplicate IDs, missing parents, and invalid depth', () => {
	assert.throws(() => buildDomainTaxonomyOaklibSnapshotV1([...fixtureRows, fixtureRows[0]]), /DUPLICATED/);
	assert.throws(() => buildDomainTaxonomyOaklibSnapshotV1([
		{ ...fixtureRows[0], parent_group_id: 'missing' },
	]), /PARENT_MISSING/);
	assert.throws(() => buildDomainTaxonomyOaklibSnapshotV1([
		{ ...fixtureRows[1], taxonomy_level: 1 },
	]), /ROOT_LEVEL_INVALID/);
});

test('snapshot refuses cycles, inconsistent parent depth, and non-serializable IDs', () => {
	assert.throws(() => buildDomainTaxonomyOaklibSnapshotV1([
		{ group_id: 'a', group_label: 'A', parent_group_id: 'b', taxonomy_level: 1 },
		{ group_id: 'b', group_label: 'B', parent_group_id: 'a', taxonomy_level: 2 },
	]), /CYCLE/);
	assert.throws(() => buildDomainTaxonomyOaklibSnapshotV1([
		{ ...fixtureRows[0], taxonomy_level: 3 },
		fixtureRows[1],
	]), /LEVEL_MISMATCH/);
	assert.throws(() => buildDomainTaxonomyOaklibSnapshotV1([
		{ ...fixtureRows[1], group_id: 'not a valid id' },
	]), /UNSUPPORTED/);
});

test('receipt explicitly marks the snapshot non-authoritative and checksums its fields', () => {
	const snapshot = buildDomainTaxonomyOaklibSnapshotV1(fixtureRows);
	const receipt = buildDomainTaxonomyOaklibReceiptV1(snapshot, '.tmp/taxonomy.obo', '2026-10-24T00:00:00.000Z');
	assert.equal(receipt.canonicalAuthority, false);
	assert.equal(receipt.databaseWritesPerformed, false);
	assert.match(receipt.receiptChecksum, /^sha256:[a-f0-9]{64}$/);
	assert.equal(receipt.sourceTaxonomyRevision, snapshot.sourceTaxonomyRevision);
	assert.equal(verifyDomainTaxonomyOaklibReceiptV1(receipt), true);
	assert.equal(verifyDomainTaxonomyOaklibReceiptV1({ ...receipt, rowCount: 99 }), false);
});
