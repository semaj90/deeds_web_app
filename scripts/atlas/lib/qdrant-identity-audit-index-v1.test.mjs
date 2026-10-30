import test from 'node:test';
import assert from 'node:assert/strict';
import {
	addPacketKeyRowV1,
	addPointIdRowV1,
	auditPointPayloadLineageV1,
	shouldIncludeAuditLedgerEntryV1,
	incrementPayloadCohortV1,
	hasUniquePointIdOwnerV1,
	classifyExactPointIdV1,
	lookupPacketKeyV1,
	resolveQdrantPageLimitV1,
	resolveQdrantScanLimitV1,
	resolveQdrantAuditCollectionV1,
	summarizePointIdCoverageV1,
} from './qdrant-identity-audit-index-v1.mjs';

test('packet-key index resolves a unique row in constant-time lookup shape', () => {
	const index = new Map();
	const row = { packet_key: 'packet-a', qdrant_point_id: 'point-a' };
	addPacketKeyRowV1(index, row);

	assert.deepEqual(lookupPacketKeyV1(index, 'packet-a'), { kind: 'unique', row });
	assert.deepEqual(lookupPacketKeyV1(index, 'missing'), { kind: 'missing' });
});

test('packet-key index preserves duplicate ambiguity without scanning other keys', () => {
	const index = new Map();
	addPacketKeyRowV1(index, { packet_key: 'packet-a', row_id: 1 });
	addPacketKeyRowV1(index, { packet_key: 'packet-b', row_id: 2 });
	addPacketKeyRowV1(index, { packet_key: 'packet-a', row_id: 3 });

	assert.deepEqual(lookupPacketKeyV1(index, 'packet-a'), { kind: 'ambiguous', count: 2 });
	assert.deepEqual(lookupPacketKeyV1(index, 'packet-b'), {
		kind: 'unique',
		row: { packet_key: 'packet-b', row_id: 2 },
	});
});

test('exact point identity distinguishes both-table, atlas-only, and chunk-only matches', () => {
	const atlas = new Map();
	const chunks = new Map();
	addPointIdRowV1(atlas, 'both', { packet_key: 'packet-both' });
	addPointIdRowV1(atlas, 'atlas', { packet_key: 'packet-atlas' });
	addPointIdRowV1(chunks, 'both', { chunk_id: 'chunk-both' });
	addPointIdRowV1(chunks, 'chunk', { chunk_id: 'chunk-only' });

	assert.equal(classifyExactPointIdV1('both', atlas, chunks)?.lane, 'EXACT_BOTH_TABLES');
	assert.equal(classifyExactPointIdV1('atlas', atlas, chunks)?.lane, 'EXACT_ATLAS_QDRANT_ID');
	assert.equal(classifyExactPointIdV1('chunk', atlas, chunks)?.lane, 'EXACT_CHUNK_QDRANT_ID');
	assert.equal(classifyExactPointIdV1('missing', atlas, chunks), null);
	assert.equal(classifyExactPointIdV1(42, atlas, chunks), null);
	assert.equal(summarizePointIdCoverageV1(chunks).matchedIds, 2);
});

test('exact point identity recognizes codebase_chunk_index primary IDs separately from qdrant_id', () => {
	const primaryIds = new Map();
	addPointIdRowV1(primaryIds, 'postgres-row-id', { id: 'postgres-row-id', qdrant_id: 'different-projection-id' });
	assert.equal(classifyExactPointIdV1('postgres-row-id', new Map(), new Map(), primaryIds)?.lane, 'EXACT_CHUNK_PRIMARY_ID');
	assert.equal(hasUniquePointIdOwnerV1('postgres-row-id', new Map(), new Map(), primaryIds), true);
});

test('duplicate PostgreSQL point IDs are ambiguous, not silently selected', () => {
	const atlas = new Map();
	const chunks = new Map();
	addPointIdRowV1(chunks, 'duplicate', { chunk_id: 'a' });
	addPointIdRowV1(chunks, 'duplicate', { chunk_id: 'b' });
	assert.equal(classifyExactPointIdV1('duplicate', atlas, chunks)?.lane, 'AMBIGUOUS_POINT_ID');
	assert.deepEqual(summarizePointIdCoverageV1(chunks), {
		distinctIds: 1, uniqueIds: 0, duplicateIds: 1, matchedIds: 0, missingIds: 0,
	});
});

test('unique point-ID owner recognizes either canonical PostgreSQL identity table', () => {
	const atlas = new Map();
	const chunks = new Map();
	addPointIdRowV1(atlas, 'atlas-id', { packet_key: 'p' });
	addPointIdRowV1(chunks, 'chunk-id', { chunk_id: 'c' });
	addPointIdRowV1(atlas, 'ambiguous', { packet_key: 'p1' });
	addPointIdRowV1(atlas, 'ambiguous', { packet_key: 'p2' });
	assert.equal(hasUniquePointIdOwnerV1('atlas-id', atlas, chunks), true);
	assert.equal(hasUniquePointIdOwnerV1('chunk-id', atlas, chunks), true);
	assert.equal(hasUniquePointIdOwnerV1('ambiguous', atlas, chunks), false);
	assert.equal(hasUniquePointIdOwnerV1('missing', atlas, chunks), false);
});

test('payload lineage audit reports absent and blank fields without asserting their truth', () => {
	assert.deepEqual(auditPointPayloadLineageV1({ canonical_id: 'row-1', source_revision: '  ' }, ['canonical_id', 'source_revision', 'model_artifact_revision']), {
		complete: false,
		missing: ['source_revision', 'model_artifact_revision'],
	});
	assert.deepEqual(auditPointPayloadLineageV1({ canonical_id: 'row-1' }, ['canonical_id']), { complete: true, missing: [] });
});

test('unowned-only audit ledger retains only points without a unique PostgreSQL point-ID owner', () => {
	assert.equal(shouldIncludeAuditLedgerEntryV1({ uniquePointIdOwner: true }), true);
	assert.equal(shouldIncludeAuditLedgerEntryV1({ onlyUnownedPointId: true, uniquePointIdOwner: false }), true);
	assert.equal(shouldIncludeAuditLedgerEntryV1({ onlyUnownedPointId: true, uniquePointIdOwner: true }), false);
	assert.equal(shouldIncludeAuditLedgerEntryV1({ onlyUnownedPointId: true, uniquePointIdOwner: undefined }), false);
});

test('payload cohort histogram aggregates values and bounds unique cardinality', () => {
	const cohorts = {};
	incrementPayloadCohortV1(cohorts, 'revision', { revision: 'r1' }, 2);
	incrementPayloadCohortV1(cohorts, 'revision', { revision: 'r1' }, 2);
	incrementPayloadCohortV1(cohorts, 'revision', { revision: 'r2' }, 2);
	incrementPayloadCohortV1(cohorts, 'revision', { revision: 'r3' }, 2);
	assert.deepEqual(Object.fromEntries(cohorts.revision), { r1: 2, r2: 1, __other_values__: 1 });
});

test('scan limit uses the reported collection count and rejects missing or invalid counts', () => {
	assert.equal(resolveQdrantScanLimitV1(0, null), 0);
	assert.equal(resolveQdrantScanLimitV1(100, null), 110);
	assert.equal(resolveQdrantScanLimitV1(100, 25), 25);
	assert.equal(resolveQdrantScanLimitV1(100, 500), 110);
	assert.throws(() => resolveQdrantScanLimitV1(null, null), /QDRANT_POINTS_COUNT_REQUIRED/);
	assert.throws(() => resolveQdrantScanLimitV1(100, 0), /QDRANT_AUDIT_LIMIT_INVALID/);
});

test('page limits stop exactly at the requested total without overscanning', () => {
	assert.equal(resolveQdrantPageLimitV1(null, 250), 100);
	assert.equal(resolveQdrantPageLimitV1(250, 200), 50);
	assert.equal(resolveQdrantPageLimitV1(250, 250), 0);
	assert.throws(() => resolveQdrantPageLimitV1(250, -1), /QDRANT_SCANNED_COUNT_INVALID/);
});

test('collection selector permits only the two audited semantic collections', () => {
	assert.equal(resolveQdrantAuditCollectionV1(), 'codebase_chunks_768');
	assert.equal(resolveQdrantAuditCollectionV1('codebase_chunks_768_v2'), 'codebase_chunks_768_v2');
	assert.throws(() => resolveQdrantAuditCollectionV1('other_collection'), /QDRANT_AUDIT_COLLECTION_UNSUPPORTED/);
	assert.throws(() => resolveQdrantAuditCollectionV1(''), /QDRANT_AUDIT_COLLECTION_UNSUPPORTED/);
});
