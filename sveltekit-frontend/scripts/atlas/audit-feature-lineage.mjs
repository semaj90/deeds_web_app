#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveRedisConfig } from '../../../scripts/atlas/connection-config.mjs';
import {
  normalizeFeatureId,
  normalizeFeatureLabel,
  normalizePathLike,
  normalizeSourceRef,
  normalizeSourceRefs,
  readJsonlFile,
  relativeDisplay,
} from './audit-jsonl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.md');

loadAtlasEnv(REPO_ROOT);

const INPUTS = {
  featureLabels: path.join(REPO_ROOT, '.tmp', 'feature_labels.jsonl'),
  kanbanTasks: path.join(REPO_ROOT, '.tmp', 'kanban_tasks.jsonl'),
  missingFeatureTodos: path.join(REPO_ROOT, '.tmp', 'missing_feature_todos.jsonl'),
};

const DISCOVERY_ROOTS = [
  path.resolve(REPO_ROOT, '.tmp'),
  path.join(REPO_ROOT, 'docs', 'reports'),
  path.join(REPO_ROOT, 'memory'),
  path.resolve(REPO_ROOT, '..', 'memory'),
].filter((dir, index, roots) => fs.existsSync(dir) && roots.indexOf(dir) === index);

const DISCOVERY_EXTENSIONS = new Set(['.json', '.jsonl', '.ndjson', '.md', '.txt']);
const LIVE_PROBE_TIMEOUT_MS = 2500;
const LIVE_PROBE_ROW_LIMIT = 3;
const LIVE_PROBE_KEY_LIMIT = 25;
const LIVE_REDIS_PATTERNS = ['gpu:glyph:*', '*source_ref*', '*sourceRef*', '*path*', '*feature*', '*qdrant*', '*neo4j*'];

const HOP_DISCOVERY_SPECS = [
  {
    hop: 'somCluster',
    fields: ['som_cluster', 'somCluster', 'cluster_id', 'clusterId', 'centroid_id'],
    probableJoinKey: 'som_cluster',
    whyZero: 'The lineage rows never project SOM cluster metadata, so this hop stays empty even though the artifacts may carry the field names.',
  },
  {
    hop: 'glyphRecord',
    fields: ['glyph_record', 'glyphRecord', 'glyph_id', 'glyphId', 'glyph', 'gpu:glyph'],
    probableJoinKey: 'glyph_record',
    whyZero: 'Glyph metadata is not part of the current lineage surface, so any glyph-shaped evidence remains disconnected from the normalized rows.',
  },
  {
    hop: 'qdrantHit',
    fields: ['qdrant_hit', 'qdrantHit', 'qdrant_hits', 'qdrant_point_id', 'point_id'],
    probableJoinKey: 'qdrant_point_id',
    whyZero: 'The lineage auditor tracks sourceRef and featureId, but it does not yet hydrate raw Qdrant hit identifiers into the row set.',
  },
  {
    hop: 'redisHotKey',
    fields: ['redis_hot_key', 'redisHotKey', 'redis_key', 'redisKeys', 'hot_key'],
    probableJoinKey: 'redis_hot_key',
    whyZero: 'Redis key evidence may exist in reports or packet payloads, but the lineage rows do not carry a hot-key field today.',
  },
  {
    hop: 'neo4jNode',
    fields: ['neo4j_node', 'neo4jNode', 'node_id', 'nodeId', 'graph_node'],
    probableJoinKey: 'neo4j_node',
    whyZero: 'Neo4j node evidence is visible in graph-oriented artifacts, but the lineage auditor does not yet project those node identifiers into the normalized feature rows.',
  },
];

const JOIN_SURFACES = [
  {
    name: 'route_runtime_packets',
    kind: 'table',
    source: path.join(REPO_ROOT, 'src', 'lib', 'server', 'db', 'schema', 'route_runtime_packets.ts'),
    candidateKeys: ['sourceRefs', 'featureIds', 'somCluster', 'qdrantHits', 'redisHotKeys'],
    canonicalJoinKey: 'sourceRefs[] + featureIds[] projected through the packet spine',
    whyZero: 'Present as a runtime telemetry table, but the lineage auditor reads JSONL feature surfaces, not runtime packets.',
  },
  {
    name: 'parent_atlas_documents',
    kind: 'table',
    source: path.join(REPO_ROOT, 'src', 'routes', 'dev', 'file-card', '[...sourceRef]', '+page.server.ts'),
    candidateKeys: ['source_ref', 'feature_id', 'rel_path', 'qdrant_point_id'],
    canonicalJoinKey: 'source_ref',
    whyZero: 'Join keys exist in the dev file-card fallback query, but the lineage auditor does not read parent_atlas_documents rows.',
  },
  {
    name: 'atlas_feature_map_synthesized',
    kind: 'table',
    source: path.join(REPO_ROOT, 'src', 'routes', 'dev', 'file-card', '[...sourceRef]', '+page.server.ts'),
    candidateKeys: ['source_ref', 'som_cluster', 'packet_count', 'semantic_confidence', 'behavior_score', 'routing_score'],
    canonicalJoinKey: 'source_ref',
    whyZero: 'SOM cluster metadata exists in route-side joins, but the lineage auditor does not project this table.',
  },
  {
    name: 'atlas_feature_synthesis',
    kind: 'table',
    source: path.join(REPO_ROOT, 'src', 'routes', 'dev', 'file-card', '[...sourceRef]', '+page.server.ts'),
    candidateKeys: ['feature_id', 'avg_confidence', 'dominant_status', 'primary_cluster_id'],
    canonicalJoinKey: 'feature_id',
    whyZero: 'Feature-level synthesis exists behind the file-card fallback, but the lineage auditor only normalizes feature labels.',
  },
  {
    name: 'qdrant_codebase_chunks_768',
    kind: 'payload',
    source: path.join(REPO_ROOT, 'src', 'mcp', 'tools', 'trace-kag.tool.ts'),
    candidateKeys: ['payload.source_ref', 'payload.file_path', 'payload.som_cluster', 'payload.summary'],
    canonicalJoinKey: 'payload.source_ref (fallback: payload.file_path)',
    whyZero: 'Qdrant payload fields are reachable in graph/search tooling, but the lineage auditor is not sampling live Qdrant payloads.',
  },
  {
    name: 'neo4j_codebasefile',
    kind: 'graph',
    source: path.join(REPO_ROOT, 'scripts', 'check-neo4j.cjs'),
    candidateKeys: ['labels(CodebaseFile)', 'filePath', 'sourceRef', 'nodeLabel', 'usedTables'],
    canonicalJoinKey: 'CodebaseFile.filePath / CodebaseFile.sourceRef',
    whyZero: 'Neo4j node labels/properties exist in graph tooling, but the lineage auditor does not query Neo4j yet.',
  },
  {
    name: 'local_jsonl_surface',
    kind: 'artifact',
    source: path.join(REPO_ROOT, 'scripts', 'atlas', 'audit-jsonl.mjs'),
    candidateKeys: ['source_ref', 'feature_id', 'feature_label', 'som_cluster', 'qdrant_point_id', 'redis_hot_key', 'neo4j_node'],
    canonicalJoinKey: 'source_ref + feature_id',
    whyZero: 'The lineage auditor already normalizes sourceRef/featureId/labels from JSONL, but the higher-hop keys are not present in the loaded feature surfaces.',
  },
];

function buildFeatureLabelMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const featureId = normalizeFeatureId(row);
    if (!featureId) continue;
    const label = normalizeFeatureLabel(row) ?? normalizePathLike(row.feature ?? row.featureKey);
    if (!map.has(featureId)) map.set(featureId, new Set());
    if (label) map.get(featureId).add(label);
  }
  return map;
}

function loadSurfaces() {
  return Object.entries(INPUTS).map(([key, filePath]) => ({
    key,
    filePath,
    relPath: relativeDisplay(REPO_ROOT, filePath),
    ...readJsonlFile(filePath),
  }));
}

function sampleKeys(rows, keys, limit = 5) {
  const samples = [];
  for (const row of rows) {
    const sample = {};
    let populated = false;
    for (const key of keys) {
      const value = row?.[key];
      if (Array.isArray(value)) {
        const arr = value.map((entry) => normalizePathLike(entry)).filter(Boolean);
        if (arr.length > 0) {
          sample[key] = arr.slice(0, 3);
          populated = true;
        }
      } else {
        const normalized = normalizePathLike(value);
        if (normalized) {
          sample[key] = normalized;
          populated = true;
        }
      }
    }
    if (populated) samples.push(sample);
    if (samples.length >= limit) break;
  }
  return samples;
}

function collectDiscoveryFiles(limit = 500) {
  const files = [];
  const visitedDirs = new Set();
  const stack = [...DISCOVERY_ROOTS];

  while (stack.length > 0 && files.length < limit) {
    const dir = stack.pop();
    if (!dir || visitedDirs.has(dir)) continue;
    visitedDirs.add(dir);

    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (DISCOVERY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
        if (files.length >= limit) break;
      }
    }
  }

  return files.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summarizeDiscoveryValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return normalizePathLike(value) ?? value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => summarizeDiscoveryValue(item)).filter(Boolean).slice(0, 3);
    return parts.length > 0 ? `[${parts.join(', ')}]` : null;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 4).map(([key, child]) => {
      const compact = summarizeDiscoveryValue(child);
      return compact ? `${key}=${compact}` : key;
    }).filter(Boolean);
    return entries.length > 0 ? `{${entries.join(', ')}}` : null;
  }
  return null;
}

function truncateDiscoveryText(text, limit = 120) {
  if (!text) return text;
  const compact = String(text).replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function noteDiscoveryMatch(index, alias, fileRel, fieldName, value, snippet) {
  const bucket = index.get(alias);
  if (!bucket) return;
  bucket.files.add(fileRel);
  bucket.fieldNames.add(fieldName);
  const sample = summarizeDiscoveryValue(value) ?? snippet;
  if (sample) bucket.sampleValues.add(truncateDiscoveryText(String(sample)));
}

function scanStructuredNode(node, aliasSet, index, fileRel) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) {
      scanStructuredNode(item, aliasSet, index, fileRel);
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (aliasSet.has(key)) {
      noteDiscoveryMatch(index, key, fileRel, key, value, null);
    }
    scanStructuredNode(value, aliasSet, index, fileRel);
  }
}

function scanTextNode(text, aliases, index, fileRel) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const alias of aliases) {
      if (!line.includes(alias)) continue;
      const valueMatch = line.match(new RegExp(`${escapeRegExp(alias)}\s*[:=]\s*(.+)$`, 'i'));
      const sample = valueMatch ? valueMatch[1].trim() : trimmed;
      noteDiscoveryMatch(index, alias, fileRel, alias, sample, trimmed);
    }
  }
}

function buildDiscoveryIndex(files, aliases) {
  const aliasSet = new Set(aliases);
  const index = new Map(aliases.map((alias) => [alias, {
    files: new Set(),
    fieldNames: new Set(),
    sampleValues: new Set(),
  }]));

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const relPath = relativeDisplay(REPO_ROOT, filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json' || ext === '.jsonl' || ext === '.ndjson') {
      try {
        if (ext === '.json') {
          scanStructuredNode(JSON.parse(text), aliasSet, index, relPath);
        } else {
          for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
              scanStructuredNode(JSON.parse(line), aliasSet, index, relPath);
            } catch {
              scanTextNode(text, aliases, index, relPath);
              break;
            }
          }
        }
      } catch {
        scanTextNode(text, aliases, index, relPath);
      }
    } else {
      scanTextNode(text, aliases, index, relPath);
    }
  }

  return index;
}

function buildHigherHopCandidateDiscovery() {
  const files = collectDiscoveryFiles();
  const aliases = [...new Set(HOP_DISCOVERY_SPECS.flatMap((spec) => spec.fields))];
  const index = buildDiscoveryIndex(files, aliases);

  return {
    scannedRoots: DISCOVERY_ROOTS.map((dir) => relativeDisplay(REPO_ROOT, dir)),
    scannedFiles: files.length,
    hops: HOP_DISCOVERY_SPECS.map((spec) => {
      const filesFound = new Set();
      const fieldNames = new Set();
      const sampleValues = new Set();

      for (const alias of spec.fields) {
        const bucket = index.get(alias);
        if (!bucket) continue;
        bucket.files.forEach((file) => filesFound.add(file));
        bucket.fieldNames.forEach((fieldName) => fieldNames.add(fieldName));
        bucket.sampleValues.forEach((sample) => sampleValues.add(sample));
      }

      return {
        hop: spec.hop,
        candidateEvidenceAnywhere: filesFound.size > 0 || fieldNames.size > 0 || sampleValues.size > 0,
        candidateFilesFound: [...filesFound].slice(0, 12),
        candidateFieldNamesFound: [...fieldNames].slice(0, 12),
        sampleValues: [...sampleValues].slice(0, 10),
        probableJoinKey: spec.probableJoinKey,
        whyZero: spec.whyZero,
      };
    }),
  };
}

function stageValue(row, featureLabelMap) {
  const featureId = normalizeFeatureId(row);
  const sourceRef = normalizeSourceRef(row);
  const labels = featureId ? [...(featureLabelMap.get(featureId) ?? [])] : [];

  const somCluster = row?.som_cluster ?? row?.somCluster ?? row?.cluster ?? row?.cluster_id ?? row?.som?.cluster ?? null;
  const glyphRecord = row?.glyph_record ?? row?.glyphRecord ?? row?.glyph ?? row?.glyph_records ?? null;
  const qdrantHit = row?.qdrant_point_id ?? row?.qdrantPointId ?? row?.qdrantHit ?? row?.qdrantHitId ?? row?.qdrant_hits ?? row?.qdrantHits ?? null;
  const redisHotKey = row?.redis_hot_key ?? row?.redisHotKey ?? row?.cache_key ?? row?.hot_key ?? row?.hotKey ?? null;
  const neo4jNode = row?.neo4j_node ?? row?.neo4jNode ?? row?.neo4j_id ?? row?.neo4jId ?? row?.graph_node ?? null;
  const taskId = row?.task_id ?? row?.taskId ?? null;
  const runId = row?.run_id ?? row?.runId ?? null;
  const pathValue = normalizePathLike(row?.path ?? row?.file_path ?? row?.relative_path);
  const sourceRefs = normalizeSourceRefs(row);

  const presentStages = [
    sourceRef,
    featureId,
    labels.length > 0 ? labels[0] : null,
    pathValue,
    taskId,
    runId,
    somCluster,
    glyphRecord,
    qdrantHit,
    redisHotKey,
    neo4jNode,
  ].filter(Boolean).length;

  const totalStages = 11;
  const lineageScorePct = Number(((presentStages / totalStages) * 100).toFixed(2));
  const hopCoverage = {
    sourceRef: Boolean(sourceRef),
    featureId: Boolean(featureId),
    featureLabel: labels.length > 0,
    path: Boolean(pathValue),
    taskId: Boolean(taskId),
    runId: Boolean(runId),
    somCluster: Boolean(somCluster),
    glyphRecord: Boolean(glyphRecord),
    qdrantHit: Boolean(qdrantHit),
    redisHotKey: Boolean(redisHotKey),
    neo4jNode: Boolean(neo4jNode),
  };

  return {
    sourceRef,
    sourceRefs,
    featureId,
    featureLabels: labels,
    path: pathValue,
    taskId,
    runId,
    somCluster,
    glyphRecord,
    qdrantHit,
    redisHotKey,
    neo4jNode,
    lineageScorePct,
    hopCoverage,
    missingHigherHopStages: [
      ['somCluster', somCluster],
      ['glyphRecord', glyphRecord],
      ['qdrantHit', qdrantHit],
      ['redisHotKey', redisHotKey],
      ['neo4jNode', neo4jNode],
    ].filter(([, value]) => !value).map(([name]) => name),
  };
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function createLiveProbeBucket(hop, source, envName) {
  return {
    hop,
    source,
    envName,
    status: 'not-sampled',
    sampledCount: 0,
    detectedJoinKeys: [],
    sampleValues: [],
    note: 'not sampled by current auditor',
  };
}

function finalizeProbeBucket(bucket, detectedJoinKeys, sampleValues, sampledCount, note, status = 'sampled') {
  bucket.status = status;
  bucket.sampledCount = sampledCount;
  bucket.detectedJoinKeys = [...new Set(detectedJoinKeys)].slice(0, 12);
  bucket.sampleValues = [...new Set(sampleValues)].slice(0, 10);
  bucket.note = note;
  return bucket;
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function collectAliasMatches(node, aliases, hits, sampleValues, pathParts = []) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) collectAliasMatches(item, aliases, hits, sampleValues, pathParts);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    if (aliases.has(key)) {
      hits.add(key);
      const sample = summarizeDiscoveryValue(value);
      if (sample) sampleValues.add(truncateDiscoveryText(sample));
    }
    collectAliasMatches(value, aliases, hits, sampleValues, [...pathParts, key]);
  }
}

function collectFieldNames(node, fieldNames, prefix = '', depth = 0, maxDepth = 2) {
  if (node === null || node === undefined) return;
  if (depth > maxDepth) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 3)) collectFieldNames(item, fieldNames, prefix, depth, maxDepth);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const pathName = prefix ? `${prefix}.${key}` : key;
    fieldNames.add(pathName);
    collectFieldNames(value, fieldNames, pathName, depth + 1, maxDepth);
  }
}

function compareAliasCoverage(actualFieldNames, expectedAliases) {
  const actual = [...new Set(actualFieldNames)].sort();
  const expected = [...new Set(expectedAliases)].sort();
  const actualSet = new Set(actual);

  return {
    actualFieldNames: actual,
    expectedAliases: expected,
    expectedAliasesPresent: expected.filter((alias) => actualSet.has(alias)),
    expectedAliasesMissing: expected.filter((alias) => !actualSet.has(alias)),
    actualFieldNamesNotInExpectedAliases: actual.filter((fieldName) => !expected.includes(fieldName)),
  };
}

function buildAliasPatchRecommendation(hop, actualFieldNames, expectedAliasesMissing, contextLabel) {
  const actualPreview = actualFieldNames.slice(0, 12).join(', ') || 'none';
  const missingPreview = expectedAliasesMissing.length > 0 ? expectedAliasesMissing.join(', ') : 'none';
  return `${contextLabel}: map ${hop} to actual fields (${actualPreview}); missing expected aliases: ${missingPreview}; no writes.`;
}

function inferProbeInterpretation({ sampledCount, detectedJoinKeys, note, unavailable }) {
  if (unavailable) return 'live source unavailable';
  if (sampledCount === 0) return 'data absent in sampled live source';
  if (detectedJoinKeys.length === 0) return 'field-name mismatch in sampled live source';
  return note || 'not joined by current auditor';
}

async function probePostgresTable(tableName, aliasList) {
  const envUrl = process.env.DATABASE_URL ?? process.env.VITE_DATABASE_URL ?? null;
  const bucket = createLiveProbeBucket(tableName, 'postgres', 'DATABASE_URL');
  if (!envUrl) {
    bucket.status = 'unavailable';
    bucket.note = 'DATABASE_URL is not set';
    return bucket;
  }

  let pool;
  try {
    const { Pool } = await import('pg');
    pool = new Pool({
      connectionString: envUrl,
      connectionTimeoutMillis: LIVE_PROBE_TIMEOUT_MS,
      idleTimeoutMillis: LIVE_PROBE_TIMEOUT_MS,
      max: 1,
    });

    const regclassRes = await withTimeout(
      pool.query('select to_regclass($1) as regclass', [`public.${tableName}`]),
      LIVE_PROBE_TIMEOUT_MS,
      `pg:${tableName}:regclass`
    );
    if (!regclassRes.rows?.[0]?.regclass) {
      bucket.status = 'unavailable';
      bucket.note = `table ${tableName} is not present in postgres`;
      return bucket;
    }

    const rowsRes = await withTimeout(
      pool.query(`select * from ${quoteIdentifier(tableName)} limit ${LIVE_PROBE_ROW_LIMIT}`),
      LIVE_PROBE_TIMEOUT_MS,
      `pg:${tableName}:rows`
    );

    const hits = new Set();
    const sampleValues = new Set();
    for (const row of rowsRes.rows ?? []) {
      collectAliasMatches(row, new Set(aliasList), hits, sampleValues);
    }

    const note = inferProbeInterpretation({
      sampledCount: rowsRes.rowCount ?? rowsRes.rows?.length ?? 0,
      detectedJoinKeys: [...hits],
      note: 'postgres rows sampled successfully',
      unavailable: false,
    });
    return finalizeProbeBucket(bucket, [...hits], [...sampleValues], rowsRes.rowCount ?? rowsRes.rows?.length ?? 0, note);
  } catch (error) {
    bucket.status = 'unavailable';
    bucket.note = error instanceof Error ? error.message : String(error);
    return bucket;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

async function probeQdrantCollection() {
  const envUrl = process.env.QDRANT_URL ?? process.env.VITE_QDRANT_URL ?? null;
  const bucket = createLiveProbeBucket('qdrantHit', 'qdrant', 'QDRANT_URL');
  if (!envUrl) {
    bucket.status = 'unavailable';
    bucket.note = 'QDRANT_URL is not set';
    return bucket;
  }

  try {
    const response = await withTimeout(
      fetch(`${envUrl.replace(/\/$/, '')}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: LIVE_PROBE_ROW_LIMIT, with_payload: true, with_vectors: false }),
      }),
      LIVE_PROBE_TIMEOUT_MS,
      'qdrant:scroll'
    );

    if (!response.ok) {
      bucket.status = 'unavailable';
      bucket.note = `Qdrant HTTP ${response.status}`;
      return bucket;
    }

    const payload = await response.json();
    const points = payload?.result?.points ?? payload?.result ?? payload?.points ?? [];
    const hits = new Set();
    const sampleValues = new Set();
    const actualFieldNames = new Set();
    const samplePayloadKeys = new Set();
    for (const point of points) {
      collectFieldNames(point, actualFieldNames, '', 0, 2);
      if (point?.id !== undefined && point?.id !== null) {
        sampleValues.add(truncateDiscoveryText(String(point.id)));
      }
      collectAliasMatches(point, new Set(['qdrant_point_id', 'point_id']), hits, sampleValues);
      const payloadNode = point?.payload ?? {};
      Object.keys(payloadNode).forEach((key) => samplePayloadKeys.add(key));
      collectAliasMatches(payloadNode, new Set(['source_ref', 'file_path', 'feature_id', 'som_cluster', 'qdrant_point_id', 'payload', 'summary']), hits, sampleValues);
    }

    const aliasCoverage = compareAliasCoverage(actualFieldNames, ['qdrant_hit', 'qdrantHit', 'qdrant_hits', 'qdrant_point_id', 'point_id', 'id', 'payload.source_ref', 'payload.file_path']);

    const note = inferProbeInterpretation({
      sampledCount: points.length,
      detectedJoinKeys: [...hits],
      note: 'Qdrant scroll sampled successfully',
      unavailable: false,
    });
    bucket.actualFieldNamesFound = aliasCoverage.actualFieldNames;
    bucket.samplePayloadKeys = [...samplePayloadKeys].sort();
    bucket.expectedAliases = aliasCoverage.expectedAliases;
    bucket.expectedAliasesPresent = aliasCoverage.expectedAliasesPresent;
    bucket.expectedAliasesMissing = aliasCoverage.expectedAliasesMissing;
    bucket.actualFieldNamesNotInExpectedAliases = aliasCoverage.actualFieldNamesNotInExpectedAliases;
    bucket.recommendedAliasPatchOnly = buildAliasPatchRecommendation('qdrantHit', aliasCoverage.actualFieldNames, aliasCoverage.expectedAliasesMissing, 'Qdrant alias discovery');
    return finalizeProbeBucket(bucket, [...hits], [...sampleValues], points.length, note);
  } catch (error) {
    bucket.status = 'unavailable';
    bucket.note = error instanceof Error ? error.message : String(error);
    return bucket;
  }
}

async function probeRedisKeys() {
  const redisConfig = resolveRedisConfig(process.env);
  const redisUrl = process.env.REDIS_URL ?? process.env.VITE_REDIS_URL ?? redisConfig.url;
  const bucket = createLiveProbeBucket('redisHotKey', 'redis', 'REDIS_URL');
  const redisPassword = process.env.REDIS_PASSWORD ?? process.env.VALKEY_PASSWORD ?? redisConfig.password ?? '';
  const redisUsername = process.env.REDIS_USERNAME ?? process.env.REDIS_USER ?? '';
  const urlPassword = (() => {
    try {
      return new URL(redisUrl).password ?? '';
    } catch {
      return '';
    }
  })();
  if (!redisPassword && !urlPassword) {
    bucket.status = 'unavailable';
    bucket.note = 'SOURCE_UNAVAILABLE / AUTH_REQUIRED';
    return bucket;
  }

  const redisProbeError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/NOAUTH|WRONGPASS|authentication required|auth required/i.test(message)) {
      return 'SOURCE_UNAVAILABLE / AUTH_REQUIRED';
    }
    return message;
  };

  const createRedisProbeClient = async () => {
    try {
      const redisModule = await import('redis');
      if (typeof redisModule.createClient === 'function') {
        const client = redisModule.createClient({
          url: redisUrl,
          username: redisUsername || undefined,
          password: redisPassword || undefined,
        });
        client.on('error', () => {});
        return {
          kind: 'redis',
          client,
          connect: async () => client.connect(),
          scan: async (cursor, pattern) => client.scan(cursor, { MATCH: pattern, COUNT: 25 }),
          close: async () => client.quit().catch(() => client.disconnect?.()),
        };
      }
    } catch (error) {
      const redisError = error instanceof Error ? error.message : String(error);
      try {
        const ioredisModule = await import('ioredis');
        const IORedis = ioredisModule.default ?? ioredisModule.Redis ?? ioredisModule;
        if (typeof IORedis === 'function') {
          const client = new IORedis(redisUrl, {
            username: redisUsername || undefined,
            password: redisPassword || undefined,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: LIVE_PROBE_TIMEOUT_MS,
          });
          client.on('error', () => {});
          return {
            kind: 'ioredis',
            client,
            connect: async () => (typeof client.connect === 'function' ? client.connect() : Promise.resolve()),
            scan: async (cursor, pattern) => {
              const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 25);
              const nextCursor = Array.isArray(result) ? result[0] : result?.[0] ?? '0';
              const keys = Array.isArray(result) ? result[1] ?? [] : result?.[1] ?? [];
              return { cursor: String(nextCursor ?? '0'), keys };
            },
            close: async () => client.quit?.().catch(() => client.disconnect?.()),
          };
        }
      } catch (fallbackError) {
        const ioredisError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return { error: `${redisError}; ${ioredisError}` };
      }
      return { error: redisError };
    }

    return { error: 'No supported Redis client export found' };
  };

  try {
    const redisClient = await createRedisProbeClient();
    if (redisClient?.error) {
      bucket.status = 'unavailable';
      bucket.note = `Redis probe dependency unavailable: ${redisProbeError(redisClient.error)}`;
      return bucket;
    }

    await withTimeout(redisClient.connect(), LIVE_PROBE_TIMEOUT_MS, `redis:${redisClient.kind}:connect`);

    const matchedKeys = [];
    const sampleValues = new Set();
    const patterns = LIVE_REDIS_PATTERNS.slice();
    let examinedKeys = 0;

    for (const pattern of patterns) {
      if (matchedKeys.length >= LIVE_PROBE_KEY_LIMIT || examinedKeys >= LIVE_PROBE_KEY_LIMIT) break;
      let cursor = '0';
      do {
        const result = await withTimeout(redisClient.scan(cursor, pattern), LIVE_PROBE_TIMEOUT_MS, `redis:${redisClient.kind}:scan:${pattern}`);
        cursor = result.cursor;
        examinedKeys += Array.isArray(result.keys) ? result.keys.length : 0;
        for (const key of result.keys ?? []) {
          matchedKeys.push(key);
          sampleValues.add(truncateDiscoveryText(key));
          if (matchedKeys.length >= LIVE_PROBE_KEY_LIMIT) break;
        }
      } while (cursor !== '0' && matchedKeys.length < LIVE_PROBE_KEY_LIMIT && examinedKeys < LIVE_PROBE_KEY_LIMIT);
      if (matchedKeys.length >= LIVE_PROBE_KEY_LIMIT) break;
    }

    const detectedJoinKeys = matchedKeys.filter((key) => /gpu:glyph|source_ref|sourceRef|path|feature|redis|hot_key|qdrant|neo4j/i.test(key));
    const note = inferProbeInterpretation({
      sampledCount: matchedKeys.length,
      detectedJoinKeys,
      note: 'bounded SCAN completed',
      unavailable: false,
    });
    await redisClient.close().catch(() => {});
    return finalizeProbeBucket(bucket, detectedJoinKeys, [...sampleValues], matchedKeys.length, note);
  } catch (error) {
    bucket.status = 'unavailable';
    bucket.note = redisProbeError(error);
    return bucket;
  }
}

async function probeNeo4jCodebaseFile() {
  const uri = process.env.NEO4J_URI ?? process.env.NEO4J_URL ?? null;
  const user = process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? null;
  const bucket = createLiveProbeBucket('neo4jNode', 'neo4j', 'NEO4J_URI');
  if (!uri || !password) {
    bucket.status = 'unavailable';
    bucket.note = !uri ? 'NEO4J_URI is not set' : 'NEO4J_PASSWORD/NEO4J_PASS is not set';
    return bucket;
  }

  let driver;
  try {
    const neo4jPkg = await import('neo4j-driver');
    const neo4j = neo4jPkg.default ?? neo4jPkg;
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      connectionTimeout: LIVE_PROBE_TIMEOUT_MS,
    });
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await withTimeout(
          session.run('MATCH (n:CodebaseFile) RETURN labels(n) AS labels, keys(n) AS keys, properties(n) AS properties, n.filePath AS filePath, n.sourceRef AS sourceRef, elementId(n) AS elementId LIMIT 3'),
        LIVE_PROBE_TIMEOUT_MS,
        'neo4j:codebasefile'
      );

      const detected = new Set();
      const sampleValues = new Set();
        const actualFieldNames = new Set();
        const samplePropertyKeys = new Set();
      for (const record of result.records ?? []) {
        const labels = record.get('labels') ?? [];
        const keys = record.get('keys') ?? [];
          const properties = record.get('properties') ?? {};
        const filePath = record.get('filePath');
        const sourceRef = record.get('sourceRef');
          const elementId = record.get('elementId');
        if (Array.isArray(labels)) labels.forEach((label) => sampleValues.add(truncateDiscoveryText(String(label))));
        if (Array.isArray(keys)) keys.forEach((key) => detected.add(String(key)));
          if (properties && typeof properties === 'object') {
            collectFieldNames(properties, actualFieldNames, '', 0, 2);
            Object.keys(properties).forEach((key) => samplePropertyKeys.add(key));
          }
        if (filePath) sampleValues.add(truncateDiscoveryText(String(filePath)));
        if (sourceRef) sampleValues.add(truncateDiscoveryText(String(sourceRef)));
          if (elementId) sampleValues.add(truncateDiscoveryText(String(elementId)));
          actualFieldNames.add('labels');
          actualFieldNames.add('keys');
          actualFieldNames.add('properties');
          actualFieldNames.add('filePath');
          actualFieldNames.add('sourceRef');
          actualFieldNames.add('elementId');
      }

      const detectedJoinKeys = [...detected].filter((key) => /filePath|sourceRef|nodeId|node_id|labels|keys/i.test(key));
        const aliasCoverage = compareAliasCoverage(actualFieldNames, ['neo4j_node', 'neo4jNode', 'node_id', 'nodeId', 'graph_node', 'filePath', 'sourceRef', 'source_ref']);
      const note = inferProbeInterpretation({
        sampledCount: result.records?.length ?? 0,
        detectedJoinKeys,
        note: 'CodebaseFile sample query completed',
        unavailable: false,
      });
        bucket.actualFieldNamesFound = aliasCoverage.actualFieldNames;
        bucket.samplePropertyKeys = [...samplePropertyKeys].sort();
        bucket.expectedAliases = aliasCoverage.expectedAliases;
        bucket.expectedAliasesPresent = aliasCoverage.expectedAliasesPresent;
        bucket.expectedAliasesMissing = aliasCoverage.expectedAliasesMissing;
        bucket.actualFieldNamesNotInExpectedAliases = aliasCoverage.actualFieldNamesNotInExpectedAliases;
        bucket.recommendedAliasPatchOnly = buildAliasPatchRecommendation('neo4jNode', aliasCoverage.actualFieldNames, aliasCoverage.expectedAliasesMissing, 'Neo4j alias discovery');
        return finalizeProbeBucket(bucket, detectedJoinKeys, [...sampleValues], result.records?.length ?? 0, note);
    } finally {
      await session.close().catch(() => {});
    }
  } catch (error) {
    bucket.status = 'unavailable';
    bucket.note = error instanceof Error ? error.message : String(error);
    return bucket;
  } finally {
    if (driver) {
      try {
        await driver.close();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

async function buildLiveHopProbes() {
  return {
    routeRuntimePackets: await probePostgresTable('route_runtime_packets', ['sourceRefs', 'featureIds', 'somCluster', 'qdrantHits', 'redisHotKeys']),
    parentAtlasDocuments: await probePostgresTable('parent_atlas_documents', ['source_ref', 'feature_id', 'rel_path', 'qdrant_point_id']),
    atlasFeatureMapSynthesized: await probePostgresTable('atlas_feature_map_synthesized', ['source_ref', 'som_cluster', 'packet_count', 'semantic_confidence', 'behavior_score', 'routing_score']),
    atlasFeatureSynthesis: await probePostgresTable('atlas_feature_synthesis', ['feature_id', 'avg_confidence', 'dominant_status', 'primary_cluster_id']),
    qdrantCodebaseChunks768: await probeQdrantCollection(),
    redisHotKeys: await probeRedisKeys(),
    neo4jCodebaseFile: await probeNeo4jCodebaseFile(),
  };
}

async function buildReport() {
  const surfaces = loadSurfaces();
  const allRows = surfaces.flatMap((surface) => surface.rows.map((row) => ({ ...row, __surface: surface.key, __filePath: surface.relPath })));
  const featureLabelMap = buildFeatureLabelMap(allRows);
  const higherHopCandidateDiscovery = buildHigherHopCandidateDiscovery();
  const liveHopProbes = await buildLiveHopProbes();
  const fieldNameMismatchDiscovery = {
    qdrantHit: {
      actualFieldNamesFound: liveHopProbes.qdrantCodebaseChunks768.actualFieldNamesFound ?? [],
      samplePayloadKeys: liveHopProbes.qdrantCodebaseChunks768.samplePayloadKeys ?? [],
      expectedAliases: liveHopProbes.qdrantCodebaseChunks768.expectedAliases ?? ['qdrant_hit', 'qdrantHit', 'qdrant_hits', 'qdrant_point_id', 'point_id', 'id', 'payload.source_ref', 'payload.file_path'],
      expectedAliasesPresent: liveHopProbes.qdrantCodebaseChunks768.expectedAliasesPresent ?? [],
      expectedAliasesMissing: liveHopProbes.qdrantCodebaseChunks768.expectedAliasesMissing ?? [],
      recommendedAliasPatchOnly: liveHopProbes.qdrantCodebaseChunks768.recommendedAliasPatchOnly ?? 'Qdrant alias discovery unavailable',
    },
    neo4jNode: {
      actualFieldNamesFound: liveHopProbes.neo4jCodebaseFile.actualFieldNamesFound ?? [],
      samplePropertyKeys: liveHopProbes.neo4jCodebaseFile.samplePropertyKeys ?? [],
      expectedAliases: liveHopProbes.neo4jCodebaseFile.expectedAliases ?? ['neo4j_node', 'neo4jNode', 'node_id', 'nodeId', 'graph_node', 'filePath', 'sourceRef', 'source_ref'],
      expectedAliasesPresent: liveHopProbes.neo4jCodebaseFile.expectedAliasesPresent ?? [],
      expectedAliasesMissing: liveHopProbes.neo4jCodebaseFile.expectedAliasesMissing ?? [],
      recommendedAliasPatchOnly: liveHopProbes.neo4jCodebaseFile.recommendedAliasPatchOnly ?? 'Neo4j alias discovery unavailable',
    },
  };

  const lineages = allRows.map((row) => stageValue(row, featureLabelMap));
  const sourceRefRows = lineages.filter((row) => Boolean(row.sourceRef));
  const featureIdRows = lineages.filter((row) => Boolean(row.featureId));
  const featureLabelRows = lineages.filter((row) => row.featureLabels.length > 0);
  const pathRows = lineages.filter((row) => Boolean(row.path));
  const taskIdRows = lineages.filter((row) => Boolean(row.taskId));
  const runIdRows = lineages.filter((row) => Boolean(row.runId));

  const higherHopCoverage = {
    somClusterRows: lineages.filter((row) => Boolean(row.somCluster)).length,
    glyphRecordRows: lineages.filter((row) => Boolean(row.glyphRecord)).length,
    qdrantHitRows: lineages.filter((row) => Boolean(row.qdrantHit)).length,
    redisHotKeyRows: lineages.filter((row) => Boolean(row.redisHotKey)).length,
    neo4jNodeRows: lineages.filter((row) => Boolean(row.neo4jNode)).length,
  };

  const hopCoverage = {
    sourceRef: lineages.filter((row) => row.hopCoverage.sourceRef).length,
    featureId: lineages.filter((row) => row.hopCoverage.featureId).length,
    featureLabel: lineages.filter((row) => row.hopCoverage.featureLabel).length,
    path: lineages.filter((row) => row.hopCoverage.path).length,
    taskId: lineages.filter((row) => row.hopCoverage.taskId).length,
    runId: lineages.filter((row) => row.hopCoverage.runId).length,
    somCluster: lineages.filter((row) => row.hopCoverage.somCluster).length,
    glyphRecord: lineages.filter((row) => row.hopCoverage.glyphRecord).length,
    qdrantHit: lineages.filter((row) => row.hopCoverage.qdrantHit).length,
    redisHotKey: lineages.filter((row) => row.hopCoverage.redisHotKey).length,
    neo4jNode: lineages.filter((row) => row.hopCoverage.neo4jNode).length,
  };

  const hopCoveragePct = Object.fromEntries(
    Object.entries(hopCoverage).map(([key, count]) => [
      key,
      lineages.length > 0 ? Number(((count / lineages.length) * 100).toFixed(2)) : 0,
    ])
  );

  const averageLineageScorePct = lineages.length > 0
    ? Number((lineages.reduce((sum, row) => sum + row.lineageScorePct, 0) / lineages.length).toFixed(2))
    : 0;

  const higherHopJoinMap = JOIN_SURFACES.map((surface) => {
    const exists = fs.existsSync(surface.source);
    const text = exists ? fs.readFileSync(surface.source, 'utf8') : '';
    return {
      name: surface.name,
      kind: surface.kind,
      source: relativeDisplay(REPO_ROOT, surface.source),
      exists,
      candidateKeys: surface.candidateKeys,
      canonicalJoinKey: surface.canonicalJoinKey,
      sampleKeysFound: surface.candidateKeys.filter((key) => text.includes(key)),
      whyZero: surface.whyZero,
    };
  });

  const higherHopJoinSamples = {
    routeRuntimePackets: sampleKeys(lineages.map((row) => ({
      sourceRefs: row.sourceRefs,
      featureIds: row.featureId ? [row.featureId] : [],
      somCluster: row.somCluster,
      qdrantHits: row.qdrantHit,
      redisHotKeys: row.redisHotKey ? [row.redisHotKey] : [],
      neo4jNode: row.neo4jNode,
    })), ['sourceRefs', 'featureIds', 'somCluster', 'qdrantHits', 'redisHotKeys', 'neo4jNode']),
    parentAtlasDocuments: sampleKeys(allRows, ['source_ref', 'feature_id', 'rel_path', 'qdrant_point_id']),
    qdrantPayload: sampleKeys(allRows, ['source_ref', 'feature_id', 'som_cluster', 'qdrant_point_id']),
    redisKeys: sampleKeys(allRows, ['redis_hot_keys', 'cache_key', 'hot_key']),
    neo4jNodes: sampleKeys(allRows, ['neo4j_node', 'neo4j_node_id', 'nodeLabel', 'usedTables']),
    localJsonl: sampleKeys(allRows, ['source_ref', 'feature_id', 'feature_label', 'som_cluster', 'qdrant_point_id', 'redis_hot_key', 'neo4j_node']),
  };

  const featureGroups = [...new Map(lineages
    .filter((row) => row.featureId)
    .map((row) => [row.featureId, []]))
    .keys()]
    .slice(0, 200)
    .map((featureId) => {
      const rows = lineages.filter((row) => row.featureId === featureId);
      return {
        featureId,
        rowCount: rows.length,
        labels: [...new Set(rows.flatMap((row) => row.featureLabels))].slice(0, 8),
        sourceRefs: [...new Set(rows.map((row) => row.sourceRef).filter(Boolean))].slice(0, 8),
        avgLineageScorePct: rows.length > 0 ? Number((rows.reduce((sum, row) => sum + row.lineageScorePct, 0) / rows.length).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.rowCount - a.rowCount);

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: Object.fromEntries(Object.entries(INPUTS).map(([key, filePath]) => [key, relativeDisplay(REPO_ROOT, filePath)])),
    summary: {
      totalRows: lineages.length,
      sourceRefRows: sourceRefRows.length,
      sourceRefCoveragePct: lineages.length > 0 ? Number(((sourceRefRows.length / lineages.length) * 100).toFixed(2)) : 0,
      featureIdRows: featureIdRows.length,
      featureIdCoveragePct: lineages.length > 0 ? Number(((featureIdRows.length / lineages.length) * 100).toFixed(2)) : 0,
      featureLabelRows: featureLabelRows.length,
      featureLabelCoveragePct: lineages.length > 0 ? Number(((featureLabelRows.length / lineages.length) * 100).toFixed(2)) : 0,
      pathRows: pathRows.length,
      taskIdRows: taskIdRows.length,
      runIdRows: runIdRows.length,
      higherHopCoverage,
      hopCoverage,
      hopCoveragePct,
      higherHopJoinMap,
      higherHopJoinSamples,
      higherHopCandidateDiscovery,
      fieldNameMismatchDiscovery,
      liveHopProbes,
      averageLineageScorePct,
      maxLineageScorePct: lineages.reduce((max, row) => Math.max(max, row.lineageScorePct), 0),
      sampleCount: Math.min(lineages.length, 40),
      missingHigherHopRows: lineages.filter((row) => row.missingHigherHopStages.length > 0).length,
      featureGroups,
      sampleLineages: lineages.slice(0, 40).map((row) => ({
        sourceRef: row.sourceRef,
        featureId: row.featureId,
        featureLabels: row.featureLabels,
        path: row.path,
        taskId: row.taskId,
        runId: row.runId,
        somCluster: row.somCluster,
        glyphRecord: row.glyphRecord,
        qdrantHit: row.qdrantHit,
        redisHotKey: row.redisHotKey,
        neo4jNode: row.neo4jNode,
        lineageScorePct: row.lineageScorePct,
        missingHigherHopStages: row.missingHigherHopStages,
      })),
    },
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Feature Lineage Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Coverage',
    '',
    `- total rows: ${report.summary.totalRows}`,
    `- sourceRef rows: ${report.summary.sourceRefRows} (${report.summary.sourceRefCoveragePct}%)`,
    `- featureId rows: ${report.summary.featureIdRows} (${report.summary.featureIdCoveragePct}%)`,
    `- featureLabel rows: ${report.summary.featureLabelRows} (${report.summary.featureLabelCoveragePct}%)`,
    `- path rows: ${report.summary.pathRows}`,
    `- taskId rows: ${report.summary.taskIdRows}`,
    `- runId rows: ${report.summary.runIdRows}`,
    '',
    '## Higher-Hop Coverage',
    '',
    `- somCluster rows: ${report.summary.higherHopCoverage.somClusterRows}`,
    `- glyphRecord rows: ${report.summary.higherHopCoverage.glyphRecordRows}`,
    `- qdrantHit rows: ${report.summary.higherHopCoverage.qdrantHitRows}`,
    `- redisHotKey rows: ${report.summary.higherHopCoverage.redisHotKeyRows}`,
    `- neo4jNode rows: ${report.summary.higherHopCoverage.neo4jNodeRows}`,
    '',
    '## Hop Coverage',
    '',
    `- sourceRef: ${report.summary.hopCoverage.sourceRef} (${report.summary.hopCoveragePct.sourceRef}%)`,
    `- featureId: ${report.summary.hopCoverage.featureId} (${report.summary.hopCoveragePct.featureId}%)`,
    `- featureLabel: ${report.summary.hopCoverage.featureLabel} (${report.summary.hopCoveragePct.featureLabel}%)`,
    `- path: ${report.summary.hopCoverage.path} (${report.summary.hopCoveragePct.path}%)`,
    `- taskId: ${report.summary.hopCoverage.taskId} (${report.summary.hopCoveragePct.taskId}%)`,
    `- runId: ${report.summary.hopCoverage.runId} (${report.summary.hopCoveragePct.runId}%)`,
    `- somCluster: ${report.summary.hopCoverage.somCluster} (${report.summary.hopCoveragePct.somCluster}%)`,
    `- glyphRecord: ${report.summary.hopCoverage.glyphRecord} (${report.summary.hopCoveragePct.glyphRecord}%)`,
    `- qdrantHit: ${report.summary.hopCoverage.qdrantHit} (${report.summary.hopCoveragePct.qdrantHit}%)`,
    `- redisHotKey: ${report.summary.hopCoverage.redisHotKey} (${report.summary.hopCoveragePct.redisHotKey}%)`,
    `- neo4jNode: ${report.summary.hopCoverage.neo4jNode} (${report.summary.hopCoveragePct.neo4jNode}%)`,
    '',
    '## Higher-Hop Join Map',
    '',
    ...report.summary.higherHopJoinMap.map((surface) => [
      `- ${surface.name} (${surface.kind})`,
      `  - source: ${surface.source}`,
      `  - exists: ${surface.exists ? 'yes' : 'no'}`,
      `  - candidate keys: ${surface.candidateKeys.join(', ')}`,
      `  - canonical join key: ${surface.canonicalJoinKey}`,
      `  - sample keys found in source: ${surface.sampleKeysFound.join(', ') || 'none'}`,
      `  - why join stays at 0%: ${surface.whyZero}`,
    ].join('\n')),
    '',
    '## Higher-Hop Join Samples',
    '',
    `- routeRuntimePackets: ${report.summary.higherHopJoinSamples.routeRuntimePackets.length} sample shapes`,
    `- parentAtlasDocuments: ${report.summary.higherHopJoinSamples.parentAtlasDocuments.length} sample shapes`,
    `- qdrantPayload: ${report.summary.higherHopJoinSamples.qdrantPayload.length} sample shapes`,
    `- redisKeys: ${report.summary.higherHopJoinSamples.redisKeys.length} sample shapes`,
    `- neo4jNodes: ${report.summary.higherHopJoinSamples.neo4jNodes.length} sample shapes`,
    `- localJsonl: ${report.summary.higherHopJoinSamples.localJsonl.length} sample shapes`,
    '',
    '## Higher-Hop Candidate Discovery',
    '',
    `- scanned roots: ${report.summary.higherHopCandidateDiscovery.scannedRoots.join(', ')}`,
    `- scanned files: ${report.summary.higherHopCandidateDiscovery.scannedFiles}`,
    '',
    ...report.summary.higherHopCandidateDiscovery.hops.map((hop) => [
      `- ${hop.hop}`,
      `  - candidate evidence exists anywhere: ${hop.candidateEvidenceAnywhere ? 'yes' : 'no'}`,
      `  - candidate files found: ${hop.candidateFilesFound.join(', ') || 'none'}`,
      `  - candidate field names found: ${hop.candidateFieldNamesFound.join(', ') || 'none'}`,
      `  - sample values: ${hop.sampleValues.join(' | ') || 'none'}`,
      `  - probable join key: ${hop.probableJoinKey}`,
      `  - why current lineage join is 0%: ${hop.whyZero}`,
    ].join('\n')),
    '',
    '## Field Name Mismatch Discovery',
    '',
    `- qdrantHit`,
    `  - actual field names found: ${report.summary.fieldNameMismatchDiscovery.qdrantHit.actualFieldNamesFound.join(', ') || 'none'}`,
    `  - sample payload keys: ${report.summary.fieldNameMismatchDiscovery.qdrantHit.samplePayloadKeys.join(', ') || 'none'}`,
    `  - expected aliases missing: ${report.summary.fieldNameMismatchDiscovery.qdrantHit.expectedAliasesMissing.join(', ') || 'none'}`,
    `  - expected aliases present: ${report.summary.fieldNameMismatchDiscovery.qdrantHit.expectedAliasesPresent.join(', ') || 'none'}`,
    `  - recommended alias patch only: ${report.summary.fieldNameMismatchDiscovery.qdrantHit.recommendedAliasPatchOnly}`,
    `- neo4jNode`,
    `  - actual field names found: ${report.summary.fieldNameMismatchDiscovery.neo4jNode.actualFieldNamesFound.join(', ') || 'none'}`,
    `  - sample CodebaseFile property keys: ${report.summary.fieldNameMismatchDiscovery.neo4jNode.samplePropertyKeys.join(', ') || 'none'}`,
    `  - expected aliases missing: ${report.summary.fieldNameMismatchDiscovery.neo4jNode.expectedAliasesMissing.join(', ') || 'none'}`,
    `  - expected aliases present: ${report.summary.fieldNameMismatchDiscovery.neo4jNode.expectedAliasesPresent.join(', ') || 'none'}`,
    `  - recommended alias patch only: ${report.summary.fieldNameMismatchDiscovery.neo4jNode.recommendedAliasPatchOnly}`,
    '',
    '## Live Hop Sampling',
    '',
    ...Object.values(report.summary.liveHopProbes).map((probe) => [
      `- ${probe.hop}`,
      `  - source: ${probe.source}`,
      `  - env: ${probe.envName}`,
      `  - status: ${probe.status}`,
      `  - sampled count: ${probe.sampledCount}`,
      `  - detected join keys: ${probe.detectedJoinKeys.join(', ') || 'none'}`,
      `  - sample values: ${probe.sampleValues.join(' | ') || 'none'}`,
      `  - interpretation: ${probe.note}`,
    ].join('\n')),
    '',
    '## Lineage Score',
    '',
    `- average lineage score: ${report.summary.averageLineageScorePct}%`,
    `- max lineage score: ${report.summary.maxLineageScorePct}%`,
    `- rows missing higher-hop stages: ${report.summary.missingHigherHopRows}`,
    '',
    '## Feature Groups',
    '',
    ...report.summary.featureGroups.slice(0, 40).map((group) => [
      `- ${group.featureId}`,
      `  - row count: ${group.rowCount}`,
      `  - labels: ${group.labels.join(', ') || 'none'}`,
      `  - sourceRefs: ${group.sourceRefs.join(', ') || 'none'}`,
      `  - avg lineage score: ${group.avgLineageScorePct}%`,
    ].join('\n')),
    '',
    '## Sample Lineages',
    '',
    ...report.summary.sampleLineages.slice(0, 40).map((row) => [
      `- sourceRef: ${row.sourceRef ?? 'n/a'}`,
      `  - featureId: ${row.featureId ?? 'n/a'}`,
      `  - featureLabels: ${row.featureLabels.join(', ') || 'none'}`,
      `  - path: ${row.path ?? 'n/a'}`,
      `  - taskId: ${row.taskId ?? 'n/a'}`,
      `  - runId: ${row.runId ?? 'n/a'}`,
      `  - somCluster: ${row.somCluster ?? 'n/a'}`,
      `  - glyphRecord: ${row.glyphRecord ?? 'n/a'}`,
      `  - qdrantHit: ${row.qdrantHit ?? 'n/a'}`,
      `  - redisHotKey: ${row.redisHotKey ?? 'n/a'}`,
      `  - neo4jNode: ${row.neo4jNode ?? 'n/a'}`,
      `  - lineageScore: ${row.lineageScorePct}%`,
      `  - missingHigherHopStages: ${row.missingHigherHopStages.join(', ') || 'none'}`,
    ].join('\n')),
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Rows: ${report.summary.totalRows}`);
  console.log(`Average lineage score: ${report.summary.averageLineageScorePct}%`);
}

buildReport().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
