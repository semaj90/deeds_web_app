import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_INDEX_FILE_BYTES,
  exceedsIndexFileSizeLimit,
  parseMaxIndexFileBytes,
} from './index-file-size-policy-v1.mjs';

test('defaults to a bounded 5 MiB file size for broad indexing', () => {
  assert.equal(parseMaxIndexFileBytes(), DEFAULT_MAX_INDEX_FILE_BYTES);
  assert.equal(DEFAULT_MAX_INDEX_FILE_BYTES, 5 * 1024 * 1024);
});

test('accepts an explicit positive safe-integer override', () => {
  assert.equal(parseMaxIndexFileBytes('10485760'), 10 * 1024 * 1024);
});

test('rejects invalid size overrides', () => {
  for (const value of ['0', '-1', '1.5', 'Infinity', 'not-a-number']) {
    assert.throws(() => parseMaxIndexFileBytes(value), /INDEX_MAX_FILE_BYTES_INVALID/);
  }
});

test('skips files over the limit but permits the exact boundary', () => {
  assert.equal(exceedsIndexFileSizeLimit(5, 5), false);
  assert.equal(exceedsIndexFileSizeLimit(6, 5), true);
});

test('fails closed for invalid file sizes', () => {
  assert.equal(exceedsIndexFileSizeLimit(-1, 5), true);
  assert.equal(exceedsIndexFileSizeLimit(Number.NaN, 5), true);
});
