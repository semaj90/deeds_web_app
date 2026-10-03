import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCanonicalSemantic768,
  buildMrlProjectionDiagnostics,
  cosineSimilarity,
  cosineToZeroPaddedMrl,
  deriveMrlPrefix,
  MRL_DIMENSIONS
} from './smoke-test-embedding-truncation.mjs';

test('accepts only finite flat semantic_768 as the comparison reference', () => {
  const source = new Float32Array(768).fill(0.25);
  assert.equal(assertCanonicalSemantic768(source), source);
  assert.throws(() => assertCanonicalSemantic768(new Array(384).fill(0.25)), /EXPECTED_FINITE_FLAT_SEMANTIC_768/);
  assert.throws(() => assertCanonicalSemantic768(new Array(768).fill(Number.NaN)), /SEMANTIC_768_NON_FINITE_VALUE/);
});

test('derives only named MRL 512/256/128 prefixes and L2-normalizes each view', () => {
  const source = new Float32Array(768).fill(1);
  assert.deepEqual(MRL_DIMENSIONS, [512, 256, 128]);
  for (const dimension of MRL_DIMENSIONS) {
    const projection = deriveMrlPrefix(source, dimension);
    assert.equal(projection.length, dimension);
    const norm = Math.sqrt(projection.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-6);
  }
});

test('does not admit retired 384 or arbitrary widths as MRL representations', () => {
  const source = new Float32Array(768).fill(1);
  for (const dimension of [384, 64, 1024]) {
    assert.throws(() => deriveMrlPrefix(source, dimension), /UNSUPPORTED_MRL_DIMENSION/);
  }
});

test('rejects a zero-norm selected prefix even when the 768-D source has later values', () => {
  const source = new Float32Array(768);
  source.fill(1, 512);
  assert.throws(() => deriveMrlPrefix(source, 512), /MRL_PREFIX_ZERO_OR_INVALID_NORM/);
});

test('cosine diagnostic compares equal 768-D vectors with omitted coordinates zero-filled', () => {
  const source = new Float32Array(768).fill(1);
  const projection = deriveMrlPrefix(source, 512);
  const similarity = cosineToZeroPaddedMrl(source, projection);
  assert.ok(Math.abs(similarity - Math.sqrt(512 / 768)) < 1e-6);
  assert.throws(() => cosineSimilarity([1, 2], [1]), /COSINE_DIMENSION_MISMATCH/);
  assert.equal(buildMrlProjectionDiagnostics(source).length, 3);
});
