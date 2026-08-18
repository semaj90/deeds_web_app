import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileAssertionNominations,
  normalizeAssertionExpression,
} from '../dist/core/assertion-registry.js';

const base = {
  schema: 'atlas.static-assertion-observation.v1',
  stable_test_id: 'test:t1',
  source_ref: 'src/a.test.ts',
  source_revision: 'src-r1',
  assertion_kind: 'expect',
  extractor_revision: 'assertion-extractor-r1',
  canonical_authority: false,
};

test('unique assertion fingerprint ignores formatting and source location for identity', () => {
  const first = compileAssertionNominations([{ ...base, expression_text: 'expect(value).toBe(1)', byte_start: 10, byte_end: 31, line: 2, column: 3 }])[0];
  const moved = compileAssertionNominations([{ ...base, source_revision: 'src-r2', expression_text: '  expect(value)  .toBe(1)  ', byte_start: 90, byte_end: 118, line: 12, column: 5 }])[0];

  assert.equal(normalizeAssertionExpression('expect(value).toBe(1)'), 'expect(value).toBe(1)');
  assert.equal(first.expression_fingerprint, moved.expression_fingerprint);
  assert.equal(first.assertion_key, moved.assertion_key);
  assert.equal(first.requires_review, false);
});

test('duplicate identical static assertions are occurrence-scoped and review-sensitive', () => {
  const rows = compileAssertionNominations([
    { ...base, expression_text: 'expect(value).toBe(1)', byte_start: 10, byte_end: 31, line: 2, column: 3 },
    { ...base, expression_text: 'expect(value).toBe(1)', byte_start: 50, byte_end: 71, line: 5, column: 3 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].duplicate_count, 2);
  assert.equal(rows[1].duplicate_count, 2);
  assert.equal(rows[0].requires_review, true);
  assert.equal(rows[1].requires_review, true);
  assert.notEqual(rows[0].assertion_key, rows[1].assertion_key);
});

test('same expression in different canonical tests has different assertion identity', () => {
  const a = compileAssertionNominations([{ ...base, expression_text: 'expect(value).toBe(1)', byte_start: 10, byte_end: 31, line: 2, column: 3 }])[0];
  const b = compileAssertionNominations([{ ...base, stable_test_id: 'test:t2', expression_text: 'expect(value).toBe(1)', byte_start: 10, byte_end: 31, line: 2, column: 3 }])[0];
  assert.notEqual(a.assertion_key, b.assertion_key);
});
