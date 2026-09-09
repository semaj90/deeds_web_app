import test from 'node:test';
import assert from 'node:assert/strict';
import { compareGraphifySourceBindingV1, parseGraphifyBatchLimitV1, graphifyBatchReviewStatusV1 } from './lib/graphify-source-binding-comparison-v1.mjs';

const digest = 'a'.repeat(64);
const expected = { sourceRef: 'src/a.ts', workspaceRevision: `sha256:${'b'.repeat(64)}`, sourceRevision: `sha256:${digest}`, contentDigest: digest, byteLength: 0 };
const row = { source_ref: expected.sourceRef, workspace_revision: expected.workspaceRevision, code_source_revision: expected.sourceRevision, content_hash: digest, byte_length: '0' };

test('exact database binding accepts valid zero-byte source and prefixed hash', () => {
  assert.equal(compareGraphifySourceBindingV1(expected, { ...row, content_hash: `sha256:${digest}` }).exact, true);
});
test('unchanged bytes do not hide workspace drift', () => {
  assert.deepEqual(compareGraphifySourceBindingV1(expected, { ...row, workspace_revision: 'old' }).mismatchedFields, ['workspaceRevision']);
});
test('missing source revision is distinct from matching content', () => {
  assert.deepEqual(compareGraphifySourceBindingV1(expected, { ...row, code_source_revision: null }).mismatchedFields, ['sourceRevision']);
});
test('changed content and byte length are independently diagnosed', () => {
  assert.deepEqual(compareGraphifySourceBindingV1(expected, { ...row, content_hash: 'c'.repeat(64), byte_length: 12 }).mismatchedFields, ['contentDigest', 'byteLength']);
});
test('null byte length cannot masquerade as an empty file', () => {
  assert.equal(compareGraphifySourceBindingV1(expected, { ...row, byte_length: null }).exact, false);
});
test('case and namespace aliases cannot establish exact source identity', () => {
  for (const source_ref of ['SRC/a.ts', 'sveltekit-frontend/src/a.ts']) {
    assert.deepEqual(compareGraphifySourceBindingV1(expected, { ...row, source_ref }).mismatchedFields, ['sourceRef']);
  }
});
test('invalid limits reject before any database query', () => {
  for (const value of ['', 'NaN', 'Infinity', '0', '-1', '1.5', '129', 'abc']) assert.throws(() => parseGraphifyBatchLimitV1(value));
  assert.equal(parseGraphifyBatchLimitV1(), 128);
  assert.equal(parseGraphifyBatchLimitV1('5'), 5);
});
test('empty population never becomes ready through vacuous equality', () => {
  assert.equal(graphifyBatchReviewStatusV1({ selectedCount: 0 }), 'CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_EMPTY_COHORT');
  assert.equal(graphifyBatchReviewStatusV1({ selectedCount: 5, needsReview: 1 }), 'CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW');
  assert.equal(graphifyBatchReviewStatusV1({ selectedCount: 5 }), 'CURRENT_GRAPHIFY_BATCH_PLAN_READY');
  assert.equal(graphifyBatchReviewStatusV1({ selectedCount: 0, databaseError: 'unavailable' }), 'CURRENT_GRAPHIFY_BATCH_PLAN_DATABASE_ERROR');
});
