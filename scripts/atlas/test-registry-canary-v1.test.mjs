import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allCanaryChecksPassed, counts, hasStableResolutionReplay } from './test-registry-canary-v1.mjs';

test('a skipped negative probe cannot satisfy the canary promotion gate', () => {
  assert.equal(allCanaryChecksPassed([{ name: 'ordinary-check', ok: true }]), true);
  assert.equal(allCanaryChecksPassed([{ name: 'key-mismatch', ok: false, status: 'NOT_EXERCISED' }]), false);
  assert.equal(allCanaryChecksPassed([{ name: 'key-mismatch', ok: true, status: 'NOT_EXERCISED' }]), false);
});

test('canary census queries only its run and exact receipt IDs', async () => {
  let captured;
  const result = await counts(async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ receipts: 2, linked: 1, unlinked: 1 }] };
  }, 'run:fixture-1', ['receipt-a', 'receipt-b']);

  assert.match(captured.sql, /run_revision = \$1 and execution_receipt_id = any\(\$2::text\[\]\)/);
  assert.deepEqual(captured.params, ['run:fixture-1', ['receipt-a', 'receipt-b']]);
  assert.deepEqual(result, { receipts: 2, linked: 1, unlinked: 1 });
});

test('unresolved classifications remain unresolved on replay', () => {
  assert.equal(hasStableResolutionReplay(
    { canonical: 1, ambiguous: 0, unresolved: 2 },
    { canonical: 1, ambiguous: 0, unresolved: 2 },
  ), true);
  assert.equal(hasStableResolutionReplay(
    { canonical: 1, ambiguous: 0, unresolved: 2 },
    { canonical: 3, ambiguous: 0, unresolved: 0 },
  ), false);
  assert.equal(hasStableResolutionReplay(
    { canonical: 1, ambiguous: 0, unresolved: 2 },
    { canonical: 1, ambiguous: 1, unresolved: 1 },
  ), false);
});
