import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyCouchDbOfflineBatchV1,
  createCouchDbOfflineBatchV1,
  createCouchDbReplayStateV1,
  readBackCouchDbOfflineBatchArtifactV1,
  sha256CouchDbV1,
  summarizeCouchDbReplayV1,
  verifyCouchDbOfflineBatchV1,
  writeCouchDbOfflineBatchArtifactV1,
} from './couchdb-offline-batch-v1.mjs';

const token1 = { update_seq: '12-g1' };
const token2 = { update_seq: '14-g2' };

function batch(changes, lastSequence, previousCheckpoint = null) {
  return createCouchDbOfflineBatchV1({
    sourceDatabase: 'dag_cache',
    previousCheckpoint,
    lastSequence,
    changes,
  });
}

test('normalizes updates while preserving observed identity as unadmitted', () => {
  const result = batch([{
    id: 'doc-a',
    changes: [{ rev: '2-b' }],
    doc: { _id: 'doc-a', _rev: '2-b', title: 'updated' },
    identityObservation: {
      packetIdentity: { packetKey: 'packet:a' },
      sourceRevision: 'sha256:source-observation',
      representationRevision: 'semantic_768:observed',
    },
  }], token1);
  assert.equal(result.schema, 'atlas.couchdb-offline-batch.v1');
  assert.equal(result.records[0].document.title, 'updated');
  assert.equal(result.records[0].identityObservation.packetIdentity.packetKey, 'packet:a');
  assert.equal(result.records[0].identityObservation.qualification, 'OBSERVED_NOT_ADMITTED');
  assert.equal(result.canonicalAuthority, false);
  assert.deepEqual(verifyCouchDbOfflineBatchV1(result), { valid: true, reason: null });
});

test('preserves tombstones and conflicting revision candidates without resolving them', () => {
  const result = batch([
    { id: 'doc-deleted', changes: [{ rev: '3-c' }], deleted: true },
    { id: 'doc-conflict', changes: [{ rev: '2-b' }, { rev: '2-a' }], doc: { _id: 'doc-conflict', _rev: '2-b', _conflicts: ['2-a'], value: 1 } },
  ], token1);
  assert.equal(result.records[0].deleted, true);
  assert.equal(result.records[0].document, null);
  assert.equal(result.records[0].documentDigest, sha256CouchDbV1({ _id: 'doc-deleted', _rev: '3-c', _deleted: true }));
  assert.equal(result.records[1].conflictStatus, 'CONFLICTS_PRESENT');
  assert.deepEqual(result.records[1].revisionCandidates, ['2-a', '2-b']);
});

test('rejects malformed identity, revision sets, and hidden-state payload fields', () => {
  assert.throws(() => batch([{ id: 'doc-a', changes: [], doc: { _id: 'doc-a', _rev: '1-a' } }], token1), /CHANGE_REVISIONS_MISSING/);
  assert.throws(() => batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'other', _rev: '1-a' } }], token1), /DOCUMENT_ID_MISMATCH/);
  assert.throws(() => batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '2-b' } }], token1), /WINNING_REVISION_NOT_IN_CHANGE_SET/);
  assert.throws(() => batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a', context: { hidden_thoughts: 'no' } } }], token1), /FORBIDDEN_PAYLOAD_FIELD/);
});

test('enforces explicit payload byte bounds', () => {
  assert.throws(() => createCouchDbOfflineBatchV1({
    sourceDatabase: 'dag_cache',
    lastSequence: token1,
    changes: [{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a', text: 'long' } }],
  }, { maxDocumentBytes: 8 }), /DOCUMENT_SIZE_LIMIT_EXCEEDED/);
});

test('detects tampering with a batch record or its checkpoint', () => {
  const original = batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a' } }], token1);
  assert.equal(verifyCouchDbOfflineBatchV1({ ...original, records: [{ ...original.records[0], documentRevision: '9-z' }] }).reason, 'RECORDS_DIGEST_MISMATCH');
  assert.equal(verifyCouchDbOfflineBatchV1({ ...original, nextCheckpoint: { token: token2, digest: original.nextCheckpoint.digest } }).reason, 'NEXT_CHECKPOINT_DIGEST_MISMATCH');
  const changedRecords = [{ ...original.records[0], document: { _id: 'doc-a', _rev: '1-a', injected: true } }];
  const changedBody = { ...original, records: changedRecords, recordsDigest: sha256CouchDbV1(changedRecords) };
  delete changedBody.batchDigest;
  const resealedMetadata = { ...changedBody, batchDigest: sha256CouchDbV1(changedBody) };
  assert.equal(verifyCouchDbOfflineBatchV1(resealedMetadata).reason, 'DOCUMENT_DIGEST_MISMATCH:0');
});

test('replays updates, deletion, and conflicts deterministically across an interrupted checkpoint', () => {
  const first = batch([
    { id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a', value: 'old' } },
    { id: 'doc-b', changes: [{ rev: '1-b' }], doc: { _id: 'doc-b', _rev: '1-b', value: 'kept' } },
  ], token1);
  const firstApplied = applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), first);
  const resumedState = JSON.parse(JSON.stringify(firstApplied.state));
  const second = batch([
    { id: 'doc-a', changes: [{ rev: '2-a' }], doc: { _id: 'doc-a', _rev: '2-a', value: 'new' } },
    { id: 'doc-b', changes: [{ rev: '2-b' }], deleted: true },
    { id: 'doc-c', changes: [{ rev: '2-c' }, { rev: '2-d' }], doc: { _id: 'doc-c', _rev: '2-c', _conflicts: ['2-d'], value: 'conflicted' } },
  ], token2, { token: token1, digest: sha256CouchDbV1(token1) });
  const result = applyCouchDbOfflineBatchV1(resumedState, second);
  const summary = summarizeCouchDbReplayV1(result.state);
  assert.equal(summary.documentCount, 2);
  assert.equal(summary.tombstoneCount, 1);
  assert.equal(summary.conflictCount, 1);
  assert.equal(summary.documents.find((doc) => doc.documentId === 'doc-a').document.value, 'new');
  assert.equal(summary.documents.find((doc) => doc.documentId === 'doc-b').deleted, true);
  assert.equal(summarizeCouchDbReplayV1(result.state).summaryDigest, summary.summaryDigest);
  assert.equal(applyCouchDbOfflineBatchV1(result.state, second).replayed, true);
});

test('rejects out-of-order checkpoints and invalid predecessor digests', () => {
  const first = batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a' } }], token1);
  const second = batch([], token2, { token: token1, digest: sha256CouchDbV1(token1) });
  assert.throws(() => applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), second), /CHECKPOINT_CHAIN_MISMATCH/);
  assert.throws(() => batch([], token2, { token: token1, digest: sha256CouchDbV1(token2) }), /PREVIOUS_CHECKPOINT_DIGEST_MISMATCH/);
  assert.equal(applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), first).replayed, false);
});

test('uses deterministic canonical digests independent of object key order', () => {
  assert.equal(sha256CouchDbV1({ z: 1, a: { y: true, x: 2 } }), sha256CouchDbV1({ a: { x: 2, y: true }, z: 1 }));
  const left = batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a', z: 1, a: 2 } }], token1);
  const right = batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { a: 2, _rev: '1-a', _id: 'doc-a', z: 1 } }], token1);
  assert.equal(left.batchDigest, right.batchDigest);
});

test('writes exclusive NDJSON artifacts and independently verifies the receipt readback', (context) => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'atlas-couchdb-batch-'));
  context.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const runDirectory = path.join(temporaryRoot, 'run-1');
  const sourceBatch = batch([{ id: 'doc-a', changes: [{ rev: '1-a' }], doc: { _id: 'doc-a', _rev: '1-a', value: 1 } }], token1);
  const receipt = writeCouchDbOfflineBatchArtifactV1(sourceBatch, runDirectory);
  const readback = readBackCouchDbOfflineBatchArtifactV1(runDirectory);
  assert.equal(receipt.batchDigest, sourceBatch.batchDigest);
  assert.equal(receipt.canonicalAuthority, false);
  assert.equal(receipt.datastoreWrites, false);
  assert.deepEqual(readback.batch, sourceBatch);
  assert.equal(readback.receipt.receiptChecksum, receipt.receiptChecksum);
  assert.equal(readFileSync(path.join(runDirectory, 'records.ndjson'), 'utf8').trim().split('\n').length, 1);
  assert.throws(() => writeCouchDbOfflineBatchArtifactV1(sourceBatch, runDirectory));
});

test('refuses an interrupted artifact directory without a complete receipt', (context) => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'atlas-couchdb-batch-incomplete-'));
  context.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const runDirectory = path.join(temporaryRoot, 'interrupted');
  mkdirSync(runDirectory);
  writeFileSync(path.join(runDirectory, 'batch.json'), '{}');
  assert.throws(() => readBackCouchDbOfflineBatchArtifactV1(runDirectory), /ARTIFACT_READBACK_INCOMPLETE/);
});
