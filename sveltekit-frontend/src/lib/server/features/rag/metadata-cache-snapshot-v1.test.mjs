import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBoundedMetadataSnapshot } from './metadata-cache-snapshot-v1.mjs';

const options = (overrides = {}) => ({
  maxPoints: 10,
  maxBytes: 1024,
  maxPages: 5,
  deadlineMs: 100,
  now: () => 0,
  mapPoint: (point) => point,
  ...overrides,
});

test('returns a snapshot only after the final page is reached', async () => {
  const pages = new Map([
    [null, { points: [{ id: 1 }], nextOffset: 'page-2' }],
    ['page-2', { points: [{ id: 2 }], nextOffset: null }],
  ]);
  const result = await collectBoundedMetadataSnapshot(async (offset) => pages.get(offset), options());

  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [{ id: 1 }, { id: 2 }]);
  assert.equal(result.pages, 2);
});

test('rejects a timed-out partial snapshot', async () => {
  let clock = 0;
  const result = await collectBoundedMetadataSnapshot(async () => {
    clock = 101;
    return { points: [{ id: 1 }], nextOffset: 'page-2' };
  }, options({ now: () => clock }));

  assert.deepEqual(result, { ok: false, reason: 'deadline', pointCount: 0, estimatedBytes: 0 });
});

test('rejects point and byte overflows rather than returning a partial result', async () => {
  const overPoints = await collectBoundedMetadataSnapshot(
    async () => ({ points: [{ id: 1 }, { id: 2 }], nextOffset: null }),
    options({ maxPoints: 1 }),
  );
  const overBytes = await collectBoundedMetadataSnapshot(
    async () => ({ points: [{ value: 'x'.repeat(100) }], nextOffset: null }),
    options({ maxBytes: 8 }),
  );

  assert.equal(overPoints.ok, false);
  assert.equal(overPoints.reason, 'point_limit');
  assert.equal(overBytes.ok, false);
  assert.equal(overBytes.reason, 'byte_limit');
});

test('rejects pagination loops and page-limit exhaustion', async () => {
  const repeated = await collectBoundedMetadataSnapshot(
    async () => ({ points: [], nextOffset: 'same' }),
    options(),
  );
  const pageLimited = await collectBoundedMetadataSnapshot(
    async () => ({ points: [], nextOffset: 'next' }),
    options({ maxPages: 1 }),
  );

  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'repeated_offset');
  assert.equal(pageLimited.ok, false);
  assert.equal(pageLimited.reason, 'page_limit');
});
