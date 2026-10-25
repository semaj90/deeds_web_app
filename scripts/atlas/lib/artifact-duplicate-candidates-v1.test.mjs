import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupDuplicateCandidatesByFingerprint,
  groupDuplicateCandidatesBySize,
  mapWithConcurrency,
} from './artifact-duplicate-candidates-v1.mjs';

test('only same-size files within their hash limits become duplicate candidates', () => {
  const entries = [
    { relPath: 'a', sizeBytes: 4, maxHashBytes: 10 },
    { relPath: 'b', sizeBytes: 4, maxHashBytes: 10 },
    { relPath: 'unique', sizeBytes: 5, maxHashBytes: 10 },
    { relPath: 'too-large', sizeBytes: 20, maxHashBytes: 10 },
  ];
  assert.deepEqual(groupDuplicateCandidatesBySize(entries).map(({ relPath }) => relPath), ['a', 'b']);
});

test('uses each artifact hash limit and retains same-size candidates eligible under their own limits', () => {
  const entries = [
    { relPath: 'small-a', sizeBytes: 15, maxHashBytes: 10 },
    { relPath: 'large-a', sizeBytes: 15, maxHashBytes: 20 },
    { relPath: 'large-b', sizeBytes: 15, maxHashBytes: 20 },
  ];
  assert.deepEqual(groupDuplicateCandidatesBySize(entries).map(({ relPath }) => relPath), ['large-a', 'large-b']);
});

test('rejects invalid sizes rather than grouping them', () => {
  const entries = [
    { relPath: 'negative', sizeBytes: -1, maxHashBytes: 10 },
    { relPath: 'fractional', sizeBytes: 1.5, maxHashBytes: 10 },
    { relPath: 'unsafe', sizeBytes: Number.MAX_SAFE_INTEGER + 1, maxHashBytes: Number.MAX_SAFE_INTEGER + 2 },
  ];
  assert.deepEqual(groupDuplicateCandidatesBySize(entries), []);
});

test('fingerprint candidates require both equal size and equal fingerprint', () => {
  const entries = [
    { relPath: 'same-a', sizeBytes: 10, fingerprint: 'head-tail-a' },
    { relPath: 'same-b', sizeBytes: 10, fingerprint: 'head-tail-a' },
    { relPath: 'different-content', sizeBytes: 10, fingerprint: 'head-tail-b' },
    { relPath: 'different-size', sizeBytes: 11, fingerprint: 'head-tail-a' },
  ];
  assert.deepEqual(
    groupDuplicateCandidatesByFingerprint(entries, (entry) => entry.fingerprint).map(({ relPath }) => relPath),
    ['same-a', 'same-b'],
  );
});

test('bounded mapping preserves input order and respects the concurrency limit', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(result, [0, 2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
});

test('bounded mapping propagates mapper failures', async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('expected');
      return value;
    }),
    /expected/,
  );
});
