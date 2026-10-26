import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExecutionMode } from './apply-naive-bayes-predictions.mjs';

test('prediction mode defaults to read-only', () => {
  assert.deepEqual(resolveExecutionMode([]), { dryRun: true, apply: false });
});

test('explicit dry-run aliases remain read-only', () => {
  assert.deepEqual(resolveExecutionMode(['--dry-run']), { dryRun: true, apply: false });
  assert.deepEqual(resolveExecutionMode(['--dry']), { dryRun: true, apply: false });
});

test('database apply requires an explicit flag', () => {
  assert.deepEqual(resolveExecutionMode(['--apply']), { dryRun: false, apply: true });
});

test('conflicting execution flags fail closed', () => {
  assert.throws(() => resolveExecutionMode(['--apply', '--dry-run']), {
    message: 'CONFLICTING_EXECUTION_MODE_FLAGS',
  });
});
