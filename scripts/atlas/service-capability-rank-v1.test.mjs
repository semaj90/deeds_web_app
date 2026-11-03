import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryOnceOnTransportFailure } from './service-capability-rank-v1.mjs';

test('transport retry succeeds once after a deterministic timeout', async () => {
  let calls = 0;
  const result = await retryOnceOnTransportFailure(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    return { ok: true, attempt: calls };
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true, attempt: 2 });
});

test('exhausted transport retry is bounded and fails closed', async () => {
  let calls = 0;
  await assert.rejects(retryOnceOnTransportFailure(async () => {
    calls++;
    throw Object.assign(new Error('network unavailable'), { code: 'ECONNRESET' });
  }), /network unavailable/);
  assert.equal(calls, 2);
});
