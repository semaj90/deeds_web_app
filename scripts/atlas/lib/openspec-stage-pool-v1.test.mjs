import test from 'node:test';
import assert from 'node:assert/strict';
import { runBoundedStagePool } from './openspec-stage-pool-v1.mjs';

test('bounded stage pool respects concurrency and preserves input order', async () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  let active = 0;
  let peak = 0;
  const results = await runBoundedStagePool(items, 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, item === 'a' ? 12 : 2));
    active -= 1;
    return item.toUpperCase();
  });
  assert.deepEqual(results, ['A', 'B', 'C', 'D', 'E']);
  assert.equal(peak, 2);
});

test('bounded stage pool handles empty work without starting workers', async () => {
  let calls = 0;
  const results = await runBoundedStagePool([], 3, async () => { calls += 1; });
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});

test('bounded stage pool rejects invalid concurrency', async () => {
  await assert.rejects(runBoundedStagePool([], 0, async () => {}), /STAGE_POOL_CONCURRENCY/);
});

test('bounded stage pool waits for in-flight work after a failure', async () => {
  let settled = false;
  await assert.rejects(runBoundedStagePool([1, 2, 3], 2, async (item) => {
    if (item === 1) throw new Error('stage failed');
    await new Promise((resolve) => setTimeout(resolve, 10));
    settled = true;
  }), /stage failed/);
  assert.equal(settled, true);
});
