import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsnCheckpointFromRead, validateUsnCheckpoint } from './ntfs-usn-checkpoint-v1.mjs';

const checkpoint = {
  schema: 'atlas.ntfs-usn-checkpoint.v1',
  volumeId: 'volume-c',
  journalId: 'journal-1',
  nextUsn: '100',
};
const journal = {
  volumeId: 'volume-c',
  journalId: 'journal-1',
  lowestValidUsn: '90',
  nextUsn: '120',
};

const readResult = {
  ok: true,
  schema: 'atlas.ntfs-usn-read.v1',
  volumeId: 'volume-c',
  journalId: 'journal-1',
  startUsn: '95',
  lowestValidUsn: '90',
  nextUsn: '120',
  nextReadUsn: '110',
  truncated: true,
  recordCount: 1,
  records: [{ fileId: '1', parentId: '2', usn: '109' }],
};

test('creates the checkpoint at the last fully consumed journal buffer', () => {
  assert.deepEqual(createUsnCheckpointFromRead(readResult), {
    ok: true,
    checkpoint: { schema: 'atlas.ntfs-usn-checkpoint.v1', volumeId: 'volume-c', journalId: 'journal-1', nextUsn: '110' },
  });
});

test('preserves the first unreturned record as a capped-batch resume position', () => {
  const cappedRead = {
    ...readResult,
    startUsn: '100',
    nextReadUsn: '109',
    nextUsn: '120',
    truncated: true,
  };
  const result = createUsnCheckpointFromRead(cappedRead);
  assert.equal(result.ok, true);
  assert.equal(result.checkpoint.nextUsn, '109');
});

test('refuses malformed or out-of-range read receipts', () => {
  assert.equal(createUsnCheckpointFromRead({ ...readResult, recordCount: 2 }).reason, 'USN_READ_RECEIPT_SHAPE_INVALID');
  assert.equal(createUsnCheckpointFromRead({ ...readResult, nextReadUsn: '121' }).reason, 'USN_READ_RANGE_INVALID');
  assert.equal(createUsnCheckpointFromRead({ ...readResult, startUsn: '80', nextReadUsn: '89' }).reason, 'JOURNAL_GAP_REQUIRES_FULL_SCAN');
  assert.equal(createUsnCheckpointFromRead({ ...readResult, ok: false }).reason, 'USN_READ_RECEIPT_INVALID');
});

test('accepts a checkpoint covered by the same journal', () => {
  assert.deepEqual(validateUsnCheckpoint(checkpoint, journal), {
    incremental: true,
    reason: 'CHECKPOINT_CONTIGUOUS',
    startUsn: '100',
  });
});

test('requires a full scan after journal recreation or volume change', () => {
  assert.equal(validateUsnCheckpoint(checkpoint, { ...journal, journalId: 'journal-2' }).reason, 'JOURNAL_ID_MISMATCH');
  assert.equal(validateUsnCheckpoint(checkpoint, { ...journal, volumeId: 'volume-d' }).reason, 'VOLUME_ID_MISMATCH');
});

test('requires a full scan when the saved USN predates retained records', () => {
  assert.equal(validateUsnCheckpoint({ ...checkpoint, nextUsn: '89' }, journal).reason, 'JOURNAL_GAP_REQUIRES_FULL_SCAN');
});

test('rejects checkpoints ahead of the journal and malformed counters', () => {
  assert.equal(validateUsnCheckpoint({ ...checkpoint, nextUsn: '121' }, journal).reason, 'CHECKPOINT_AHEAD_OF_JOURNAL');
  assert.equal(validateUsnCheckpoint({ ...checkpoint, nextUsn: '0100' }, journal).reason, 'INVALID_USN_CHECKPOINT_NEXT');
});

test('fails closed when journal identity or schema is unavailable', () => {
  assert.equal(validateUsnCheckpoint({ ...checkpoint, schema: 'other' }, journal).reason, 'CHECKPOINT_SCHEMA_MISMATCH');
  assert.equal(validateUsnCheckpoint(checkpoint, null).reason, 'JOURNAL_IDENTITY_UNAVAILABLE');
});
