import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertValidVector, deterministicPointId, documentPointIdV5 } from './index-programming-docs-qdrant.mjs';

const identity = {
  packetKey: 'pk-1',
  chunkId: 'nodejs:nodejs22-reference:b931ac4f',
  sourceRevision: 'sha256:' + 'a'.repeat(64),
  representationRevision: 'semantic_768:r1',
  embeddingModelRevision: 'embeddinggemma:latest@r1',
};

test('rejects zero-norm, wrong-length and non-finite embeddings', () => {
  assert.throws(() => assertValidVector(new Array(768).fill(0)), /EMBEDDING_ZERO_NORM/);
  assert.throws(() => assertValidVector(new Array(384).fill(0.1)), /EMBEDDING_DIMENSION_MISMATCH/);
  const bad = new Array(768).fill(0.1);
  bad[3] = Number.NaN;
  assert.throws(() => assertValidVector(bad), /EMBEDDING_NON_FINITE_VALUE/);
});

test('accepts a finite 768D vector with nonzero norm', () => {
  const v = new Array(768).fill(0.01);
  assert.equal(assertValidVector(v), v);
});

test('v5 point ID is deterministic with v5 version and RFC variant bits', () => {
  const a = documentPointIdV5(identity);
  assert.equal(a, documentPointIdV5({ ...identity }));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('v5 point ID changes when any identity field changes', () => {
  const base = documentPointIdV5(identity);
  for (const k of Object.keys(identity)) {
    assert.notEqual(documentPointIdV5({ ...identity, [k]: identity[k] + 'x' }), base, k);
  }
});

test('v5 framing prevents field-boundary ambiguity', () => {
  const a = documentPointIdV5({ ...identity, packetKey: 'ab', chunkId: 'c' });
  const b = documentPointIdV5({ ...identity, packetKey: 'a', chunkId: 'bc' });
  assert.notEqual(a, b);
});

test('v5 point ID refuses incomplete identity', () => {
  assert.throws(() => documentPointIdV5({ ...identity, chunkId: '  ' }), /PROJECTION_IDENTITY_INCOMPLETE/);
  assert.throws(() => documentPointIdV5({ ...identity, packetKey: undefined }), /PROJECTION_IDENTITY_INCOMPLETE/);
});

test('legacy point ID stays deterministic (migration not approved)', () => {
  const a = deterministicPointId('chunk:alpha');
  assert.equal(a, deterministicPointId('chunk:alpha'));
  assert.equal(typeof a, 'number');
  assert.ok(a >= 0 && a < 2147483648);
});
