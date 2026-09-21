#!/usr/bin/env node

/**
 * Read-only bounded audit of the Go retrieval HTTP identity envelope.
 * Retrieval is an executor; this script never promotes or writes canonical data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const baseUrl = String(process.env.GO_RETRIEVAL_URL ?? 'http://127.0.0.1:8100').replace(/\/$/, '');
const reportPath = resolve(repoRoot, 'docs/reports/go-retrieval-identity-envelope-v1.json');
const query = 'PostgreSQL source revision';

const checks = [];
const add = (name, status, detail = '') => checks.push({ name, status, detail });

let health = null;
let search = null;
try {
  const healthResponse = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
  health = await healthResponse.json();
  add('health', healthResponse.ok && health?.readiness_state === 'READY_FULL' ? 'PASS' : 'REVIEW_REQUIRED',
    health?.readiness_state ?? `http_${healthResponse.status}`);

  const searchResponse = await fetch(`${baseUrl}/search/codebase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: 3 }),
    signal: AbortSignal.timeout(15000),
  });
  search = await searchResponse.json();
  add('bounded-search', searchResponse.ok ? 'PASS' : 'FAIL', `http_${searchResponse.status}`);
} catch (error) {
  add('live-request', 'FAIL', String(error?.message ?? error));
}

const rows = Array.isArray(search?.chunks) ? search.chunks : [];
const normalized = rows.map((row) => ({
  chunkId: row.chunk_id ?? null,
  chunkIdKind: typeof row.chunk_id === 'string' && /^[0-9]+$/.test(row.chunk_id)
    ? 'NUMERIC_STRING'
    : typeof row.chunk_id === 'string' && /^[0-9a-f-]{36}$/i.test(row.chunk_id)
      ? 'UUID_STRING'
      : row.chunk_id == null ? 'MISSING' : 'OTHER',
  packetKey: row.packet_key ?? null,
  sourceRef: row.source_ref ?? null,
  canonicalSourceRef: row.canonical_source_ref ?? null,
  contentHash: row.content_hash ?? null,
  representationId: row.representation_id ?? null,
  representationRevision: row.representation_revision ?? null,
  sourceRevision: row.source_revision ?? null,
}));

const missingPacketKey = normalized.filter((row) => !row.packetKey).length;
const missingSourceRef = normalized.filter((row) => !row.sourceRef).length;
const missingContentHash = normalized.filter((row) => !row.contentHash).length;
const missingChunkId = normalized.filter((row) => !row.chunkId).length;
const representationIdsWithoutRevision = normalized.filter(
  (row) => row.representationId && !row.representationRevision,
).length;
const chunkIdKinds = [...new Set(normalized.map((row) => row.chunkIdKind))];

add('packet-key-envelope', missingPacketKey === 0 ? 'PASS' : 'REVIEW_REQUIRED', `${missingPacketKey}/${normalized.length} missing`);
add('source-ref-envelope', missingSourceRef === 0 ? 'PASS' : 'REVIEW_REQUIRED', `${missingSourceRef}/${normalized.length} missing`);
add('content-hash-envelope', missingContentHash === 0 ? 'PASS' : 'REVIEW_REQUIRED', `${missingContentHash}/${normalized.length} missing`);
add('canonical-chunk-id-envelope', missingChunkId === 0 ? 'PASS' : 'REVIEW_REQUIRED', `${missingChunkId}/${normalized.length} missing`);
add('representation-revision-binding', representationIdsWithoutRevision === 0 ? 'PASS' : 'REVIEW_REQUIRED',
  `${representationIdsWithoutRevision}/${normalized.length} representation ids lack a revision`);
add('chunk-id-shape', chunkIdKinds.length <= 1 ? 'PASS' : 'REVIEW_REQUIRED', chunkIdKinds.join(','));

const report = {
  schema: 'atlas.go-retrieval-identity-envelope.v1',
  generatedAt: new Date().toISOString(),
  baseUrl,
  query,
  limit: 3,
  status: checks.some((check) => check.status === 'FAIL')
    ? 'LIVE_RETRIEVAL_FAILED'
    : checks.some((check) => check.status === 'REVIEW_REQUIRED')
      ? 'IDENTITY_ENVELOPE_REVIEW_REQUIRED'
      : 'IDENTITY_ENVELOPE_PROVEN',
  health,
  resultCount: normalized.length,
  rows: normalized,
  checks,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
