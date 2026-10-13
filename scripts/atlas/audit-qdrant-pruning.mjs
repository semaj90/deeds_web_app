#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const qdrantUrl = (option('url') || process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const expectedCountRaw = option('expect');
const expectedCount = expectedCountRaw === undefined ? null : Number(expectedCountRaw);
if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
  throw new Error('INVALID_EXPECTED_COLLECTION_COUNT');
}
const outputPath = path.resolve(ROOT, option('out') || '.tmp/atlas/qdrant-pruning-audit-v1.json');
const searchRoots = ['sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'scripts', 'python', 'services'];
const apiKey = process.env.QDRANT_API_KEY;

async function getJson(endpoint) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(`${qdrantUrl}${endpoint}`, {
        method: 'GET',
        headers: apiKey ? { 'api-key': apiKey } : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      continue;
    }
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`QDRANT_NON_JSON_RESPONSE:${endpoint}:HTTP_${response.status}`);
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        continue;
      }
      throw new Error(`QDRANT_HTTP_${response.status}:${endpoint}`);
    }
    return body?.result ?? body;
  }
  throw new Error(`QDRANT_GET_RETRIES_EXHAUSTED:${endpoint}`);
}

function repositoryReferenceIndex(collectionNames) {
  if (collectionNames.length === 0) return new Map();
  const result = spawnSync('rg', [
    '-l', '--fixed-strings', '--null', '--hidden',
    '-g', '!node_modules', '-g', '!**/.git/**', '-g', '!*.md', '-g', '!*.jsonl',
    ...collectionNames.flatMap((name) => ['-e', name]), ...searchRoots,
  ], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const index = new Map(collectionNames.map((name) => [name, { available: true, files: [] }]));
  if (result.status === 1) return index;
  if (result.status !== 0) {
    const error = (result.stderr || result.error?.message || 'RG_FAILED').trim();
    for (const value of index.values()) Object.assign(value, { available: false, error });
    return index;
  }
  const files = result.stdout.split('\0').filter(Boolean);
  for (const file of files) {
    let contents;
    try {
      contents = readFileSync(path.resolve(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    for (const name of collectionNames) {
      if (contents.includes(name)) index.get(name).files.push(file);
    }
  }
  for (const value of index.values()) value.files.sort();
  return index;
}

function vectorConfigs(config) {
  const vectors = config?.params?.vectors ?? config?.params?.vectors_config ?? null;
  if (!vectors || typeof vectors !== 'object') return [];
  if ('size' in vectors) return [{ name: 'default', size: vectors.size ?? null, distance: vectors.distance ?? null, datatype: vectors.datatype ?? null }];
  return Object.entries(vectors).map(([name, value]) => ({
    name,
    size: value?.size ?? null,
    distance: value?.distance ?? null,
    datatype: value?.datatype ?? null,
  }));
}

const collectionList = await getJson('/collections');
const collections = Array.isArray(collectionList?.collections) ? collectionList.collections : [];
const aliasesResult = await getJson('/aliases');
const aliases = Array.isArray(aliasesResult?.aliases) ? aliasesResult.aliases : [];
const details = [];
const consumerReferences = repositoryReferenceIndex(collections.map((entry) => entry?.name).filter((name) => typeof name === 'string' && name));

for (const entry of collections) {
  const name = entry?.name;
  if (typeof name !== 'string' || !name) continue;
  const encodedName = encodeURIComponent(name);
  const [infoResult, snapshotResult] = await Promise.allSettled([
    getJson(`/collections/${encodedName}`),
    getJson(`/collections/${encodedName}/snapshots`),
  ]);
  const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
  const snapshots = snapshotResult.status === 'fulfilled' && Array.isArray(snapshotResult.value)
    ? snapshotResult.value
    : [];
  const consumers = consumerReferences.get(name) ?? { available: false, files: [], error: 'COLLECTION_REFERENCE_NOT_INDEXED' };
  details.push({
    name,
    infoAvailable: info !== null,
    infoError: infoResult.status === 'rejected' ? String(infoResult.reason?.message ?? infoResult.reason) : null,
    pointsCount: info?.points_count ?? null,
    vectorsCount: info?.vectors_count ?? null,
    indexedVectorsCount: info?.indexed_vectors_count ?? null,
    segmentsCount: info?.segments_count ?? null,
    status: info?.status ?? null,
    optimizerStatus: info?.optimizer_status ?? null,
    vectorConfigs: vectorConfigs(info?.config),
    hnswConfig: info?.config?.hnsw_config ?? null,
    quantizationConfig: info?.config?.quantization_config ?? null,
    payloadSchema: info?.payload_schema ?? null,
    snapshotsAvailable: snapshotResult.status === 'fulfilled',
    snapshotError: snapshotResult.status === 'rejected' ? String(snapshotResult.reason?.message ?? snapshotResult.reason) : null,
    snapshots: snapshots.map((snapshot) => ({
      name: snapshot?.name ?? null,
      sizeBytes: Number.isFinite(snapshot?.size) ? snapshot.size : null,
      checksum: snapshot?.checksum ?? null,
      creationTime: snapshot?.creation_time ?? snapshot?.creationTime ?? null,
    })),
    repositoryReferenceSearch: consumers,
    disposition: info?.points_count === 0 ? 'EMPTY_REVIEW_ONLY' : 'RETAIN_OR_REVIEW',
    deletionAuthorized: false,
  });
}

const emptyCollections = details.filter((item) => item.pointsCount === 0);
const report = {
  schema: 'atlas.qdrant.pruning-audit.v1',
  generatedAt: new Date().toISOString(),
  qdrantUrl,
  methodPolicy: 'GET_ONLY',
  mode: 'READ_ONLY_INVENTORY',
  writesPerformed: false,
  qdrantMutationsPerformed: false,
  deletionAuthorized: false,
  expectedCollectionCount: expectedCount,
  observedCollectionCount: collections.length,
  collectionCountMatchesExpectation: expectedCount === null ? null : expectedCount === collections.length,
  aliasesAvailable: true,
  aliases,
  emptyCollectionCount: emptyCollections.length,
  snapshotCount: details.reduce((sum, item) => sum + item.snapshots.length, 0),
  snapshotBytesReported: details.reduce((sum, item) => sum + item.snapshots.reduce((subtotal, snapshot) => subtotal + (snapshot.sizeBytes ?? 0), 0), 0),
  interpretation: 'Inventory and literal source-reference search are triage evidence only; neither proves a collection is unused or safe to delete.',
  collections: details,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  report: path.relative(ROOT, outputPath),
  observedCollectionCount: report.observedCollectionCount,
  expectedCollectionCount: report.expectedCollectionCount,
  collectionCountMatchesExpectation: report.collectionCountMatchesExpectation,
  emptyCollectionCount: report.emptyCollectionCount,
  snapshotCount: report.snapshotCount,
  qdrantMutationsPerformed: false,
}, null, 2));

if (report.collectionCountMatchesExpectation === false) process.exitCode = 2;
