import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSemanticSearchHitsV1 } from './semantic-search-hits-v1.mjs';

test('normalizes canonical hydrated semantic results without using physical Qdrant IDs as identity', () => {
  const rows = normalizeSemanticSearchHitsV1([{
    stable_key: 'packet:canonical-1',
    packet_key: 'packet:canonical-1',
    file_path: 'scripts/atlas/owner.mjs',
    source_ref: 'scripts/atlas/owner.mjs',
    content: 'source-bound snippet',
    semantic_score: 0.87,
    qdrant_id: 'physical-point-7',
    content_hash: 'a'.repeat(64),
  }]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'packet:canonical-1');
  assert.equal(rows[0].source_ref, 'scripts/atlas/owner.mjs');
  assert.equal(rows[0].score, 0.87);
  assert.deepEqual(rows[0].sources, ['qdrant']);
  assert.equal(rows[0].qdrant_id, 'physical-point-7');
});

test('drops malformed or unhydrated projection rows and bounds snippet size', () => {
  const rows = normalizeSemanticSearchHitsV1([
    { stable_key: 'packet:no-content', source_ref: 'src/a.ts', semantic_score: 0.8 },
    { stable_key: 'packet:no-source', content: 'x', semantic_score: 0.8 },
    { stable_key: 'packet:bad-score', source_ref: 'src/b.ts', content: 'x', semantic_score: NaN },
    { stable_key: 'packet:ok', source_ref: 'src/c.ts', content: 'x'.repeat(5000), semantic_score: 0.7 },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].content.length, 4096);
});

test('returns an empty lane for non-array input', () => {
  assert.deepEqual(normalizeSemanticSearchHitsV1(null), []);
});
