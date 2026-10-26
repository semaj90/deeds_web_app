import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUpsertPointsRequest } from './qdrant-grpc-payload-client.mjs';

const vec = (n = 768, v = 0.01) => Array.from({ length: n }, () => v);
const good = (over = {}) => ({ id: '00000000-0000-4000-8000-000000000001', vector: vec(), payload: { packet_key: 'packet:abc', source_ref: 'src/a.ts', tags: ['x'], n: 2 }, ...over });

test('builds a named-vector `content` upsert with the payload mapped', () => {
	const req = buildUpsertPointsRequest('codebase_chunks_768_v2', [good()]);
	assert.equal(req.collectionName, 'codebase_chunks_768_v2');
	assert.equal(req.wait, true);
	assert.equal(req.points.length, 1);
	const named = req.points[0].vectors.vectorsOptions;
	assert.equal(named.case, 'vectors');
	assert.deepEqual(Object.keys(named.value.vectors), ['content']);
	assert.equal(named.value.vectors.content.vector.value.data.length, 768);
	assert.ok('packet_key' in req.points[0].payload && 'source_ref' in req.points[0].payload);
});

test('numeric ids are accepted as numeric point ids', () => {
	const req = buildUpsertPointsRequest('c', [good({ id: '42' })]);
	assert.equal(req.points[0].id.pointIdOptions.case, 'num');
});

for (const [name, mutate, code] of [
	['wrong dimension', { vector: vec(384) }, 'UPSERT_VECTOR_MUST_BE_768_FINITE_NUMBERS'],
	['NaN component', { vector: [...vec(767), NaN] }, 'UPSERT_VECTOR_MUST_BE_768_FINITE_NUMBERS'],
	['missing id', { id: '' }, 'UPSERT_ID_REQUIRED'],
	['missing packet_key', { payload: { source_ref: 's' } }, 'UPSERT_PAYLOAD_PACKET_KEY_REQUIRED'],
	['missing source_ref', { payload: { packet_key: 'p' } }, 'UPSERT_PAYLOAD_SOURCE_REF_REQUIRED'],
]) {
	test(`fails closed: ${name}`, () => {
		assert.throws(() => buildUpsertPointsRequest('c', [good(mutate)]), new RegExp(code));
	});
}

test('fails closed on empty batch and missing collection, and one bad point rejects the whole batch', () => {
	assert.throws(() => buildUpsertPointsRequest('c', []), /UPSERT_POINTS_REQUIRED/);
	assert.throws(() => buildUpsertPointsRequest('', [good()]), /UPSERT_COLLECTION_REQUIRED/);
	assert.throws(() => buildUpsertPointsRequest('c', [good(), good({ id: '' })]), /points\[1\]: UPSERT_ID_REQUIRED/);
});

test('building a request performs no network I/O (no client is created)', () => {
	const t = Date.now();
	buildUpsertPointsRequest('c', Array.from({ length: 50 }, (_, i) => good({ id: String(i + 1) })));
	assert.ok(Date.now() - t < 2000);
});
