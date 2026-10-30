import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQdrantStorageUsageV1 } from './qdrant-storage-usage-v1.mjs';

test('separates volume totals and collection WAL usage', () => {
  const parsed = parseQdrantStorageUsageV1([
    '25687686563 /qdrant',
    '20408950728 /qdrant/storage',
    '5170720640 /qdrant/snapshots',
    '67108880 /qdrant/storage/collections/example/0/wal',
    '123456 /qdrant/storage/collections/other/0/wal',
  ].join('\n'));

  assert.deepEqual(parsed, {
    bytesByPath: {
      '/qdrant': 25687686563,
      '/qdrant/storage': 20408950728,
      '/qdrant/snapshots': 5170720640,
      '/qdrant/storage/collections/example/0/wal': 67108880,
      '/qdrant/storage/collections/other/0/wal': 123456,
    },
    walByCollection: { example: 67108880, other: 123456 },
    walDirectoryCount: 2,
    walTotalBytes: 67232336,
  });
});

test('ignores malformed and unsafe byte counts', () => {
  const parsed = parseQdrantStorageUsageV1([
    'not-a-size /qdrant/storage',
    '9007199254740992 /qdrant/storage/collections/unsafe/0/wal',
    '-4 /qdrant/storage/collections/negative/0/wal',
  ].join('\n'));

  assert.deepEqual(parsed, {
    bytesByPath: {},
    walByCollection: {},
    walDirectoryCount: 0,
    walTotalBytes: 0,
  });
});
