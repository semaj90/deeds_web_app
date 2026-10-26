#!/usr/bin/env node
/**
 * QDRANT-STORAGE-BREAKDOWN-01 -- READ ONLY.
 *
 * Inventories every live Qdrant collection using the v1.18+ /memory API and
 * collection snapshot listing. It does not delete snapshots, optimize segments,
 * mutate collection config, or change aliases.
 *
 * Purpose:
 * - explain why the Docker Qdrant data volume is larger than raw vector math
 * - separate vectors, HNSW/index, payload, payload-index and id-tracker disk
 * - distinguish current semantic owners from legacy/derived/experimental sets
 * - measure snapshot retention separately from live collection storage
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'docs/reports/qdrant-storage-breakdown-v1.json');
const QDRANT_URL = (process.env.QDRANT_URL || process.env.QDRANT_BASE_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const noReport = process.argv.includes('--no-report');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const outputPath = outputArg ? path.resolve(ROOT, outputArg) : REPORT_PATH;
const outputRelativePath = path.relative(ROOT, outputPath);
if (outputArg && (outputRelativePath === '..' || outputRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelativePath))) {
  throw new Error('--output must resolve inside the repository root');
}

function scanConsumers() {
  try {
    const output = execFileSync('rg', [
      '-l', '-i', 'codebase_chunks_768|codebase_chunks_768_v2|content_embedding_768|content_embedding|latent_256|latent_128|latent_64',
      'scripts', 'services', 'docker', 'sveltekit-frontend', 'packages',
      '--glob', '!**/node_modules/**', '--glob', '!**/.venv*/**', '--glob', '!**/dist/**',
      '--glob', '!**/build/**', '--glob', '!**/docs/reports/**', '--glob', '!sveltekit-frontend/NUL',
      '--glob', '*.{mjs,mts,js,ts,tsx,jsx,py,go,rs,sql,yml,yaml,json}',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
    return { available: true, files: output.split(/\r?\n/).filter(Boolean).sort() };
  } catch (error) {
    return { available: false, files: [], error: error?.message ?? String(error) };
  }
}

const consumerCensus = scanConsumers();

function scanCollectionConsumers(collectionNames) {
  const byCollection = new Map(collectionNames.map((name) => [name, new Set()]));
  if (collectionNames.length === 0) return { available: true, byCollection, error: null };
  try {
    const expressions = collectionNames.map((name) => `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const output = execFileSync('rg', [
      '--json', '-n', '-o', ...expressions.flatMap((expression) => ['-e', expression]),
      'scripts', 'services', 'docker', 'sveltekit-frontend', 'packages',
      '--glob', '!**/node_modules/**', '--glob', '!**/.venv*/**', '--glob', '!**/dist/**',
      '--glob', '!**/build/**', '--glob', '!**/docs/reports/**', '--glob', '!sveltekit-frontend/NUL',
      '--glob', '*.{mjs,mts,js,ts,tsx,jsx,py,go,rs,sql,yml,yaml,json}',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type !== 'match') continue;
      const file = event.data?.path?.text;
      for (const match of event.data?.submatches ?? []) {
        const name = match.match?.text;
        if (file && byCollection.has(name)) byCollection.get(name).add(file);
      }
    }
    return { available: true, byCollection, error: null };
  } catch (error) {
    if (error?.status === 1) return { available: true, byCollection, error: null };
    return { available: false, byCollection, error: error?.message ?? String(error) };
  }
}

function qdrantVolumeStorage() {
  const container = process.env.QDRANT_CONTAINER || 'legal-ai-qdrant';
  try {
    const output = execFileSync('docker', [
      'exec', container, 'sh', '-c',
      'for p in /qdrant /qdrant/storage /qdrant/snapshots; do du -sb "$p" 2>/dev/null; done',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const bytesByPath = Object.fromEntries(output.split(/\r?\n/).filter(Boolean).map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? [match[2], Number(match[1])] : [line, null];
    }));
    return { available: Object.keys(bytesByPath).length > 0, container, bytesByPath, error: null };
  } catch (error) {
    return { available: false, container, bytesByPath: {}, error: error?.message ?? String(error) };
  }
}

const CODEBASE_CLASS = new Map([
  ['codebase_chunks_768', 'ACTIVE_SEMANTIC_PROJECTION'],
  ['codebase_chunks_768_v2', 'COMPARISON_SEMANTIC_CHALLENGER'],
  ['codebase_chunks_512', 'DERIVED_REDUCED_SEMANTIC'],
  ['codebase_chunks_384', 'LEGACY_REDUCED_SEMANTIC'],
  ['codebase_chunks_384_hybrid', 'LEGACY_REDUCED_SEMANTIC'],
  ['codebase_chunks_latent256', 'DERIVED_LATENT_EXPERIMENT'],
  ['codebase_topology_64', 'DERIVED_TOPOLOGY_ROUTING'],
  ['codebase_topology_128', 'DERIVED_TOPOLOGY_CHALLENGER'],
  ['codebase_sparse_test_v1', 'SPARSE_EXPERIMENT'],
  ['taxonomy_nodes_768', 'ONTOLOGY_PROJECTION'],
]);

function classifyCollection(name) {
  if (CODEBASE_CLASS.has(name)) return CODEBASE_CLASS.get(name);
  if (name.startsWith('codebase_')) return 'CODEBASE_OTHER';
  if (/taxonom|ontolog|concept|entit/i.test(name)) return 'ONTOLOGY_OR_ENTITY_PROJECTION';
  if (/cache|memory|embedding_cache/i.test(name)) return 'CACHE_OR_MEMORY';
  if (/legal|case|statute|evidence|research/i.test(name)) return 'APPLICATION_OR_LEGAL';
  return 'OTHER';
}

async function getJson(relative) {
  const url = `${QDRANT_URL}${relative}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok) {
        const error = new Error(`HTTP_${response.status}:${relative}`);
        error.status = response.status;
        error.body = body ?? text.slice(0, 500);
        throw error;
      }
      return body;
    } catch (error) {
      if (attempt === 3 || !/fetch failed|network error|ECONNRESET|ETIMEDOUT/i.test(error?.message ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error(`QDRANT_READ_RETRIES_EXHAUSTED:${relative}`);
}

function unwrap(body) {
  return body && typeof body === 'object' && 'result' in body ? body.result : body;
}

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function pickMetric(node, key) {
  if (!node || typeof node !== 'object') return 0;
  if (typeof node[key] === 'number') return numeric(node[key]);
  const variants = [`${key}_bytes`, `${key}Bytes`];
  for (const variant of variants) if (typeof node[variant] === 'number') return numeric(node[variant]);
  return 0;
}

function memorySummary(memoryBody) {
  const memory = unwrap(memoryBody) ?? {};
  const total = memory.total ?? memory;
  return {
    diskBytes: pickMetric(total, 'disk'),
    ramBytes: pickMetric(total, 'ram'),
    cachedBytes: pickMetric(total, 'cached'),
    expectedCacheBytes: pickMetric(total, 'expected_cache') || pickMetric(total, 'expectedCache'),
    raw: memory,
  };
}

function vectorConfigSummary(infoBody) {
  const info = unwrap(infoBody) ?? {};
  const vectors = info?.config?.params?.vectors ?? info?.config?.params?.vectors_config ?? null;
  const named = [];
  if (vectors && typeof vectors === 'object' && !Array.isArray(vectors)) {
    if ('size' in vectors) {
      named.push({ name: 'default', size: vectors.size ?? null, distance: vectors.distance ?? null, datatype: vectors.datatype ?? null });
    } else {
      for (const [name, cfg] of Object.entries(vectors)) {
        if (!cfg || typeof cfg !== 'object') continue;
        named.push({ name, size: cfg.size ?? null, distance: cfg.distance ?? null, datatype: cfg.datatype ?? null, memory: cfg.memory ?? cfg.on_disk ?? null });
      }
    }
  }
  return {
    pointsCount: info.points_count ?? null,
    vectorsCount: info.vectors_count ?? null,
    indexedVectorsCount: info.indexed_vectors_count ?? null,
    segmentsCount: info.segments_count ?? null,
    status: info.status ?? null,
    optimizerStatus: info.optimizer_status ?? null,
    namedVectors: named,
    quantizationConfig: info?.config?.quantization_config ?? null,
    hnswConfig: info?.config?.hnsw_config ?? null,
    payloadMemory: info?.config?.params?.payload?.memory ?? null,
    payloadSchema: info.payload_schema ?? null,
  };
}

function snapshotSummary(body, collection, classification, consumerReferences, consumerSearchAvailable) {
  const snapshots = Array.isArray(unwrap(body)) ? unwrap(body) : [];
  const normalized = snapshots.map((row) => ({
    collection,
    name: row?.name ?? null,
    sizeBytes: numeric(row?.size),
    checksum: row?.checksum ?? null,
    creationTime: row?.creation_time ?? row?.creationTime ?? null,
  }));
  const ordered = normalized
    .filter((row) => row.creationTime)
    .sort((a, b) => String(b.creationTime).localeCompare(String(a.creationTime)));
  const latestName = ordered[0]?.name ?? null;
  const rollbackCandidateName = ordered[1]?.name ?? null;
  return {
    count: snapshots.length,
    totalBytes: snapshots.reduce((sum, row) => sum + numeric(row?.size), 0),
    snapshots: normalized.map((row) => ({
      ...row,
      classification,
      retentionDisposition: !row.creationTime
        ? 'UNCLASSIFIED_METADATA_MISSING_CREATION_TIME'
        : row.name === latestName
        ? 'LATEST_KNOWN_GOOD_CANDIDATE'
        : row.name === rollbackCandidateName
          ? 'ROLLBACK_CHECKPOINT_CANDIDATE'
          : 'OLDER_REVIEW_CANDIDATE',
      consumerReferences,
      consumerReferenceScope: 'COLLECTION_NAME_RG_MATCH',
      consumerSearchAvailable,
      consumerReferencesProven: false,
      deletionAuthorized: false,
    })),
  };
}

const report = {
  schema: 'atlas.qdrant-storage-breakdown.v1',
  gate: 'QDRANT-STORAGE-BREAKDOWN-01',
  generatedAt: new Date().toISOString(),
  qdrantUrl: QDRANT_URL,
  mode: 'READ_ONLY',
  writesPerformed: false,
  destructiveActionsPerformed: false,
  aliases: { available: false, count: 0, entries: [], error: null },
  volumeStorage: { available: false, container: process.env.QDRANT_CONTAINER || 'legal-ai-qdrant', bytesByPath: {}, error: null },
  consumerCensus: {
    available: consumerCensus.available,
    count: consumerCensus.files.length,
    files: consumerCensus.files,
    error: consumerCensus.available ? null : consumerCensus.error,
  },
  collections: [],
  totals: {
    collectionCount: 0,
    collectionMemoryEndpointAvailable: 0,
    liveCollectionDiskBytes: 0,
    apiVisibleSnapshotBytes: 0,
    apiVisibleSnapshotCount: 0,
    snapshotMetadataIncompleteCount: 0,
    snapshotRetentionDispositionCounts: {},
    codebaseLiveDiskBytes: 0,
    codebaseSnapshotBytes: 0,
  },
  errors: [],
};

try {
  const root = await getJson('/collections');
  try {
    const aliasBody = unwrap(await getJson('/aliases'));
    const aliasRows = Array.isArray(aliasBody?.aliases) ? aliasBody.aliases : [];
    report.aliases = {
      available: true,
      count: aliasRows.length,
      entries: aliasRows.map((row) => ({ aliasName: row.alias_name ?? null, collectionName: row.collection_name ?? null })),
      error: null,
    };
  } catch (error) {
    report.aliases.error = error instanceof Error ? error.message : String(error);
  }
  const collections = unwrap(root)?.collections ?? [];
  const names = collections.map((row) => row?.name).filter(Boolean).sort();
  report.totals.collectionCount = names.length;
  const collectionConsumers = scanCollectionConsumers(names);
  report.collectionConsumerCensus = { available: collectionConsumers.available, error: collectionConsumers.error };
  report.volumeStorage = qdrantVolumeStorage();
  const aliasesByCollection = new Map();
  for (const alias of report.aliases.entries) {
    if (!alias.collectionName) continue;
    const namesForCollection = aliasesByCollection.get(alias.collectionName) ?? [];
    namesForCollection.push(alias.aliasName);
    aliasesByCollection.set(alias.collectionName, namesForCollection);
  }

  for (const name of names) {
    const classification = classifyCollection(name);
    const consumerReferences = [...(collectionConsumers.byCollection.get(name) ?? [])].sort();
    const entry = {
      name,
      classification,
      aliases: aliasesByCollection.get(name) ?? [],
      consumerReferences,
      consumerReferenceCount: consumerReferences.length,
      consumerSearchAvailable: collectionConsumers.available,
      info: null,
      memory: null,
      snapshots: null,
      errors: [],
    };
    try {
      entry.info = vectorConfigSummary(await getJson(`/collections/${encodeURIComponent(name)}`));
    } catch (error) {
      entry.errors.push(`INFO:${error.message}`);
    }
    try {
      entry.memory = memorySummary(await getJson(`/collections/${encodeURIComponent(name)}/memory`));
      report.totals.collectionMemoryEndpointAvailable += 1;
      report.totals.liveCollectionDiskBytes += entry.memory.diskBytes;
      if (entry.classification.startsWith('ACTIVE_') || entry.classification.startsWith('CURRENT_') || entry.classification.startsWith('LEGACY_') || entry.classification.startsWith('DERIVED_') || entry.classification === 'SPARSE_EXPERIMENT' || entry.classification === 'CODEBASE_OTHER') {
        report.totals.codebaseLiveDiskBytes += entry.memory.diskBytes;
      }
    } catch (error) {
      entry.errors.push(`MEMORY:${error.message}`);
    }
    try {
      entry.snapshots = snapshotSummary(await getJson(`/collections/${encodeURIComponent(name)}/snapshots`), name, entry.classification, consumerReferences, collectionConsumers.available);
      report.totals.apiVisibleSnapshotBytes += entry.snapshots.totalBytes;
      report.totals.apiVisibleSnapshotCount += entry.snapshots.count;
      for (const snapshot of entry.snapshots.snapshots) {
        const disposition = snapshot.retentionDisposition;
        report.totals.snapshotRetentionDispositionCounts[disposition] = (report.totals.snapshotRetentionDispositionCounts[disposition] ?? 0) + 1;
        if (disposition === 'UNCLASSIFIED_METADATA_MISSING_CREATION_TIME') report.totals.snapshotMetadataIncompleteCount += 1;
      }
      if (entry.classification.startsWith('ACTIVE_') || entry.classification.startsWith('CURRENT_') || entry.classification.startsWith('LEGACY_') || entry.classification.startsWith('DERIVED_') || entry.classification === 'SPARSE_EXPERIMENT' || entry.classification === 'CODEBASE_OTHER') {
        report.totals.codebaseSnapshotBytes += entry.snapshots.totalBytes;
      }
    } catch (error) {
      entry.errors.push(`SNAPSHOTS:${error.message}`);
    }
    report.collections.push(entry);
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
}

report.collections.sort((a, b) => (b.memory?.diskBytes ?? 0) - (a.memory?.diskBytes ?? 0));
report.recommendations = {
  ownership: 'PostgreSQL remains canonical; Qdrant collections are derived/search projections.',
  deletionPolicy: 'NO_AUTOMATIC_DELETION. Retention decisions require lineage and caller evidence.',
  snapshotPolicy: 'Retain one latest known-good snapshot plus one explicit rollback/pre-migration checkpoint per admitted owner; review older snapshots.',
  semanticTarget: 'One admitted semantic_768 codebase Qdrant owner; derived KMeans/SOM/topology values should prefer payload/routing metadata over separate permanent ANN collections unless evaluation proves lift.',
  memoryTierNote: 'Qdrant v1.19 memory tiers change RAM residency, not persisted disk ownership; cold/cached placement does not delete disk structures.',
};

if (!noReport) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  gate: report.gate,
  collectionCount: report.totals.collectionCount,
  memoryEndpointCount: report.totals.collectionMemoryEndpointAvailable,
  liveCollectionDiskBytes: report.totals.liveCollectionDiskBytes,
  apiVisibleSnapshotBytes: report.totals.apiVisibleSnapshotBytes,
  snapshotMetadataIncompleteCount: report.totals.snapshotMetadataIncompleteCount,
  snapshotRetentionDispositionCounts: report.totals.snapshotRetentionDispositionCounts,
  codebaseLiveDiskBytes: report.totals.codebaseLiveDiskBytes,
  codebaseSnapshotBytes: report.totals.codebaseSnapshotBytes,
  aliasesAvailable: report.aliases.available,
  aliasCount: report.aliases.count,
  collectionConsumerCensusAvailable: report.collectionConsumerCensus?.available ?? false,
  volumeStorage: report.volumeStorage,
  collectionInfoUnavailableCount: report.collections.filter((row) => !row.info).length,
  payloadSchemaCount: report.collections.filter((row) => row.info?.payloadSchema).length,
  largestCollections: report.collections.slice(0, 10).map((row) => ({ name: row.name, classification: row.classification, diskBytes: row.memory?.diskBytes ?? null, snapshotBytes: row.snapshots?.totalBytes ?? null })),
  errors: report.errors,
  reportPath: noReport ? null : path.relative(ROOT, outputPath),
  writesPerformed: false,
}, null, 2));

if (report.errors.length > 0) process.exitCode = 2;
