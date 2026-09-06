#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const item = args.find((arg) => arg.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : fallback;
};

const ordinalMapPath = value('ordinal-map', null);
const qdrantUrl = value('qdrant-url', process.env.QDRANT_URL ?? 'http://127.0.0.1:6333');
const collection = value('collection', 'codebase_chunks_768');
const limit = Math.max(1, Math.min(10000, Number(value('limit', '1000'))));
const reportPath = value('report', 'docs/reports/turbovec-ordinal-bridge-audit-v1.json');

if (!ordinalMapPath) throw new Error('REQUIRED: --ordinal-map=<path>');

const rawOrdinalMap = JSON.parse(await fs.readFile(ordinalMapPath, 'utf8'));
// Accept the canonical CandidateOrdinalMapV1 shape and the older lineage
// report wrapper, but never invent ordinals for a report that only carries
// packet/source identities.
const ordinalMap = rawOrdinalMap?.map && Array.isArray(rawOrdinalMap.candidates)
    ? { ...rawOrdinalMap.map, candidates: rawOrdinalMap.candidates }
    : Array.isArray(rawOrdinalMap?.candidates)
      ? rawOrdinalMap
    : null;
if (ordinalMap?.identityAuthority !== false || !Array.isArray(ordinalMap?.candidates)) {
  throw new Error('ORDINAL_MAP_SCHEMA_OR_AUTHORITY_REJECTED');
}

const bySourceRef = new Map();
const byPacketKey = new Map();
const byCanonicalId = new Map();
const byChunkId = new Map();
const add = (index, key, ordinal) => {
  if (typeof key !== 'string' || !key || !Number.isInteger(ordinal)) return;
  const values = index.get(key) ?? new Set();
  values.add(ordinal);
  index.set(key, values);
};
for (const candidate of ordinalMap.candidates) {
  if (!Number.isInteger(candidate.candidateOrdinal)) {
    throw new Error('ORDINAL_MAP_CANDIDATE_ORDINAL_MISSING');
  }
  add(bySourceRef, candidate.sourceRef, candidate.candidateOrdinal);
  add(byPacketKey, candidate.packetKey, candidate.candidateOrdinal);
  add(byCanonicalId, candidate.canonicalId, candidate.candidateOrdinal);
  add(byChunkId, candidate.canonicalChunkId ?? candidate.chunkId, candidate.candidateOrdinal);
}

const uniqueOrdinal = (index, key) => {
  const values = index.get(key);
  return values?.size === 1 ? [...values][0] : undefined;
};

const exactProjectionOrdinal = (payload) => {
  const canonicalId = payload.canonical_id ?? payload.canonicalId;
  const chunkId = payload.canonical_chunk_id ?? payload.canonicalChunkId ?? payload.chunk_id;
  return uniqueOrdinal(byChunkId, chunkId) ?? uniqueOrdinal(byCanonicalId, canonicalId);
};

const response = await fetch(`${qdrantUrl.replace(/\/$/, '')}/collections/${encodeURIComponent(collection)}/points/scroll`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ limit, with_payload: true, with_vector: false }),
});
if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
const body = await response.json();
const points = Array.isArray(body?.result?.points) ? body.result.points : [];

const unresolved = [];
const matchedOrdinals = new Set();
let sourceRefPresent = 0;
let packetKeyPresent = 0;
let sourceRefMatches = 0;
let packetKeyMatches = 0;
let exactIdentityMatches = 0;
let identityConflicts = 0;
let sourceRefAmbiguities = 0;
let packetKeyAmbiguities = 0;
const matchedProjectionIds = new Set();
for (const point of points) {
  const payload = point?.payload ?? {};
  const sourceRef = typeof payload.source_ref === 'string' ? payload.source_ref : null;
  const packetKey = typeof payload.packet_key === 'string' ? payload.packet_key : null;
  const exactOrdinal = exactProjectionOrdinal(payload);
  const sourceValues = sourceRef ? bySourceRef.get(sourceRef) : undefined;
  const packetValues = packetKey ? byPacketKey.get(packetKey) : undefined;
  if (sourceRef) sourceRefPresent += 1;
  if (packetKey) packetKeyPresent += 1;
  if (sourceValues?.size > 1) sourceRefAmbiguities += 1;
  if (packetValues?.size > 1) packetKeyAmbiguities += 1;
  const sourceOrdinal = uniqueOrdinal(bySourceRef, sourceRef);
  const packetOrdinal = uniqueOrdinal(byPacketKey, packetKey);
  if (exactOrdinal !== undefined) {
    exactIdentityMatches += 1;
    matchedProjectionIds.add(String(point?.id ?? ''));
  }
  if (sourceOrdinal !== undefined) {
    sourceRefMatches += 1;
    matchedOrdinals.add(sourceOrdinal);
  }
  if (packetOrdinal !== undefined) {
    packetKeyMatches += 1;
    matchedOrdinals.add(packetOrdinal);
  }
  if (sourceOrdinal !== undefined && packetOrdinal !== undefined && sourceOrdinal !== packetOrdinal) {
    identityConflicts += 1;
  }
  if (exactOrdinal === undefined && unresolved.length < 20) {
    unresolved.push({ pointId: point?.id ?? null, sourceRef, packetKey });
  }
}

const report = {
  schema: 'atlas.turbovec-ordinal-bridge-audit.v1',
  readOnly: true,
  collection,
  ordinalMapPath,
  candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
  ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
  sampledQdrantRows: points.length,
  sourceRefPresent,
  packetKeyPresent,
  sourceRefMatches,
  packetKeyMatches,
  exactIdentityMatches,
  sourceRefAmbiguities,
  packetKeyAmbiguities,
  uniqueMatchedOrdinals: matchedOrdinals.size,
  uniqueMatchedProjectionIds: matchedProjectionIds.size,
  identityConflicts,
  unresolvedSample: unresolved,
  status: identityConflicts > 0
    ? 'BLOCKED_IDENTITY_CONFLICT'
    : exactIdentityMatches === 0
      ? 'BLOCKED_NO_EXACT_CHUNK_IDENTITY'
      : matchedOrdinals.size === 0
        ? 'BLOCKED_NO_CORPUS_OVERLAP'
        : 'PARTIAL_CORPUS_OVERLAP',
  writes: false,
};

await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
