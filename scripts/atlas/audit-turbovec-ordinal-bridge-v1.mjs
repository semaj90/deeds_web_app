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

const ordinalMap = JSON.parse(await fs.readFile(ordinalMapPath, 'utf8'));
if (ordinalMap?.identityAuthority !== false || !Array.isArray(ordinalMap?.candidates)) {
  throw new Error('ORDINAL_MAP_SCHEMA_OR_AUTHORITY_REJECTED');
}

const bySourceRef = new Map();
const byPacketKey = new Map();
for (const candidate of ordinalMap.candidates) {
  for (const [field, index] of [['sourceRef', bySourceRef], ['packetKey', byPacketKey]]) {
    const key = candidate[field];
    if (typeof key !== 'string' || !key) continue;
    if (index.has(key)) throw new Error(`ORDINAL_MAP_DUPLICATE:${field}:${key}`);
    index.set(key, candidate.candidateOrdinal);
  }
}

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
let identityConflicts = 0;
for (const point of points) {
  const payload = point?.payload ?? {};
  const sourceRef = typeof payload.source_ref === 'string' ? payload.source_ref : null;
  const packetKey = typeof payload.packet_key === 'string' ? payload.packet_key : null;
  if (sourceRef) sourceRefPresent += 1;
  if (packetKey) packetKeyPresent += 1;
  const sourceOrdinal = sourceRef ? bySourceRef.get(sourceRef) : undefined;
  const packetOrdinal = packetKey ? byPacketKey.get(packetKey) : undefined;
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
  if (sourceOrdinal === undefined && packetOrdinal === undefined && unresolved.length < 20) {
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
  uniqueMatchedOrdinals: matchedOrdinals.size,
  identityConflicts,
  unresolvedSample: unresolved,
  status: identityConflicts > 0
    ? 'BLOCKED_IDENTITY_CONFLICT'
    : matchedOrdinals.size === 0
      ? 'BLOCKED_NO_CORPUS_OVERLAP'
      : 'PARTIAL_CORPUS_OVERLAP',
  writes: false,
};

await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
