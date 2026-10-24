import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = 'atlas.couchdb-offline-batch.v1';
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const FORBIDDEN_KEYS = new Set(['hiddenthoughts', 'chainofthought', 'kvcache', 'tensor']);

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('BATCH_VALUE_NOT_JSON');
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJsonCouchDbV1(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256CouchDbV1(value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value)
    ? value
    : canonicalJsonCouchDbV1(value);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertSafePayload(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertSafePayload(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll(/[_-]/g, '');
    if (FORBIDDEN_KEYS.has(normalized)) throw new Error(`FORBIDDEN_PAYLOAD_FIELD:${path}.${key}`);
    assertSafePayload(child, `${path}.${key}`);
  }
}

function normalizeChange(change, ordinal, maxDocumentBytes) {
  if (!change || typeof change.id !== 'string' || !change.id.trim()) throw new Error(`CHANGE_ID_INVALID:${ordinal}`);
  if (!Array.isArray(change.changes) || change.changes.length === 0) throw new Error(`CHANGE_REVISIONS_MISSING:${ordinal}`);

  const document = change.doc ?? null;
  if (document !== null && (!document || typeof document !== 'object' || Array.isArray(document))) {
    throw new Error(`DOCUMENT_INVALID:${ordinal}`);
  }
  if (document && document._id !== change.id) throw new Error(`DOCUMENT_ID_MISMATCH:${ordinal}`);

  const deleted = change.deleted === true || document?._deleted === true;
  const documentRevision = document?._rev ?? change.changes[0]?.rev;
  if (typeof documentRevision !== 'string' || !documentRevision.trim()) throw new Error(`DOCUMENT_REVISION_MISSING:${ordinal}`);
  if (document && document._rev !== documentRevision) throw new Error(`DOCUMENT_REVISION_MISMATCH:${ordinal}`);
  if (!deleted && !document) throw new Error(`DOCUMENT_BODY_MISSING:${ordinal}`);

  const revisionCandidates = [...new Set([
    ...change.changes.map((item) => item?.rev),
    ...(Array.isArray(document?._conflicts) ? document._conflicts : []),
  ])].filter((revision) => typeof revision === 'string' && revision.length > 0).sort();
  if (!revisionCandidates.includes(documentRevision)) throw new Error(`WINNING_REVISION_NOT_IN_CHANGE_SET:${ordinal}`);

  if (document) {
    assertSafePayload(document);
    const documentBytes = Buffer.byteLength(canonicalJsonCouchDbV1(document));
    if (documentBytes > maxDocumentBytes) throw new Error(`DOCUMENT_SIZE_LIMIT_EXCEEDED:${ordinal}`);
  }

  const observed = change.identityObservation ?? {};
  const packetIdentity = observed.packetIdentity ?? null;
  if (packetIdentity !== null && (!packetIdentity || typeof packetIdentity !== 'object' || Array.isArray(packetIdentity))) {
    throw new Error(`PACKET_IDENTITY_INVALID:${ordinal}`);
  }
  for (const key of ['sourceRevision', 'representationRevision']) {
    if (observed[key] !== undefined && observed[key] !== null && (typeof observed[key] !== 'string' || !observed[key].trim())) {
      throw new Error(`${key.toUpperCase()}_INVALID:${ordinal}`);
    }
  }

  const tombstone = deleted ? { _id: change.id, _rev: documentRevision, _deleted: true } : document;
  return {
    ordinal,
    documentId: change.id,
    documentRevision,
    revisionCandidates,
    conflictStatus: revisionCandidates.length > 1 ? 'CONFLICTS_PRESENT' : 'NO_CONFLICT_REPORTED',
    deleted,
    documentDigest: sha256CouchDbV1(tombstone),
    document: deleted ? null : canonicalize(document),
    identityObservation: {
      packetIdentity: packetIdentity === null ? null : canonicalize(packetIdentity),
      sourceRevision: observed.sourceRevision ?? null,
      representationRevision: observed.representationRevision ?? null,
      qualification: 'OBSERVED_NOT_ADMITTED',
    },
  };
}

export function createCouchDbOfflineBatchV1(input, options = {}) {
  const maxDocumentBytes = options.maxDocumentBytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(maxDocumentBytes) || maxDocumentBytes < 1) throw new Error('MAX_DOCUMENT_BYTES_INVALID');
  if (!input || typeof input.sourceDatabase !== 'string' || !/^[a-z][a-z0-9_$()+/-]*$/.test(input.sourceDatabase)) {
    throw new Error('SOURCE_DATABASE_INVALID');
  }
  if (!Array.isArray(input.changes)) throw new Error('CHANGES_NOT_ARRAY');
  if (input.lastSequence === undefined) throw new Error('LAST_SEQUENCE_MISSING');

  const previousCheckpoint = input.previousCheckpoint ?? null;
  if (previousCheckpoint !== null) {
    if (!previousCheckpoint || !Object.hasOwn(previousCheckpoint, 'token') || !SHA256.test(previousCheckpoint.digest ?? '')) {
      throw new Error('PREVIOUS_CHECKPOINT_INVALID');
    }
    if (sha256CouchDbV1(previousCheckpoint.token) !== previousCheckpoint.digest) throw new Error('PREVIOUS_CHECKPOINT_DIGEST_MISMATCH');
  }

  const nextCheckpoint = {
    token: canonicalize(input.lastSequence),
    digest: sha256CouchDbV1(input.lastSequence),
  };
  const records = input.changes.map((change, ordinal) => normalizeChange(change, ordinal, maxDocumentBytes));
  const body = {
    schema: SCHEMA,
    sourceDatabase: input.sourceDatabase,
    previousCheckpointDigest: previousCheckpoint?.digest ?? null,
    nextCheckpoint,
    recordCount: records.length,
    records,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const withRecordsDigest = { ...body, recordsDigest: sha256CouchDbV1(records) };
  return { ...withRecordsDigest, batchDigest: sha256CouchDbV1(withRecordsDigest) };
}

export function verifyCouchDbOfflineBatchV1(batch) {
  if (!batch || batch.schema !== SCHEMA || !Array.isArray(batch.records)) return { valid: false, reason: 'BATCH_SCHEMA_INVALID' };
  if (batch.recordCount !== batch.records.length) return { valid: false, reason: 'RECORD_COUNT_MISMATCH' };
  if (!SHA256.test(batch.nextCheckpoint?.digest ?? '') || sha256CouchDbV1(batch.nextCheckpoint?.token) !== batch.nextCheckpoint?.digest) {
    return { valid: false, reason: 'NEXT_CHECKPOINT_DIGEST_MISMATCH' };
  }
  if (sha256CouchDbV1(batch.records) !== batch.recordsDigest) return { valid: false, reason: 'RECORDS_DIGEST_MISMATCH' };
  for (let ordinal = 0; ordinal < batch.records.length; ordinal += 1) {
    const record = batch.records[ordinal];
    if (record?.ordinal !== ordinal || typeof record.documentId !== 'string' || typeof record.documentRevision !== 'string' || typeof record.deleted !== 'boolean') {
      return { valid: false, reason: `RECORD_IDENTITY_INVALID:${ordinal}` };
    }
    if (!Array.isArray(record.revisionCandidates) || !record.revisionCandidates.includes(record.documentRevision)) {
      return { valid: false, reason: `RECORD_REVISION_SET_INVALID:${ordinal}` };
    }
    const conflictStatus = record.revisionCandidates.length > 1 ? 'CONFLICTS_PRESENT' : 'NO_CONFLICT_REPORTED';
    if (record.conflictStatus !== conflictStatus) return { valid: false, reason: `RECORD_CONFLICT_STATUS_INVALID:${ordinal}` };
    if (record.deleted) {
      if (record.document !== null) return { valid: false, reason: `TOMBSTONE_BODY_PRESENT:${ordinal}` };
    } else {
      if (!record.document || record.document._id !== record.documentId || record.document._rev !== record.documentRevision) {
        return { valid: false, reason: `RECORD_DOCUMENT_BINDING_INVALID:${ordinal}` };
      }
    }
    const digestInput = record.deleted
      ? { _id: record.documentId, _rev: record.documentRevision, _deleted: true }
      : record.document;
    if (sha256CouchDbV1(digestInput) !== record.documentDigest) return { valid: false, reason: `DOCUMENT_DIGEST_MISMATCH:${ordinal}` };
    try { assertSafePayload(record.document); } catch { return { valid: false, reason: `FORBIDDEN_PAYLOAD_FIELD:${ordinal}` }; }
  }
  const { batchDigest, ...body } = batch;
  if (sha256CouchDbV1(body) !== batchDigest) return { valid: false, reason: 'BATCH_DIGEST_MISMATCH' };
  if (batch.canonicalAuthority !== false || batch.writesPerformed !== false) return { valid: false, reason: 'AUTHORITY_FLAGS_INVALID' };
  return { valid: true, reason: null };
}

export function createCouchDbReplayStateV1(initialCheckpoint = null) {
  if (initialCheckpoint !== null && (!SHA256.test(initialCheckpoint.digest ?? '') || sha256CouchDbV1(initialCheckpoint.token) !== initialCheckpoint.digest)) {
    throw new Error('INITIAL_CHECKPOINT_INVALID');
  }
  return {
    checkpoint: initialCheckpoint === null ? null : canonicalize(initialCheckpoint),
    appliedBatchDigests: [],
    documentsById: {},
  };
}

export function applyCouchDbOfflineBatchV1(state, batch) {
  const verification = verifyCouchDbOfflineBatchV1(batch);
  if (!verification.valid) throw new Error(verification.reason);
  if (state.appliedBatchDigests.includes(batch.batchDigest)) return { state, replayed: true };
  const currentDigest = state.checkpoint?.digest ?? null;
  if (batch.previousCheckpointDigest !== currentDigest) throw new Error('CHECKPOINT_CHAIN_MISMATCH');

  const documentsById = { ...state.documentsById };
  for (const record of batch.records) {
    documentsById[record.documentId] = {
      documentRevision: record.documentRevision,
      documentDigest: record.documentDigest,
      deleted: record.deleted,
      conflictStatus: record.conflictStatus,
      revisionCandidates: [...record.revisionCandidates],
      document: record.document,
      identityObservation: record.identityObservation,
    };
  }
  return {
    replayed: false,
    state: {
      checkpoint: batch.nextCheckpoint,
      appliedBatchDigests: [...state.appliedBatchDigests, batch.batchDigest],
      documentsById,
    },
  };
}

export function summarizeCouchDbReplayV1(state) {
  const documents = Object.entries(state.documentsById)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([documentId, value]) => ({ documentId, ...value }));
  const summary = {
    schema: 'atlas.couchdb-offline-replay-summary.v1',
    checkpointDigest: state.checkpoint?.digest ?? null,
    documentCount: documents.filter((document) => !document.deleted).length,
    tombstoneCount: documents.filter((document) => document.deleted).length,
    conflictCount: documents.filter((document) => document.conflictStatus === 'CONFLICTS_PRESENT').length,
    documents,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  return { ...summary, summaryDigest: sha256CouchDbV1(summary) };
}

export function writeCouchDbOfflineBatchArtifactV1(batch, runDirectory) {
  const verification = verifyCouchDbOfflineBatchV1(batch);
  if (!verification.valid) throw new Error(verification.reason);
  mkdirSync(runDirectory);

  const batchBytes = `${canonicalJsonCouchDbV1(batch)}\n`;
  const recordsBytes = batch.records.map((record) => canonicalJsonCouchDbV1(record)).join('\n') + (batch.records.length ? '\n' : '');
  writeFileSync(path.join(runDirectory, 'batch.json'), batchBytes, { flag: 'wx' });
  writeFileSync(path.join(runDirectory, 'records.ndjson'), recordsBytes, { flag: 'wx' });

  const payload = {
    schema: 'atlas.couchdb-offline-batch-receipt.v1',
    batchDigest: batch.batchDigest,
    recordCount: batch.recordCount,
    artifacts: {
      batch: sha256CouchDbV1(batchBytes),
      recordsNdjson: sha256CouchDbV1(recordsBytes),
    },
    canonicalAuthority: false,
    datastoreWrites: false,
  };
  const receipt = { ...payload, receiptChecksum: sha256CouchDbV1(payload) };
  writeFileSync(path.join(runDirectory, 'receipt.json'), `${canonicalJsonCouchDbV1(receipt)}\n`, { flag: 'wx' });
  return receipt;
}

export function readBackCouchDbOfflineBatchArtifactV1(runDirectory) {
  let batch;
  let receipt;
  let batchBytes;
  let recordsBytes;
  try {
    batchBytes = readFileSync(path.join(runDirectory, 'batch.json'));
    recordsBytes = readFileSync(path.join(runDirectory, 'records.ndjson'));
    batch = JSON.parse(batchBytes.toString('utf8'));
    receipt = JSON.parse(readFileSync(path.join(runDirectory, 'receipt.json'), 'utf8'));
  } catch {
    throw new Error('ARTIFACT_READBACK_INCOMPLETE');
  }

  const verification = verifyCouchDbOfflineBatchV1(batch);
  if (!verification.valid) throw new Error(`ARTIFACT_BATCH_${verification.reason}`);
  const recordsFromNdjson = recordsBytes.toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (canonicalJsonCouchDbV1(recordsFromNdjson) !== canonicalJsonCouchDbV1(batch.records)) throw new Error('ARTIFACT_NDJSON_CONTENT_MISMATCH');
  if (receipt.schema !== 'atlas.couchdb-offline-batch-receipt.v1' || receipt.batchDigest !== batch.batchDigest || receipt.recordCount !== batch.recordCount) {
    throw new Error('ARTIFACT_RECEIPT_BINDING_MISMATCH');
  }
  if (receipt.artifacts?.batch !== sha256CouchDbV1(batchBytes) || receipt.artifacts?.recordsNdjson !== sha256CouchDbV1(recordsBytes)) {
    throw new Error('ARTIFACT_DIGEST_MISMATCH');
  }
  const { receiptChecksum, ...payload } = receipt;
  if (receiptChecksum !== sha256CouchDbV1(payload)) throw new Error('ARTIFACT_RECEIPT_CHECKSUM_MISMATCH');
  if (receipt.canonicalAuthority !== false || receipt.datastoreWrites !== false) throw new Error('ARTIFACT_AUTHORITY_FLAGS_INVALID');
  return { batch, receipt };
}
