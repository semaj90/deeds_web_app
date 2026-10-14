import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSemantic768Vector } from './semantic-768-vector.mjs';

test('accepts finite semantic_768 vectors', () => {
  const vector = Array(768).fill(0.25);
  assert.equal(requireSemantic768Vector(vector), vector);
});

test('rejects retired or unexpected vector dimensions', () => {
  assert.throws(() => requireSemantic768Vector(Array(384).fill(0)), /Expected semantic_768/);
  assert.throws(() => requireSemantic768Vector(Array(767).fill(0)), /Expected semantic_768/);
});

test('rejects non-finite vector values', () => {
  const vector = Array(768).fill(0);
  vector[10] = Number.NaN;
  assert.throws(() => requireSemantic768Vector(vector), /finite numbers/);
});
