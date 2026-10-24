// OFFLINE-MAPREDUCE-HARDENING-01 (option A): read-only, checkpointed CouchDB reader.
// Pure core (no network, no writes) plus one read-only fetch helper. Only GET requests are issued.
// A checkpoint advances only after the batch's capture digest is verified. Replaying a batch is a no-op.
import { createHash } from 'node:crypto';

export const READER_SCHEMA_V1 = 'atlas.couchdb-readonly-batch.v1';

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Canonical JSON: sorted keys, so the digest does not depend on property order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Build an immutable batch envelope from a _changes page. Tombstones are kept as deleted records. */
export function buildBatchV1({ database, since, results, lastSeq }) {
  const records = results.map((row) => ({
    id: String(row.id),
    rev: row.changes?.[0]?.rev ?? null,
    deleted: row.deleted === true,
    seq: String(row.seq ?? ''),
  }));
  const captureDigest = `sha256:${sha256Hex(canonicalJson({ database, since, records }))}`;
  const outputDigest = `sha256:${sha256Hex(canonicalJson(records))}`;
  return {
    schema: READER_SCHEMA_V1,
    database,
    since,
    lastSeq: String(lastSeq ?? ''),
    recordCount: records.length,
    tombstones: records.filter((r) => r.deleted).length,
    records,
    captureDigest,
    outputDigest,
    writesPerformed: false,
  };
}

/**
 * Apply a batch to a checkpoint. Refuses digest mismatches; ignores replayed batches.
 * The checkpoint advances only when the recomputed digests match the envelope.
 */
export function applyBatchV1(checkpoint, batch) {
  if (batch.schema !== READER_SCHEMA_V1) return { status: 'REFUSED', reason: 'SCHEMA_MISMATCH', checkpoint };
  const recomputed = buildBatchV1({
    database: batch.database,
    since: batch.since,
    results: batch.records.map((r) => ({ id: r.id, changes: r.rev ? [{ rev: r.rev }] : [], deleted: r.deleted, seq: r.seq })),
    lastSeq: batch.lastSeq,
  });
  if (recomputed.captureDigest !== batch.captureDigest || recomputed.outputDigest !== batch.outputDigest) {
    return { status: 'REFUSED', reason: 'DIGEST_MISMATCH', checkpoint };
  }
  if (checkpoint.seenCaptureDigests.includes(batch.captureDigest)) {
    return { status: 'REPLAY_NOOP', reason: 'ALREADY_APPLIED', checkpoint };
  }
  if (batch.since !== checkpoint.lastSeq) {
    return { status: 'REFUSED', reason: 'SEQUENCE_GAP', checkpoint };
  }
  return {
    status: 'APPLIED',
    reason: null,
    checkpoint: {
      database: batch.database,
      lastSeq: batch.lastSeq,
      seenCaptureDigests: [...checkpoint.seenCaptureDigests, batch.captureDigest],
    },
  };
}

export function emptyCheckpointV1(database) {
  return { database, lastSeq: '0', seenCaptureDigests: [] };
}

/** One read-only GET of a _changes page. Credentials come from the caller, never from the URL. */
export async function readChangesPageV1({ fetchFn, baseUrl, database, since, limit, authorization }) {
  const url = new URL(`/${encodeURIComponent(database)}/_changes`, baseUrl);
  url.searchParams.set('since', since);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('style', 'all_docs');
  const response = await fetchFn(url.toString(), { method: 'GET', headers: { Authorization: authorization } });
  if (!response.ok) throw new Error(`CouchDB _changes GET failed: HTTP ${response.status}`);
  const body = await response.json();
  return { results: body.results ?? [], lastSeq: body.last_seq };
}
