import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExactQdrantPointOwnerId } from './qdrant-exact-point-owner-v1.mjs';

const pointId = '1550075d-9042-4953-bc75-90b50a9a8c5c';

test('accepts only the exact Qdrant point owned by the canonical chunk row', () => {
  assert.equal(
    resolveExactQdrantPointOwnerId(
      { canonical_chunk_id: pointId },
      { id: pointId, payload: { postgres_id: pointId } },
    ),
    pointId,
  );
});

test('rejects a matching payload owner on a different Qdrant point', () => {
  assert.equal(
    resolveExactQdrantPointOwnerId(
      { canonical_chunk_id: pointId },
      { id: '2', payload: { postgres_id: pointId } },
    ),
    null,
  );
});

test('rejects a Qdrant point whose payload names another canonical row', () => {
  assert.equal(
    resolveExactQdrantPointOwnerId(
      { canonical_chunk_id: pointId },
      { id: pointId, payload: { postgres_id: 'another-row' } },
    ),
    null,
  );
});

test('rejects missing canonical IDs and missing point payloads', () => {
  assert.equal(resolveExactQdrantPointOwnerId({}, { id: pointId, payload: { postgres_id: pointId } }), null);
  assert.equal(resolveExactQdrantPointOwnerId({ canonical_chunk_id: pointId }, { id: pointId }), null);
});
