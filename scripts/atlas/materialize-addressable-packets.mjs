#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = process.env.APP_REPO_ROOT || 'C:/Users/james/Videos/deeds-web-app';
const POSTGRES_CONTAINER = process.env.PARENT_ATLAS_POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';

const OUTPUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson');
const OUTPUT_MANIFEST = path.join(REPO_ROOT, '.tmp', 'addressable-packets.manifest.json');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'packet-reader-writer-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'packet-reader-writer-audit.md');

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const LIMIT = parseIntFlag(argv, '--limit', 0);
const SAMPLE = parseIntFlag(argv, '--sample', 8);
const MAX_SOURCE_BYTES = parseIntFlag(argv, '--max-source-bytes', 12 * 1024 * 1024);

const TABLE_CANDIDATES = [
  'atlas_higher_hop_index',
  'atlas_codebase_packets',
  'atlas_feature_packets',
  'atlas_packets',
];

const EVIDENCE_FILES = [
  path.join(REPO_ROOT, '.tmp', 'runtime-evidence.chrom97.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'runtime-evidence.neschrom97.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'kanban_tasks.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'missing_feature_todos.jsonl'),
  path.join(REPO_ROOT, 'memory', 'packets', 'nes-chrom-packets.jsonl'),
  path.join(REPO_ROOT, 'neschrom97', 'packets', 'cards.ndjson'),
  path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-packet-reader-writer-report.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-cards-ldjson-materialization-report.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'packet-contract-mirrors-audit.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-postgres-mirror-reconciliation.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-payload-complete-backfill.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'route-runtime-packets-report.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'repo-function-registry.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'runtime-evidence-collector-report.json'),
  path.join(REPO_ROOT, 'docs', 'reports', 'runtime-packet-density-report.json'),
  path.join(REPO_ROOT, '.opencode', 'recommendations', 'recommendations.json'),
];

function parseIntFlag(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && idx < args.length - 1) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/^sveltekit-frontend\//i, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

function collapseWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function pct(part, total) {
  const numerator = Number(part ?? 0);
  const denominator = Number(total ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const normalized = stableJson(value[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value ?? null));
}

function parseTsvRows(text, columns) {
  return String(text ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const values = line.split('\t');
      const row = {};
      for (let i = 0; i < columns.length; i += 1) row[columns[i]] = values[i] ?? '';
      return row;
    });
}

function runPsql(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      `PGPASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 24 },
  );

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`psql failed: ${stderr || `exit ${result.status}`}`);
  }

  return String(result.stdout ?? '').trim();
}

function loadJsonFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadNdjsonFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return [];
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractObjectsFromJson(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object');
  if (typeof parsed !== 'object') return [];

  const results = [parsed];
  const arrayKeys = ['rows', 'items', 'packets', 'registry', 'results', 'details', 'samples', 'data', 'records', 'hits', 'events', 'entries'];
  for (const key of arrayKeys) {
    if (Array.isArray(parsed[key])) {
      results.push(...parsed[key].filter((item) => item && typeof item === 'object'));
    }
  }
  return results;
}

function extractSyntheticObjects(filePath, parsed) {
  const results = [];
  const name = path.basename(filePath).toLowerCase();
  if (name === 'repo-consolidation-feature-map.json') {
    for (const codePath of toArray(parsed?.production_ready_code_paths)) {
      const filePathValue = normalizeText(codePath);
      if (!filePathValue) continue;
      const base = path.basename(filePathValue);
      const stem = base.replace(/\.[^.]+$/, '');
      results.push({
        source_ref: filePathValue,
        file_path: filePathValue,
        feature_id: `repo.file.${normalizeKey(filePathValue).replace(/[^a-z0-9]+/g, '.')}`,
        feature_label: titleize(stem),
        title: stem,
        summary: `Production-ready repo file from the consolidation map: ${filePathValue}`,
        packet_kind: 'repo_file',
      });
    }
  }
  return results;
}

function collectCandidateFiles() {
  const files = new Set();

  for (const candidate of EVIDENCE_FILES) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) files.add(candidate);
      if (stat.isDirectory()) {
        for (const entry of walkDir(candidate)) files.add(entry);
      }
    } catch {
      // ignore missing candidates
    }
  }

  return [...files].sort((a, b) => a.localeCompare(b));
}

function walkDir(dirPath) {
  const EXCLUDES = new Set(['node_modules', '.git', '.svelte-kit', '.vite', 'dist', 'build', 'coverage']);
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDES.has(entry.name)) continue;
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(absPath));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!['.json', '.jsonl', '.ndjson'].includes(ext)) continue;
    try {
      const stat = fs.statSync(absPath);
      if (stat.size <= MAX_SOURCE_BYTES) results.push(absPath);
    } catch {
      // ignore
    }
  }
  return results;
}

function buildEvidenceIndex() {
  const index = new Map();
  const files = collectCandidateFiles();
  const stats = {
    filesSeen: files.length,
    filesLoaded: 0,
    filesSkippedTooLarge: 0,
    recordsIndexed: 0,
  };

  const pushKey = (key, record) => {
    const normalized = normalizeKey(key);
    if (!normalized) return;
    const current = index.get(normalized) ?? [];
    current.push(record);
    index.set(normalized, current);
  };

  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_SOURCE_BYTES) {
        stats.filesSkippedTooLarge += 1;
        continue;
      }
      let candidates = [];
      if (filePath.toLowerCase().endsWith('.ndjson') || filePath.toLowerCase().endsWith('.jsonl')) {
        candidates = loadNdjsonFile(filePath);
      } else {
        const parsed = loadJsonFile(filePath);
        candidates = [...extractObjectsFromJson(parsed), ...extractSyntheticObjects(filePath, parsed)];
      }

      if (candidates.length === 0) continue;
      stats.filesLoaded += 1;

      for (const candidate of candidates) {
        const record = {
          filePath,
          sourceRef: normalizeKey(candidate.source_ref ?? candidate.sourceRef ?? candidate.canonical_source_ref ?? candidate.canonicalSourceRef ?? candidate.file_path ?? candidate.filePath ?? candidate.path ?? ''),
          canonicalSourceRef: normalizeKey(candidate.canonical_source_ref ?? candidate.canonicalSourceRef ?? candidate.source_ref ?? candidate.sourceRef ?? candidate.file_path ?? candidate.filePath ?? candidate.path ?? ''),
          sourceRefKey: normalizeKey(candidate.source_ref_key ?? candidate.sourceRefKey ?? ''),
          packetKey: normalizeText(candidate.packet_key ?? candidate.packetKey ?? candidate.packet_id ?? candidate.packetId ?? candidate.id ?? ''),
          featureId: normalizeText(candidate.feature_id ?? candidate.featureId ?? candidate.feature ?? ''),
          featureLabel: normalizeText(candidate.feature_label ?? candidate.featureLabel ?? candidate.label ?? candidate.title ?? ''),
          qdrantPayloadKey: normalizeText(candidate.qdrant_payload_key ?? candidate.qdrantPayloadKey ?? ''),
          qdrantPointId: normalizeText(candidate.qdrant_point_id ?? candidate.qdrantPointId ?? candidate.point_id ?? candidate.pointId ?? ''),
          qdrantCollection: normalizeText(candidate.qdrant_collection ?? candidate.qdrantCollection ?? ''),
          packetKind: normalizeText(candidate.packet_kind ?? candidate.packetKind ?? candidate.identity_lane ?? candidate.identityLane ?? ''),
          summary: collapseWhitespace(candidate.summary ?? candidate.text ?? ''),
          title: collapseWhitespace(candidate.title ?? ''),
          concepts: toArray(candidate.concepts ?? candidate.concept_ids ?? candidate.selected_concepts ?? candidate.selectedConcepts),
          tags: toArray(candidate.tags ?? candidate.lane_ids ?? candidate.laneIds),
          embeddingRef: normalizeText(candidate.embedding_ref ?? candidate.embeddingRef ?? candidate.vector_ref ?? candidate.vectorRef ?? ''),
          embedding: Array.isArray(candidate.embedding) ? candidate.embedding : null,
          communityId: normalizeText(candidate.community_id ?? candidate.communityId ?? ''),
          communityConf: candidate.community_conf ?? candidate.communityConf ?? candidate.community_confidence ?? candidate.communityConfidence ?? null,
          sourceTable: normalizeText(candidate.source_table ?? candidate.sourceTable ?? ''),
        };

        for (const key of [
          record.packetKey,
          record.canonicalSourceRef,
          record.sourceRef,
          record.sourceRefKey,
          record.qdrantPayloadKey,
          record.qdrantPointId,
          record.featureId,
          record.featureLabel,
        ]) {
          pushKey(key, record);
        }

        stats.recordsIndexed += 1;
      }
    } catch {
      // ignore malformed or inaccessible supplemental evidence
    }
  }

  return { index, stats };
}

function firstEvidence(index, ...keys) {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (!normalized) continue;
    const records = index.get(normalized);
    if (Array.isArray(records) && records.length > 0) return records[0];
  }
  return null;
}

function extractArrayFromObject(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
  }
  return [];
}

function buildText(parts, fallback = '') {
  const text = parts.map((part) => collapseWhitespace(part)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 4000);
  return collapseWhitespace(fallback).slice(0, 4000);
}

function classifyPacketKind(row, evidence) {
  const lane = normalizeText(row.identity_lane || evidence?.packetKind || '').toLowerCase();
  const sourceRef = normalizeKey(row.source_ref || row.source_ref_key || row.file_path || evidence?.sourceRef || evidence?.canonicalSourceRef || '');
  const featureLabel = normalizeText(row.feature_label || evidence?.featureLabel || '').toLowerCase();

  if (lane.includes('mcp') || sourceRef.includes('#') || featureLabel.includes('mcp')) return 'mcp_tool_stub';
  if (lane.includes('schema') || sourceRef.includes('#chunk-') || sourceRef.startsWith('docs/reports/') || sourceRef.startsWith('reports/')) return 'schema_stub';
  if (row.qdrant_point_id || row.qdrant_collection || evidence?.qdrantPointId || evidence?.qdrantCollection) return 'qdrant_chunk';
  return lane || 'schema_stub';
}

function normalizePacketRow(row, evidence) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const canonicalSourceRef = normalizeSourceRef(
    row.canonical_source_ref || row.canonicalSourceRef || evidence?.canonicalSourceRef || row.source_ref || row.sourceRef || row.file_path || row.filePath || row.source_ref_key || '',
  );
  const sourceRef = normalizeSourceRef(
    row.source_ref || row.sourceRef || evidence?.sourceRef || row.file_path || row.filePath || row.source_ref_key || canonicalSourceRef || '',
  );
  const sourceRefKey = normalizeSourceRef(row.source_ref_key || row.sourceRefKey || evidence?.sourceRefKey || sourceRef);
  const packetKey = normalizeText(row.packet_key || row.packetKey || evidence?.packetKey || '');
  const featureId = normalizeText(row.feature_id || row.featureId || evidence?.featureId || '');
  const featureLabel = normalizeText(row.feature_label || row.featureLabel || evidence?.featureLabel || '');
  const qdrantPointId = normalizeText(row.qdrant_point_id || row.qdrantPointId || evidence?.qdrantPointId || '');
  const qdrantCollection = normalizeText(row.qdrant_collection || row.qdrantCollection || evidence?.qdrantCollection || '');
  const qdrantPayloadKey = normalizeText(row.qdrant_payload_key || row.qdrantPayloadKey || evidence?.qdrantPayloadKey || '');
  const qdrantVectorDim = row.qdrant_vector_dim ?? row.qdrantVectorDim ?? null;
  const contentHash = normalizeText(row.content_hash || row.contentHash || '');
  const chunkId = normalizeText(row.chunk_id || row.chunkId || '');
  const treeNodeId = normalizeText(row.tree_node_id || row.treeNodeId || '');
  const glyphRecordId = normalizeText(row.glyph_record_id || row.glyphRecordId || '');
  const neo4jNodeId = normalizeText(row.neo4j_node_id || row.neo4jNodeId || '');
  const identityLane = normalizeText(row.identity_lane || row.identityLane || evidence?.packetKind || '');
  const packetKind = classifyPacketKind(row, evidence);
  const communityId = row.community_id ?? row.communityId ?? metadata.community_id ?? metadata.communityId ?? null;
  const communityConf = row.community_confidence ?? row.communityConfidence ?? metadata.community_confidence ?? metadata.communityConfidence ?? null;
  const somCluster = row.som_cluster ?? row.somCluster ?? row.cluster_id ?? row.clusterId ?? metadata.som_cluster ?? metadata.somCluster ?? null;
  const tags = uniqueStrings([
    ...(Array.isArray(row.tags) ? row.tags : []),
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
    ...(Array.isArray(evidence?.tags) ? evidence.tags : []),
    featureLabel,
    identityLane,
    packetKind,
    qdrantCollection,
  ]);
  const laneIds = uniqueStrings([
    identityLane,
    packetKind,
    featureId,
    qdrantCollection,
    communityId === null || communityId === undefined ? '' : String(communityId),
    somCluster === null || somCluster === undefined ? '' : String(somCluster),
  ]);
  const concepts = uniqueStrings([
    ...extractArrayFromObject(row, ['concepts', 'concept_ids', 'selected_concepts']),
    ...extractArrayFromObject(metadata, ['concepts', 'concept_ids', 'selected_concepts']),
    ...extractArrayFromObject(evidence, ['concepts', 'concept_ids', 'selected_concepts']),
    ...extractArrayFromObject(row, ['tags']),
    ...extractArrayFromObject(metadata, ['tags']),
  ]);
  const bm25Text = buildText([
    row.bm25_text,
    row.summary,
    row.text,
    row.title,
    metadata.bm25_text,
    metadata.summary,
    metadata.text,
    metadata.title,
    metadata.description,
    featureLabel,
    canonicalSourceRef,
    sourceRef,
  ]);
  const embeddingCandidate = row.embedding ?? metadata.embedding ?? evidence?.embedding ?? null;
  const embedding = Array.isArray(embeddingCandidate) && embeddingCandidate.length > 0 && embeddingCandidate.length <= 8192
    ? embeddingCandidate
    : null;
  const embeddingRef = normalizeText(
    row.embedding_ref ||
    row.embeddingRef ||
    evidence?.embeddingRef ||
    (qdrantCollection && qdrantPointId ? `${qdrantCollection}:${qdrantPointId}` : '') ||
    qdrantPayloadKey,
  );
  const permissions = {
    visibility: row.permissions?.visibility || 'internal',
    can_write: row.permissions?.can_write || false,
    can_execute: row.permissions?.can_execute || false,
    can_export: row.permissions?.can_export || false,
    source: row.permissions?.source || 'repo_index',
  };

  const filePathVal = normalizeText(row.file_path || row.filePath || '');
  const dirPathVal = normalizeText(row.directory_path || row.directoryPath || (filePathVal ? path.dirname(filePathVal) : ''));
  const metadataEnv = {
    repo_root: 'deeds-web-app',
    app_root: 'sveltekit-frontend',
    file_path: filePathVal,
    directory_path: dirPathVal,
    route_path: row.route_path || row.routePath || undefined,
    component_name: row.component_name || row.componentName || undefined,
    package_name: row.package_name || row.packageName || undefined,
    runtime_surface: row.runtime_surface || row.runtimeSurface || undefined,
    cache_context: row.metadata?.cache_context || row.metadata?.cacheContext || {},
  };

  const topology = {
    community_id: communityId === '' ? undefined : communityId,
    neo4j_node_id: neo4jNodeId || undefined,
    pagerank: row.pagerank !== undefined && row.pagerank !== null ? Number(row.pagerank) : undefined,
    betweenness: row.betweenness !== undefined && row.betweenness !== null ? Number(row.betweenness) : undefined,
    eigenvector: row.eigenvector !== undefined && row.eigenvector !== null ? Number(row.eigenvector) : undefined,
    som_cluster: somCluster ? String(somCluster) : undefined,
    som_x: row.som_x !== undefined && row.som_x !== null ? Number(row.som_x) : (row.som_row !== undefined && row.som_row !== null ? Number(row.som_row) : undefined),
    som_y: row.som_y !== undefined && row.som_y !== null ? Number(row.som_y) : (row.som_col !== undefined && row.som_col !== null ? Number(row.som_col) : undefined),
    centroid_id: row.centroid_id || row.centroidId || undefined,
    ae_latent64: row.ae_latent64 || undefined,
    ae_distance: row.ae_distance !== undefined && row.ae_distance !== null ? Number(row.ae_distance) : undefined,
    topology_version: row.topology_version || undefined,
    topology_updated_at: row.topology_updated_at || undefined,
  };

  const vectors = {
    qdrant_point_id: qdrantPointId || undefined,
    qdrant_collection: qdrantCollection || undefined,
    qdrant_vectors: row.qdrant_vectors || undefined,
    vector_source: row.vector_source || undefined,
    embedding_384: row.embedding_384 || undefined,
    latent_64: row.latent_64 || undefined,
  };

  const enrichment = {
    concepts: concepts,
    langextract_terms: row.langextract_terms || [],
    top10_neighbors: row.top10_neighbors || [],
    summary_model: row.summary_model || undefined,
    fusion_sources: row.fusion_sources || [],
  };

  const addressable = Boolean(packetKey && canonicalSourceRef && featureId);
  const evidenceSources = uniqueStrings([evidence?.filePath, evidence?.sourceTable, row.source_table, row.sourceTable].filter(Boolean));

  return {
    source_table: normalizeText(row.source_table || row.sourceTable || evidence?.sourceTable || 'atlas_higher_hop_index'),
    packet_key: packetKey,
    packet_type: row.packet_type || row.packetType || packetKind || 'atlas',
    source_ref: sourceRef,
    canonical_source_ref: canonicalSourceRef,
    source_ref_key: sourceRefKey,
    file_path: filePathVal,
    feature_id: featureId,
    feature_label: featureLabel,
    identity_lane: identityLane || null,
    packet_kind: packetKind,
    ledger_type: packetKind === 'legacy_qdrant_only' ? 'legacy_qdrant_only' : (qdrantPointId || qdrantCollection ? 'atlas_feature_packets' : 'atlas_packets'),
    bm25_text: bm25Text,
    concepts,
    embedding,
    embedding_ref: embeddingRef || null,
    vector_ref: embeddingRef || null,
    qdrant_point_id: qdrantPointId || null,
    qdrant_collection: qdrantCollection || null,
    qdrant_payload_key: qdrantPayloadKey || null,
    qdrant_vector_dim: qdrantVectorDim === null || qdrantVectorDim === undefined || qdrantVectorDim === '' ? null : Number(qdrantVectorDim),
    lane_ids: laneIds,
    tags,
    community_id: communityId === '' ? null : communityId,
    community_conf: communityConf === '' ? null : communityConf,
    som_cluster: somCluster ?? null,
    content_hash: contentHash || null,
    chunk_id: chunkId || null,
    tree_node_id: treeNodeId || null,
    glyph_record_id: glyphRecordId || null,
    neo4j_node_id: neo4jNodeId || null,
    permissions,
    metadata: metadataEnv,
    topology,
    vectors,
    enrichment,
    evidence_sources: evidenceSources,
    addressable,
    source_evidence_hit: Boolean(evidence),
    materialized_at: new Date().toISOString(),
  };
}

function classCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.packet_kind, (counts.get(row.packet_kind) ?? 0) + 1);
  }
  return [
    'qdrant_chunk',
    'schema_stub',
    'mcp_tool_stub',
    'legacy_qdrant_only',
    'unknown',
  ].map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

function findTable() {
  for (const table of TABLE_CANDIDATES) {
    const rows = parseTsvRows(
      runPsql(`select case when to_regclass('public.${table}') is not null then 't' else 'f' end as exists;`),
      ['exists'],
    );
    if (rows[0]?.exists === 't') return table;
  }
  throw new Error(`No canonical packet table found. Tried: ${TABLE_CANDIDATES.join(', ')}`);
}

function loadRows(table, limit = 0) {
  const columns = parseTsvRows(
    runPsql(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = '${table}'
      order by ordinal_position
    `),
    ['column_name'],
  ).map((row) => row.column_name);

  const orderParts = [];
  for (const candidate of ['packet_key', 'source_ref', 'feature_id', 'qdrant_point_id', 'ctid']) {
    if (columns.includes(candidate)) orderParts.push(`${candidate} asc nulls last`);
  }
  if (orderParts.length === 0) orderParts.push('ctid asc');

  const sql = `
    select to_jsonb(t)::text as row_json
    from public.${table} t
    order by ${orderParts.join(', ')}
    ${limit > 0 ? `limit ${limit}` : ''}
  `;

  return parseTsvRows(runPsql(sql), ['row_json']).map((row) => {
    try {
      return JSON.parse(row.row_json);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function writeOutputs(rows, manifest) {
  fs.mkdirSync(path.dirname(OUTPUT_NDJSON), { recursive: true });
  fs.writeFileSync(OUTPUT_NDJSON, `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`, 'utf8');
  fs.writeFileSync(OUTPUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  const sourceTable = findTable();
  const evidence = buildEvidenceIndex();
  const ledgerRows = loadRows(sourceTable, LIMIT);
  const packets = ledgerRows.map((row) => {
    const matchedEvidence = firstEvidence(
      evidence.index,
      row.packet_key,
      row.canonical_source_ref,
      row.source_ref,
      row.source_ref_key,
      row.file_path,
      row.feature_id,
      row.qdrant_payload_key,
      row.qdrant_point_id,
    );
    return normalizePacketRow({ ...row, source_table: sourceTable }, matchedEvidence);
  });

  packets.sort((a, b) => String(a.packet_key || '').localeCompare(String(b.packet_key || '')) || String(a.qdrant_point_id || '').localeCompare(String(b.qdrant_point_id || '')));

  const summary = {
    sourceTable,
    tableRows: ledgerRows.length,
    materializedRows: packets.length,
    addressableRows: packets.filter((row) => row.addressable).length,
    qdrantBackedRows: packets.filter((row) => Boolean(row.qdrant_point_id)).length,
    qdrantCollectionRows: packets.filter((row) => Boolean(row.qdrant_collection)).length,
    conceptsRows: packets.filter((row) => Array.isArray(row.concepts) && row.concepts.length > 0).length,
    bm25Rows: packets.filter((row) => Boolean(row.bm25_text)).length,
    embeddingRefRows: packets.filter((row) => Boolean(row.embedding_ref)).length,
    evidenceMatchedRows: packets.filter((row) => row.source_evidence_hit).length,
    missingFeatureId: packets.filter((row) => !row.feature_id).length,
    missingCanonicalSourceRef: packets.filter((row) => !row.canonical_source_ref).length,
    missingQdrantPointId: packets.filter((row) => !row.qdrant_point_id).length,
    missingQdrantCollection: packets.filter((row) => !row.qdrant_collection).length,
    classCounts: classCounts(packets),
    evidenceFilesSeen: evidence.stats.filesSeen,
    evidenceFilesLoaded: evidence.stats.filesLoaded,
    evidenceFilesSkippedTooLarge: evidence.stats.filesSkippedTooLarge,
    evidenceRecordsIndexed: evidence.stats.recordsIndexed,
  };

  const manifest = {
    schema: 'addressable_packets_materialization_manifest.v1',
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    sourceTable,
    outputNdjson: path.relative(REPO_ROOT, OUTPUT_NDJSON).replace(/\\/g, '/'),
    outputManifest: path.relative(REPO_ROOT, OUTPUT_MANIFEST).replace(/\\/g, '/'),
    summary,
    samplePacketKeys: packets.slice(0, SAMPLE).map((row) => row.packet_key),
    outputSha256: sha256(packets.map((row) => stableStringify(row)).join('\n')),
  };

  if (APPLY_REQUESTED) writeOutputs(packets, manifest);

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  const report = {
    ...manifest,
    status: summary.addressableRows > 0 ? (APPLY_REQUESTED ? 'MATERIALIZED' : 'DRY_RUN_READY') : 'NO_ADDRESSABLE_PACKETS',
    nextSafeAction: summary.addressableRows > 0
      ? 'Run qdrant-tag-mirror next, then resume the retrieval pipeline after the materialized packet count is positive.'
      : 'Investigate why the ledger has no addressable packets before rerunning atlas:pipeline.',
    samples: packets.slice(0, SAMPLE).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      packet_kind: row.packet_kind,
      qdrant_collection: row.qdrant_collection,
      qdrant_point_id: row.qdrant_point_id,
      bm25_text: row.bm25_text.slice(0, 180),
      concepts: row.concepts.slice(0, 12),
      tags: row.tags.slice(0, 12),
    })),
  };

  await fsPromises.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Packet Reader / Writer Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Source table: ${summary.sourceTable}`,
    '',
    '## Summary',
    '',
    `- ledger rows: ${summary.tableRows}`,
    `- materialized rows: ${summary.materializedRows}`,
    `- addressable rows: ${summary.addressableRows}`,
    `- qdrant-backed rows: ${summary.qdrantBackedRows}`,
    `- qdrant collection rows: ${summary.qdrantCollectionRows}`,
    `- bm25 rows: ${summary.bm25Rows}`,
    `- concepts rows: ${summary.conceptsRows}`,
    `- embedding ref rows: ${summary.embeddingRefRows}`,
    `- evidence matches: ${summary.evidenceMatchedRows}`,
    `- missing feature_id: ${summary.missingFeatureId}`,
    `- missing canonical_source_ref: ${summary.missingCanonicalSourceRef}`,
    `- missing qdrant_point_id: ${summary.missingQdrantPointId}`,
    `- missing qdrant_collection: ${summary.missingQdrantCollection}`,
    '',
    '## Packet Kind Counts',
    '',
    ...summary.classCounts.map((item) => `- ${item.key}: ${item.count}`),
    '',
    '## Evidence Scan',
    '',
    `- files seen: ${summary.evidenceFilesSeen}`,
    `- files loaded: ${summary.evidenceFilesLoaded}`,
    `- files skipped too large: ${summary.evidenceFilesSkippedTooLarge}`,
    `- records indexed: ${summary.evidenceRecordsIndexed}`,
    '',
    '## Output',
    '',
    `- ndjson: ${report.outputNdjson}`,
    `- manifest: ${report.outputManifest}`,
    `- sha256: ${report.outputSha256}`,
    '',
    '## Samples',
    '',
    ...report.samples.map((row) => `- ${row.packet_key} | ${row.packet_kind} | ${row.feature_id || '(missing feature_id)'} | ${row.qdrant_collection || '(no qdrant collection)'}`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');

  await fsPromises.writeFile(REPORT_MD, md, 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  if (APPLY_REQUESTED) {
    console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_NDJSON)}`);
    console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_MANIFEST)}`);
  }
  console.log(JSON.stringify({
    status: report.status,
    sourceTable,
    addressableRows: summary.addressableRows,
    qdrantBackedRows: summary.qdrantBackedRows,
    evidenceMatchedRows: summary.evidenceMatchedRows,
    missingQdrantPointId: summary.missingQdrantPointId,
  }, null, 2));
}

main().catch((error) => {
  console.error('[materialize-addressable-packets] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});

