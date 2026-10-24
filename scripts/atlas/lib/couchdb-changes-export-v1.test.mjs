import assert from 'node:assert/strict';
import test from 'node:test';
import { exportCouchDbChangesBatchV1 } from './couchdb-changes-export-v1.mjs';

const doc = { _id: 'dag:abc', _rev: '2-current', orderedIds: ['node:1', 'node:2'], cycles: [], edgesDropped: 0, queryHash: 'hash', cachedAt: '2026-10-23T00:00:00.000Z', ttlMs: 3600000 };
const responseBody = {
  results: [{ seq: 2, id: doc._id, changes: [{ rev: doc._rev }], doc }],
  last_seq: 2,
  pending: 0,
};

function options(overrides = {}) {
  return {
    baseUrl: 'http://127.0.0.1:5984',
    authorization: 'Basic Zml4dHVyZTpwYXNz',
    database: 'dag_cache',
    since: 0,
    limit: 10,
    maxResponseBytes: 1024 * 1024,
    maxDocumentBytes: 1024 * 1024,
    timeoutMs: 1000,
    fetchImpl: async () => new Response(JSON.stringify(responseBody), { headers: { 'content-type': 'application/json' } }),
    ...overrides,
  };
}

test('requests one bounded normal changes page with docs and conflicts, using header auth only', async () => {
  let observed;
  const result = await exportCouchDbChangesBatchV1(options({
    fetchImpl: async (url, init) => {
      observed = { url: new URL(url), init };
      return new Response(JSON.stringify(responseBody), { headers: { 'content-type': 'application/json' } });
    },
  }));

  assert.equal(observed.url.pathname, '/dag_cache/_changes');
  assert.equal(observed.url.searchParams.get('feed'), 'normal');
  assert.equal(observed.url.searchParams.get('include_docs'), 'true');
  assert.equal(observed.url.searchParams.get('conflicts'), 'true');
  assert.equal(observed.url.searchParams.get('limit'), '10');
  assert.equal(observed.url.searchParams.get('since'), '0');
  assert.equal(observed.url.username, '');
  assert.equal(observed.url.password, '');
  assert.equal(observed.init.method, 'GET');
  assert.equal(observed.init.headers.authorization, 'Basic Zml4dHVyZTpwYXNz');
  assert.equal(result.batch.records[0].documentRevision, doc._rev);
  assert.equal(result.batch.records[0].identityObservation.qualification, 'OBSERVED_NOT_ADMITTED');
  assert.deepEqual(result.response, {
    httpStatus: 200, recordCount: 1, responseBytes: Buffer.byteLength(JSON.stringify(responseBody)), pending: 0,
    sinceDigest: 'sha256:5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
    lastSequenceDigest: result.batch.nextCheckpoint.digest,
  });
});

test('preserves deletions and conflicting leaf revisions from the feed', async () => {
  const result = await exportCouchDbChangesBatchV1(options({
    fetchImpl: async () => new Response(JSON.stringify({
      results: [
        { id: 'dag:deleted', deleted: true, changes: [{ rev: '3-dead' }] },
        { id: doc._id, changes: [{ rev: doc._rev }, { rev: '2-conflict' }], doc: { ...doc, _conflicts: ['2-conflict'] } },
      ],
      last_seq: 'opaque-next',
    }), { headers: { 'content-type': 'application/json' } }),
  }));
  assert.equal(result.batch.records[0].deleted, true);
  assert.equal(result.batch.records[0].document, null);
  assert.equal(result.batch.records[1].conflictStatus, 'CONFLICTS_PRESENT');
  assert.deepEqual(result.batch.records[1].revisionCandidates, ['2-conflict', '2-current']);
});

test('rejects credential-bearing endpoints, unsafe database names, and unbounded limits before fetch', async () => {
  const fetchImpl = async () => { throw new Error('SHOULD_NOT_FETCH'); };
  await assert.rejects(exportCouchDbChangesBatchV1(options({ baseUrl: 'http://user:secret@127.0.0.1:5984', fetchImpl })), /COUCHDB_BASE_URL_INVALID/);
  await assert.rejects(exportCouchDbChangesBatchV1(options({ database: '../dag_cache', fetchImpl })), /DATABASE_NAME_INVALID/);
  await assert.rejects(exportCouchDbChangesBatchV1(options({ database: 'phase19_tasks', fetchImpl })), /DATABASE_NOT_ALLOWLISTED/);
  await assert.rejects(exportCouchDbChangesBatchV1(options({ limit: 1001, fetchImpl })), /LIMIT_OUT_OF_RANGE/);
});

test('rejects omitted or mismatched checkpoints before network access', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('SHOULD_NOT_FETCH'); };
  await assert.rejects(exportCouchDbChangesBatchV1(options({ since: null, fetchImpl })), /CHECKPOINT_REQUIRED/);
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    since: 'different', previousCheckpoint: { token: 'previous', digest: `sha256:${'a'.repeat(64)}` }, fetchImpl,
  })), /CHECKPOINT_REQUEST_MISMATCH/);
  assert.equal(calls, 0);
});

test('rejects unsuccessful, malformed, oversized, and over-limit responses without exposing bodies', async () => {
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    fetchImpl: async () => new Response('private server detail', { status: 401, headers: { 'content-type': 'text/plain' } }),
  })), (error) => error.message === 'COUCHDB_HTTP_401' && !error.message.includes('private'));
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    fetchImpl: async () => new Response('{', { headers: { 'content-type': 'application/json' } }),
  })), /COUCHDB_RESPONSE_JSON_INVALID/);
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    maxResponseBytes: 32,
    fetchImpl: async () => new Response(JSON.stringify(responseBody), { headers: { 'content-type': 'application/json' } }),
  })), /RESPONSE_SIZE_LIMIT_EXCEEDED/);
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    limit: 1,
    fetchImpl: async () => new Response(JSON.stringify({ ...responseBody, results: [responseBody.results[0], responseBody.results[0]] }), { headers: { 'content-type': 'application/json' } }),
  })), /COUCHDB_RESULT_LIMIT_EXCEEDED/);
});

test('enforces the request timeout while the response body is still streaming', async () => {
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
      pull() {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    }), { headers: { 'content-type': 'application/json' } }),
  })), /COUCHDB_REQUEST_TIMEOUT/);
});

test('rejects forbidden private-reasoning fields even in successful CouchDB responses', async () => {
  await assert.rejects(exportCouchDbChangesBatchV1(options({
    fetchImpl: async () => new Response(JSON.stringify({
      results: [{ id: doc._id, changes: [{ rev: doc._rev }], doc: { ...doc, hidden_thoughts: 'must not be exported' } }],
      last_seq: 2,
    }), { headers: { 'content-type': 'application/json' } }),
  })), /FORBIDDEN_PAYLOAD_FIELD/);
});
