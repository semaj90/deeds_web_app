#!/usr/bin/env node
/**
 * Read-only CandidateOrdinal coverage audit for the competing 768-D Qdrant
 * projections. No collection, payload, alias, or point writes are performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv(process.env);
const QDRANT_URL = (env.QDRANT_URL || `http://${env.QDRANT_HOST || '127.0.0.1'}:${env.QDRANT_PORT || '6333'}`).replace(/\/$/, '');
const collections = ['codebase_chunks_768', 'codebase_chunks_768_v2'];
const reportPath = path.join(ROOT, 'docs/reports/qdrant-candidate-coverage-v1.json');
const ordinalPath = path.join(ROOT, 'docs/reports/candidate-ordinal-corpus-v1.json');
const args = process.argv.slice(2);
const sampleSize = Math.max(1, Number.parseInt(args[args.indexOf('--sample') + 1] || '64', 10) || 64);

const text = (value) => value == null ? null : String(value);
const pointId = (point) => text(point?.id);
const valueFor = (payload, keys) => keys.map((key) => text(payload?.[key])).find(Boolean) ?? null;

async function qdrant(pathname, init = {}) {
  const response = await fetch(`${QDRANT_URL}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body.result ?? body;
}

function addIndex(index, key, ordinal) {
  if (!key) return;
  const values = index.get(key) || new Set();
  values.add(ordinal);
  index.set(key, values);
}

function buildIndexes(candidates) {
  const fields = {
    canonicalId: ['canonicalId', 'canonical_id'],
    packetKey: ['packetKey', 'packet_key'],
    symbolVersionId: ['symbolVersionId', 'symbol_version_id'],
    treeNodeId: ['treeNodeId', 'tree_node_id'],
    sourceRef: ['sourceRef', 'source_ref', 'canonical_source_ref'],
  };
  const indexes = Object.fromEntries(Object.keys(fields).map((field) => [field, new Map()]));
  for (const candidate of candidates) {
    for (const [field, keys] of Object.entries(fields)) addIndex(indexes[field], valueFor(candidate, keys), candidate.candidateOrdinal);
  }
  return indexes;
}

function resolveOrdinal(payload, indexes) {
  const fields = [
    ['canonicalId', ['canonicalId', 'canonical_id']],
    ['packetKey', ['packetKey', 'packet_key']],
    ['symbolVersionId', ['symbolVersionId', 'symbol_version_id']],
    ['treeNodeId', ['treeNodeId', 'tree_node_id']],
    ['sourceRef', ['sourceRef', 'source_ref', 'canonical_source_ref']],
  ];
  const matches = [];
  for (const [field, keys] of fields) {
    const key = valueFor(payload, keys);
    const ordinals = key ? indexes[field].get(key) : null;
    if (ordinals?.size) matches.push({ field, key, ordinals: [...ordinals] });
  }
  const union = new Set(matches.flatMap((match) => match.ordinals));
  if (union.size === 1) {
    const strong = matches.some((match) => match.field !== 'sourceRef');
    return { ordinal: [...union][0], quality: strong ? 'STRONG' : 'SOURCE_REF_UNIQUE', matches };
  }
  if (union.size > 1) return { ordinal: null, quality: 'IDENTITY_CONFLICT', matches };
  return { ordinal: null, quality: 'UNRESOLVED', matches };
}

async function scrollCollection(collection) {
  const points = [];
  let offset = null;
  while (true) {
    const result = await qdrant(`/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      body: JSON.stringify({
        limit: 1000,
        offset,
        with_payload: true,
        with_vector: false,
      }),
    });
    points.push(...(result.points || []));
    const next = result.next_page_offset ?? null;
    if (next == null || (result.points || []).length === 0) break;
    offset = next;
  }
  return points;
}

async function countExact(collection, filter) {
  const result = await qdrant(`/collections/${encodeURIComponent(collection)}/points/count`, {
    method: 'POST',
    body: JSON.stringify({ exact: true, ...(filter ? { filter } : {}) }),
  });
  return Number(result.count ?? 0);
}

async function scrollContentVectorIds(collection) {
  const ids = new Set();
  let offset = null;
  while (true) {
    const result = await qdrant(`/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      body: JSON.stringify({
        limit: 1000,
        offset,
        filter: { must: [{ has_vector: 'content' }] },
        with_payload: false,
        with_vector: false,
      }),
    });
    for (const point of result.points || []) ids.add(pointId(point));
    const next = result.next_page_offset ?? null;
    if (next == null || (result.points || []).length === 0) break;
    offset = next;
  }
  return ids;
}

async function auditCollection(collection, indexes, candidateCount) {
  const info = await qdrant(`/collections/${encodeURIComponent(collection)}`);
  const points = await scrollCollection(collection);
  const contentVectorIds = await scrollContentVectorIds(collection);
  const resolved = new Map();
  const quality = {};
  for (const point of points) {
    const resolution = resolveOrdinal(point.payload || {}, indexes);
    quality[resolution.quality] = (quality[resolution.quality] || 0) + 1;
    if (resolution.ordinal != null && !resolved.has(resolution.ordinal)) {
      resolved.set(resolution.ordinal, { id: point?.id, quality: resolution.quality });
    }
  }
  const represented = new Set(resolved.keys());
  const vectorRepresented = new Set(
    points
      .filter((point) => contentVectorIds.has(pointId(point)))
      .map((point) => resolveOrdinal(point.payload || {}, indexes).ordinal)
      .filter((ordinal) => ordinal != null),
  );
  return {
    collection,
    schema: {
      contentDefined: Boolean(info?.config?.params?.vectors?.content),
      contentSize: info?.config?.params?.vectors?.content?.size ?? null,
      contentDistance: info?.config?.params?.vectors?.content?.distance ?? null,
      contentDatatype: info?.config?.params?.vectors?.content?.datatype ?? null,
    },
    exactCounts: {
      totalPoints: await countExact(collection),
      contentVectorPoints: await countExact(collection, { must: [{ has_vector: 'content' }] }),
    },
    pointsScanned: points.length,
    representedCandidateOrdinals: represented.size,
    representedCandidateOrdinalsWithContentVector: vectorRepresented.size,
    candidateCoveragePct: candidateCount ? Number((represented.size / candidateCount * 100).toFixed(3)) : 0,
    identityQuality: quality,
    vectorDownloads: false,
    contentVectorPointIdsScanned: contentVectorIds.size,
    ordinalSet: [...represented].sort((a, b) => a - b),
  };
}

async function main() {
  const ordinalMap = JSON.parse(await fs.readFile(ordinalPath, 'utf8'));
  const candidates = ordinalMap.candidates || [];
  const indexes = buildIndexes(candidates);
  const audits = [];
  for (const collection of collections) audits.push(await auditCollection(collection, indexes, candidates.length));
  const byCollection = Object.fromEntries(audits.map((audit) => [audit.collection, audit]));
  const set768 = new Set(byCollection.codebase_chunks_768.ordinalSet);
  const setV2 = new Set(byCollection.codebase_chunks_768_v2.ordinalSet);
  const both = [...set768].filter((ordinal) => setV2.has(ordinal));
  const either = new Set([...set768, ...setV2]);
  const report = {
    schema: 'atlas.qdrant-candidate-coverage.v1',
    readOnly: true,
    writesPerformed: false,
    qdrantUrl: QDRANT_URL,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    candidateCount: candidates.length,
    sampleSize,
    collections: audits,
    comparison: {
      representedBy768: set768.size,
      representedByV2: setV2.size,
      representedByEither: either.size,
      representedByBoth: both.length,
      only768: [...set768].filter((ordinal) => !setV2.has(ordinal)).length,
      onlyV2: [...setV2].filter((ordinal) => !set768.has(ordinal)).length,
    },
    writes: {
      qdrantWrites: false,
      postgresWrites: false,
      collectionWrites: false,
      payloadIndexWrites: false,
      aliasWrites: false,
      vectorDownloads: false,
    },
    ownerDecision: 'UNRESOLVED_COVERAGE_AND_IDENTITY_PROOF_REQUIRED',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
}

await main();
