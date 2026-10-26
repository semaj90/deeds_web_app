import assert from 'node:assert/strict';
import test from 'node:test';
import { censusCouchDbOfflineBatchWithDuckDbV1 } from './couchdb-duckdb-change-census-v1.mjs';
import { createCouchDbOfflineBatchV1 } from './couchdb-offline-batch-v1.mjs';

function batch(changes) {
  return createCouchDbOfflineBatchV1({ sourceDatabase: 'dag_cache', lastSequence: 4, changes });
}

test('DuckDB census reconciles updates, tombstones, and conflicting revisions without reading source content', async () => {
  const liveDocument = { _id: 'dag:live', _rev: '2-live', opaque: 'not copied to the census' };
  const result = await censusCouchDbOfflineBatchWithDuckDbV1(batch([
    { id: liveDocument._id, changes: [{ rev: '1-old' }, { rev: liveDocument._rev }], doc: liveDocument },
    { id: 'dag:deleted', deleted: true, changes: [{ rev: '3-dead' }] },
  ]));

  assert.deepEqual(result, {
    schema: 'atlas.couchdb-duckdb-change-census.v1',
    sourceBatchDigest: result.sourceBatchDigest,
    sourceDatabase: 'dag_cache',
    inputRecordCount: 2,
    tombstoneCount: 1,
    liveDocumentCount: 1,
    conflictedRecordCount: 1,
    distinctDocumentDigestCount: 2,
    status: 'DOCUMENT_SCHEMA_REVIEW_REQUIRED',
    reduction: 'METADATA_CENSUS_ONLY',
    contextManifest: 'NOT_ATTEMPTED',
    mastra: 'NOT_INVOKED',
    canonicalAuthority: false,
    writesPerformed: false,
  });
  assert.match(result.sourceBatchDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result, 'documents'), false);
});

test('DuckDB census fails closed for a tombstone-only batch instead of fabricating reducer input', async () => {
  const result = await censusCouchDbOfflineBatchWithDuckDbV1(batch([
    { id: 'dag:deleted', deleted: true, changes: [{ rev: '3-dead' }] },
  ]));

  assert.equal(result.status, 'NO_LIVE_DOCUMENTS');
  assert.equal(result.liveDocumentCount, 0);
  assert.equal(result.tombstoneCount, 1);
  assert.equal(result.reduction, 'METADATA_CENSUS_ONLY');
  assert.equal(result.canonicalAuthority, false);
});

test('DuckDB census records an empty changes page without promoting it', async () => {
  const result = await censusCouchDbOfflineBatchWithDuckDbV1(batch([]));

  assert.equal(result.status, 'EMPTY_CHANGE_PAGE');
  assert.equal(result.inputRecordCount, 0);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('DuckDB census rejects a tampered batch before opening an analytical session', async () => {
  const invalid = batch([]);
  invalid.batchDigest = `sha256:${'0'.repeat(64)}`;

  await assert.rejects(censusCouchDbOfflineBatchWithDuckDbV1(invalid), /COUCHDB_BATCH_INVALID:BATCH_DIGEST_MISMATCH/);
});
