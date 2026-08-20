import assert from 'node:assert/strict';
import {
  detectVectorTargets,
  inspectEmb2Jsonl,
  l2Norm,
  pointVector,
  selectExpectedVectorTarget,
} from './prove-emb3a-qdrant-semantic-projection.mjs';

const named = detectVectorTargets({
  semantic_768: { size: 768, distance: 'Cosine', on_disk: true },
  latent_128: { size: 128, distance: 'Cosine' },
});
assert.equal(named.length, 2);
assert.deepEqual(selectExpectedVectorTarget(named, 768, 'semantic_768'), {
  mode: 'named',
  name: 'semantic_768',
  size: 768,
  distance: 'Cosine',
  onDisk: true,
});

const unnamed = detectVectorTargets({ size: 768, distance: 'Cosine' });
assert.equal(unnamed[0].mode, 'unnamed');
assert.equal(unnamed[0].size, 768);
assert.equal(selectExpectedVectorTarget(unnamed, 512, 'semantic_512'), null);

const vector768 = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
assert.equal(pointVector({ vector: vector768 }, unnamed), vector768);
assert.equal(pointVector({ vector: { semantic_768: vector768 } }, named[0]), vector768);
assert.equal(l2Norm(vector768), 1);

const jsonl = [
  JSON.stringify({ packet_key: 'p1', semantic_768: vector768 }),
  JSON.stringify({ packet_key: 'p2', embedding: { values: vector768 } }),
].join('\n');
const inspection = inspectEmb2Jsonl(jsonl, 768);
assert.equal(inspection.lineCount, 2);
assert.equal(inspection.parsedCount, 2);
assert.equal(inspection.vectorCount, 2);
assert.equal(inspection.normalizedVectorCount, 2);
assert.equal(inspection.allVectorsExpectedDimension, true);
assert.equal(inspection.allVectorsNormalized, true);
assert.deepEqual(inspection.errors, []);

const invalid = inspectEmb2Jsonl(`${JSON.stringify({ semantic_768: [1, 0] })}\nnot-json`, 768);
assert.equal(invalid.lineCount, 2);
assert.equal(invalid.parsedCount, 1);
assert.equal(invalid.vectorCount, 0);
assert.equal(invalid.allVectorsExpectedDimension, false);
assert.equal(invalid.errors.length, 1);

console.log(JSON.stringify({
  schema: 'atlas.emb3a-qdrant-semantic-projection-test.v1',
  status: 'PASS',
  liveQdrantRequired: false,
  mutationAttempted: false,
}));
