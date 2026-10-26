import {
  canonicalJsonCouchDbV1,
  createCouchDbOfflineBatchV1,
  sha256CouchDbV1,
} from './couchdb-offline-batch-v1.mjs';

const DATABASE_RE = /^[a-z][a-z0-9_$()+-]*$/;
export const COUCHDB_EXPORT_DATABASES_V1 = Object.freeze(['dag_cache']);

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('EXPORT_INPUT_INVALID');
  let baseUrl;
  try { baseUrl = new URL(input.baseUrl); } catch { throw new Error('COUCHDB_BASE_URL_INVALID'); }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('COUCHDB_BASE_URL_INVALID');
  }
  if (!/^Basic [A-Za-z0-9+/]+=*$/.test(input.authorization ?? '')) throw new Error('COUCHDB_AUTHORIZATION_INVALID');
  if (typeof input.database !== 'string' || !DATABASE_RE.test(input.database)) throw new Error('DATABASE_NAME_INVALID');
  if (!COUCHDB_EXPORT_DATABASES_V1.includes(input.database)) throw new Error('DATABASE_NOT_ALLOWLISTED');
  if (input.since === undefined || input.since === null) throw new Error('CHECKPOINT_REQUIRED');
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) throw new Error('LIMIT_OUT_OF_RANGE');
  if (!Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes < 1 || input.maxResponseBytes > 64 * 1024 * 1024) {
    throw new Error('RESPONSE_LIMIT_OUT_OF_RANGE');
  }
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 120_000) throw new Error('TIMEOUT_OUT_OF_RANGE');
  if (typeof input.fetchImpl !== 'function') throw new Error('FETCH_IMPLEMENTATION_REQUIRED');
  return baseUrl;
}

async function readBoundedBody(response, maximumBytes) {
  const advertisedSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertisedSize) && advertisedSize > maximumBytes) throw new Error('RESPONSE_SIZE_LIMIT_EXCEEDED');
  if (!response.body) throw new Error('RESPONSE_BODY_MISSING');

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('RESPONSE_SIZE_LIMIT_EXCEEDED');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

export async function exportCouchDbChangesBatchV1(input) {
  const baseUrl = validateInput(input);
  if (input.previousCheckpoint && canonicalJsonCouchDbV1(input.previousCheckpoint.token) !== canonicalJsonCouchDbV1(input.since)) {
    throw new Error('CHECKPOINT_REQUEST_MISMATCH');
  }
  const url = new URL(`${encodeURIComponent(input.database)}/_changes`, `${baseUrl.toString().replace(/\/+$/, '')}/`);
  const since = typeof input.since === 'string' ? input.since : canonicalJsonCouchDbV1(input.since);
  url.searchParams.set('feed', 'normal');
  url.searchParams.set('include_docs', 'true');
  url.searchParams.set('conflicts', 'true');
  url.searchParams.set('limit', String(input.limit));
  url.searchParams.set('since', since);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('COUCHDB_REQUEST_TIMEOUT')), input.timeoutMs);
  let response;
  try {
    response = await input.fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: input.authorization },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (controller.signal.aborted) throw new Error('COUCHDB_REQUEST_TIMEOUT');
    throw new Error('COUCHDB_REQUEST_FAILED');
  }
  try {
    if (!response.ok) throw new Error(`COUCHDB_HTTP_${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) throw new Error('COUCHDB_RESPONSE_CONTENT_TYPE_INVALID');

    let payload;
    let responseBytes;
    try {
      const responseText = await readBoundedBody(response, input.maxResponseBytes);
      responseBytes = Buffer.byteLength(responseText, 'utf8');
      payload = JSON.parse(responseText);
    } catch (error) {
      if (error instanceof Error && error.message === 'RESPONSE_SIZE_LIMIT_EXCEEDED') throw error;
      if (controller.signal.aborted) throw new Error('COUCHDB_REQUEST_TIMEOUT');
      throw new Error('COUCHDB_RESPONSE_JSON_INVALID');
    }
    if (!payload || !Array.isArray(payload.results) || !Object.hasOwn(payload, 'last_seq')) throw new Error('COUCHDB_CHANGES_RESPONSE_INVALID');
    if (payload.results.length > input.limit) throw new Error('COUCHDB_RESULT_LIMIT_EXCEEDED');
    if (payload.pending !== undefined && (!Number.isSafeInteger(payload.pending) || payload.pending < 0)) throw new Error('COUCHDB_PENDING_COUNT_INVALID');

    const batch = createCouchDbOfflineBatchV1({
      sourceDatabase: input.database,
      previousCheckpoint: input.previousCheckpoint ?? null,
      lastSequence: payload.last_seq,
      changes: payload.results,
    }, { maxDocumentBytes: input.maxDocumentBytes });

    return {
      batch,
      response: {
        httpStatus: response.status,
        recordCount: payload.results.length,
        responseBytes,
        pending: payload.pending ?? null,
        sinceDigest: sha256CouchDbV1(input.since),
        lastSequenceDigest: batch.nextCheckpoint.digest,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
