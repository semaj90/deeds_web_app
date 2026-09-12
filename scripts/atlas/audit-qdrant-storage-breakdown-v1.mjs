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

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'docs/reports/qdrant-storage-breakdown-v1.json');
const QDRANT_URL = (process.env.QDRANT_URL || process.env.QDRANT_BASE_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const noReport = process.argv.includes('--no-report');

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
    indexedVectorsCount: info.indexed_vectors_count ?? null,
    segmentsCount: info.segments_count ?? null,
    status: info.status ?? null,
    optimizerStatus: info.optimizer_status ?? null,
    namedVectors: named,
    quantizationConfig: info?.config?.quantization_config ?? null,
    hnswConfig: info?.config?.hnsw_config ?? null,
    payloadMemory: info?.config?.params?.payload?.memory ?? null,
  };
}

function snapshotSummary(body) {
  const snapshots = Array.isArray(unwrap(body)) ? unwrap(body) : [];
  return {
    count: snapshots.length,
    totalBytes: snapshots.reduce((sum, row) => sum + numeric(row?.size), 0),
    snapshots: snapshots.map((row) => ({
      name: row?.name ?? null,
      sizeBytes: numeric(row?.size),
      checksum: row?.checksum ?? null,
      creationTime: row?.creation_time ?? row?.creationTime ?? null,
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
  collections: [],
  totals: {
    collectionCount: 0,
    collectionMemoryEndpointAvailable: 0,
    liveCollectionDiskBytes: 0,
    apiVisibleSnapshotBytes: 0,
    apiVisibleSnapshotCount: 0,
    codebaseLiveDiskBytes: 0,
    codebaseSnapshotBytes: 0,
  },
  errors: [],
};

try {
  const root = await getJson('/collections');
  const collections = unwrap(root)?.collections ?? [];
  const names = collections.map((row) => row?.name).filter(Boolean).sort();
  report.totals.collectionCount = names.length;

  for (const name of names) {
    const entry = { name, classification: classifyCollection(name), info: null, memory: null, snapshots: null, errors: [] };
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
      entry.snapshots = snapshotSummary(await getJson(`/collections/${encodeURIComponent(name)}/snapshots`));
      report.totals.apiVisibleSnapshotBytes += entry.snapshots.totalBytes;
      report.totals.apiVisibleSnapshotCount += entry.snapshots.count;
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
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  gate: report.gate,
  collectionCount: report.totals.collectionCount,
  memoryEndpointCount: report.totals.collectionMemoryEndpointAvailable,
  liveCollectionDiskBytes: report.totals.liveCollectionDiskBytes,
  apiVisibleSnapshotBytes: report.totals.apiVisibleSnapshotBytes,
  codebaseLiveDiskBytes: report.totals.codebaseLiveDiskBytes,
  codebaseSnapshotBytes: report.totals.codebaseSnapshotBytes,
  largestCollections: report.collections.slice(0, 10).map((row) => ({ name: row.name, classification: row.classification, diskBytes: row.memory?.diskBytes ?? null, snapshotBytes: row.snapshots?.totalBytes ?? null })),
  errors: report.errors,
  reportPath: noReport ? null : path.relative(ROOT, REPORT_PATH),
  writesPerformed: false,
}, null, 2));

if (report.errors.length > 0) process.exitCode = 2;
