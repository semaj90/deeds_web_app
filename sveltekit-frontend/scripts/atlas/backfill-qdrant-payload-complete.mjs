#!/usr/bin/env node
/**
 * Backfill the canonical Phase D/E Qdrant payload contract.
 *
 * Canonical payload fields written on matched points:
 * - packet_key / packetKey
 * - source_ref / sourceRef / canonicalSourceRef / sourceRefs[]
 * - file_path / filePath / path
 * - feature_id / featureId / feature_ids[]
 * - feature_label / featureLabel
 * - community_id / communityId / community_confidence
 * - som_cluster / cluster_id / centroid_id
 * - qdrant_payload_version
 * - lineage_version
 * - ledger_type
 * - canonical
 * - payload_backfilled_at
 *
 * Matching order:
 * 1. source_ref
 * 2. file_path / path
 * 3. packet_key
 * Never feature_id alone.
 *
 * If a point cannot be matched to live Postgres:
 * - preserve the existing payload
 * - mark ledger_type = "legacy_qdrant_only"
 * - canonical = false
 * - payload_unmatched = true
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { qdrant } from '../lib/qdrant-client.mjs';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { normalizeSourceRef } from './canonical-source-ref.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const REPORT_JSON = path.join(DOCS_DIR, 'qdrant-payload-complete-backfill.json');
const REPORT_MD = path.join(DOCS_DIR, 'qdrant-payload-complete-backfill.md');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERIFY = argv.includes('--verify');
const DRY_RUN = !APPLY;
const rawLimit =
  getFlagValue(argv, '--limit') ??
  getFlagValue(argv, '--sample') ??
  argv.find((arg) => /^\d+$/.test(arg)) ??
  process.env.npm_config_limit ??
  process.env.npm_config_sample;
const LIMIT = parsePositiveInt(rawLimit);
const COLLECTION = String(process.env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_768').trim();
const NOW_ISO = new Date().toISOString();
const LINEAGE_VERSION = 'packet-identity-v1';
const QDRANT_PAYLOAD_VERSION = 'phase-d-e-v1';
const LEDGER_TYPE_FEATURE = 'atlas_feature_packets';
const LEDGER_TYPE_PACKETS = 'atlas_packets';
const LEDGER_TYPE_LEGACY = 'legacy_qdrant_only';
const WRITE_CONCURRENCY = Number.parseInt(process.env.QDRANT_PAYLOAD_WRITE_CONCURRENCY ?? '12', 10) || 12;

function getFlagValue(args, flag) {
  const index = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index < 0) return null;
  const current = args[index];
  if (current.includes('=')) {
    return current.split('=', 2)[1] ?? null;
  }
  return args[index + 1] ?? null;
}

function parsePositiveInt(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNullableText(value) {
  const text = asText(value);
  return text.length ? text : null;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter((item) => item.length > 0);
  }
  const text = asText(value);
  return text ? [text] : [];
}

function unique(values) {
  return [...new Set(values.map((value) => asText(value)).filter((value) => value.length > 0))];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return null;
}

function firstText(...values) {
  const value = firstDefined(...values);
  return value === null || value === undefined ? null : asText(value) || null;
}

function normalizeComparableRef(value) {
  const normalized = normalizeSourceRef(asText(value));
  return normalized ? normalized.toLowerCase().replace(/\/+/g, '/') : '';
}

function normalizeComparablePath(value) {
  const normalized = normalizeComparableRef(value);
  return normalized.replace(/\/+/g, '/');
}

function parseJsonMaybe(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function compactObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

const COARSE_FEATURE_ID_VALUES = new Set([
  'db',
  'routes',
  'ai',
  'api',
  'ui',
  'graph',
  'search',
  'retrieval',
  'packet',
]);

function isCoarseFeatureId(value) {
  const text = asText(value).toLowerCase();
  if (!text) return false;
  if (COARSE_FEATURE_ID_VALUES.has(text)) return true;
  return /^[a-z]{1,4}$/.test(text) && !/[./:_-]/.test(text);
}

function canonicalFeatureId(...values) {
  for (const value of values) {
    const text = asText(value);
    if (!text || isCoarseFeatureId(text)) continue;
    return text;
  }
  return null;
}

function inferDomainFromSourceRef(sourceRef) {
  const normalized = asText(sourceRef).replace(/\\/g, '/');
  if (!normalized) return null;
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return null;
  const preferred = parts.find((part) => !['src', 'lib', 'server', 'routes', 'app', 'packages'].includes(part.toLowerCase()));
  return asNullableText(preferred ?? parts[parts.length - 2] ?? parts[0]);
}

function redactPayload(payload) {
  return payload;
}

async function resolveTableColumns(pool, tableName) {
  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return new Set(rows.map((row) => row.column_name));
}

function buildSelectListForTable(tableName, columns) {
  const select = [];
  const add = (expression, alias) => {
    select.push(`${expression} as ${alias}`);
  };
  const addIf = (column, alias = column, fallback = `NULL::text as ${alias}`) => {
    if (columns.has(column)) {
      add(column, alias);
    } else {
      select.push(fallback);
    }
  };

  if (tableName === 'atlas_feature_packets') {
    addIf('packet_key');
    addIf('source_ref');
    addIf('feature_id');
    addIf('feature_label');
    addIf('packet_type');
    addIf('community_id');
    addIf('community_source');
    addIf('community_confidence');
    addIf('file_path');
    addIf('som_cluster');
    addIf('metadata', 'metadata', 'NULL::jsonb as metadata');
    addIf('lineage_version');
    addIf('ledger_type');
    addIf('updated_at');
    addIf('tree_node_id');
    return select;
  }

  addIf('packet_id');
  addIf('packet_key');
  addIf('artifact_id');
  addIf('source_ref');
  addIf('source_path');
  addIf('source_kind');
  addIf('feature_id');
  addIf('community_id');
  addIf('cluster_id');
  addIf('concept_ids', 'concept_ids', 'NULL::text[] as concept_ids');
  addIf('metadata', 'metadata', 'NULL::jsonb as metadata');
  addIf('payload', 'payload', 'NULL::jsonb as payload');
  addIf('summary');
  addIf('source_ref_key');
  addIf('community_source');
  addIf('community_confidence');
  addIf('updated_at');
  addIf('sha256');
  addIf('reward_prior');

  return select;
}

function deriveRowMeta(row, tableName) {
  const metadata = compactObject(parseJsonMaybe(row.metadata, {}));
  const payload = compactObject(parseJsonMaybe(row.payload, {}));
  const packetKey = firstText(row.packet_key, row.packet_id, payload.packet_key, payload.packetKey);
  const sourceRef = firstText(
    row.source_ref,
    payload.source_ref,
    payload.sourceRef,
    payload.canonicalSourceRef,
    row.source_path,
    payload.file_path,
    payload.filePath,
    payload.path,
    metadata.source_ref,
    metadata.sourceRef,
    metadata.canonicalSourceRef,
  );
  const filePath = firstText(
    row.file_path,
    row.source_path,
    payload.file_path,
    payload.filePath,
    payload.relative_path,
    payload.path,
    metadata.file_path,
    metadata.filePath,
    metadata.path,
  );
  const featureId = firstText(
    row.feature_id,
    payload.feature_id,
    payload.featureId,
    metadata.feature_id,
    metadata.featureId,
  );
  const featureLabel = firstText(
    row.feature_label,
    payload.feature_label,
    payload.featureLabel,
    metadata.feature_label,
    metadata.featureLabel,
    row.summary,
  );
  const communityId = firstDefined(row.community_id, payload.community_id, payload.communityId, metadata.community_id, metadata.communityId);
  const communityConfidence = firstDefined(
    row.community_confidence,
    payload.community_confidence,
    payload.communityConfidence,
    metadata.community_confidence,
    metadata.communityConfidence,
  );
  const somCluster = firstDefined(row.som_cluster, payload.som_cluster, payload.somCluster, payload.gpuCluster, metadata.som_cluster, metadata.somCluster);
  const clusterId = firstDefined(row.cluster_id, payload.cluster_id, payload.clusterId, metadata.cluster_id, metadata.clusterId);
  const centroidId = firstDefined(row.centroid_id, payload.centroid_id, payload.centroidId, metadata.centroid_id, metadata.centroidId);
  const qdrantTagId = firstDefined(row.qdrant_tag_id, payload.qdrant_tag_id, payload.qdrantTagId, metadata.qdrant_tag_id, metadata.qdrantTagId);
  const sourceRefKey = firstText(row.source_ref_key, payload.source_ref_key, payload.sourceRefKey, metadata.source_ref_key, metadata.sourceRefKey);
  const domain = firstText(
    row.domain_class,
    payload.domain_class,
    payload.domainClass,
    metadata.domain_class,
    metadata.domainClass,
    row.domain,
    payload.domain,
    metadata.domain,
    inferDomainFromSourceRef(sourceRef),
  );
  const pathLabel = firstText(
    row.path_label,
    payload.path_label,
    payload.pathLabel,
    metadata.path_label,
    metadata.pathLabel,
    row.domain,
    payload.domain,
    payload.domain_class,
    payload.domainClass,
    metadata.domain,
    metadata.domain_class,
    metadata.domainClass,
  );
  const packetType = firstText(row.packet_type, payload.packet_type, payload.packetType, metadata.packet_type);

  return {
    ledger_type: tableName,
    packet_key: packetKey,
    source_ref: sourceRef,
    file_path: filePath,
    feature_id: featureId,
    feature_label: featureLabel,
    community_id: communityId,
    community_confidence: communityConfidence,
    som_cluster: somCluster,
    cluster_id: clusterId,
    centroid_id: centroidId,
    qdrant_tag_id: qdrantTagId,
    source_ref_key: sourceRefKey,
    domain,
    domain_class: domain,
    path_label: pathLabel,
    packet_type: packetType,
    metadata,
    payload,
    updated_at: row.updated_at ?? null,
  };
}

function buildRowIndexes(rows) {
  const byPacketKey = new Map();
  const bySourceRef = new Map();
  const byFilePath = new Map();

  for (const row of rows) {
    const packetKeys = unique([row.packet_key]);
    const sourceRefs = unique([
      normalizeComparableRef(row.source_ref),
      normalizeComparableRef(row.source_ref_key),
      normalizeComparableRef(row.source_path),
    ]);
    const filePaths = unique([
      normalizeComparablePath(row.file_path),
      normalizeComparablePath(row.source_path),
    ]);

    for (const key of packetKeys) {
      const list = byPacketKey.get(key) ?? [];
      list.push(row);
      byPacketKey.set(key, list);
    }
    for (const key of sourceRefs) {
      const list = bySourceRef.get(key) ?? [];
      list.push(row);
      bySourceRef.set(key, list);
    }
    for (const key of filePaths) {
      const list = byFilePath.get(key) ?? [];
      list.push(row);
      byFilePath.set(key, list);
    }
  }

  return { byPacketKey, bySourceRef, byFilePath };
}

function rowSortScore(row) {
  const ledgerRank = row.ledger_type === LEDGER_TYPE_FEATURE ? 2 : row.ledger_type === LEDGER_TYPE_PACKETS ? 1 : 0;
  const updated = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  return { ledgerRank, updated };
}

function compareRows(left, right) {
  const leftRank = rowSortScore(left);
  const rightRank = rowSortScore(right);
  if (leftRank.ledgerRank !== rightRank.ledgerRank) return rightRank.ledgerRank - leftRank.ledgerRank;
  if (leftRank.updated !== rightRank.updated) return rightRank.updated - leftRank.updated;
  return asText(right.packet_key).localeCompare(asText(left.packet_key));
}

function scoreRowAgainstPoint(row, pointId, payload) {
  const pointPacketKey = firstText(payload.packet_key, payload.packetKey, pointId);
  const pointSourceRef = normalizeComparableRef(payload.source_ref ?? payload.sourceRef ?? payload.canonicalSourceRef);
  const pointFilePath = normalizeComparablePath(payload.file_path ?? payload.filePath ?? payload.relative_path ?? payload.path);

  const rowPacketKey = normalizeComparableRef(row.packet_key);
  const rowSourceRef = normalizeComparableRef(row.source_ref ?? row.source_ref_key);
  const rowFilePath = normalizeComparablePath(row.file_path ?? row.source_path);

  let score = 0;
  let reason = 'unmatched';

  if (pointPacketKey && rowPacketKey && pointPacketKey === rowPacketKey) {
    score += 1000;
    reason = 'packet_key';
  }

  if (pointSourceRef && rowSourceRef && pointSourceRef === rowSourceRef) {
    score += 600;
    if (reason === 'unmatched') reason = 'source_ref';
  }

  if (pointFilePath && rowFilePath && pointFilePath === rowFilePath) {
    score += 400;
    if (reason === 'unmatched') reason = 'file_path';
  }

  const rank = rowSortScore(row);
  score += rank.ledgerRank * 25;
  if (rank.updated > 0) score += Math.min(25, Math.floor(rank.updated / 1_000_000_000_000));

  return { score, reason };
}

function mergeUniqueArrays(...arrays) {
  return unique(arrays.flatMap((value) => asArray(value)));
}

function buildCanonicalPayload(row, point, nowIso) {
  const payload = compactObject(parseJsonMaybe(point?.payload, {}));
  const metadata = compactObject(parseJsonMaybe(payload.metadata, {}));
  const rowMetadata = compactObject(row.metadata);
  const packetKey = firstText(row.packet_key, payload.packet_key, payload.packetKey, point?.id);
  const sourceRef = firstText(row.source_ref, payload.source_ref, payload.sourceRef, payload.canonicalSourceRef, row.source_ref_key);
  const filePath = firstText(row.file_path, payload.file_path, payload.filePath, payload.relative_path, payload.path, row.source_path);
  const featureId = canonicalFeatureId(
    row.feature_id,
    payload.feature_id,
    payload.featureId,
    rowMetadata.feature_id,
    rowMetadata.featureId,
  );
  const featureLabel = firstText(row.feature_label, payload.feature_label, payload.featureLabel);
  const communityId = firstDefined(row.community_id, payload.community_id, payload.communityId);
  const communityConfidence = firstDefined(row.community_confidence, payload.community_confidence, payload.communityConfidence);
  const somCluster = firstDefined(row.som_cluster, payload.som_cluster, payload.somCluster, payload.gpuCluster);
  const clusterId = firstDefined(row.cluster_id, payload.cluster_id, payload.clusterId);
  const centroidId = firstDefined(row.centroid_id, payload.centroid_id, payload.centroidId);
  const qdrantPointId = asText(point?.id);
  const qdrantTagId = firstDefined(row.qdrant_tag_id, payload.qdrant_tag_id, payload.qdrantTagId);
  const domain = firstText(
    row.domain_class,
    payload.domain_class,
    payload.domainClass,
    row.domain,
    payload.domain,
    rowMetadata.domain_class,
    rowMetadata.domainClass,
    inferDomainFromSourceRef(sourceRef),
  );
  const pathLabel = firstText(
    row.path_label,
    payload.path_label,
    payload.pathLabel,
    rowMetadata.path_label,
    rowMetadata.pathLabel,
    row.domain,
    payload.domain,
    payload.domain_class,
    payload.domainClass,
  );
  const packetType = firstText(row.packet_type, payload.packet_type, payload.packetType);
  const sourceRefKey = firstText(row.source_ref_key, payload.source_ref_key, payload.sourceRefKey);
  const legacyAliases = mergeUniqueArrays(
    Object.keys(payload).filter((key) => /[A-Z]/.test(key)),
    Object.keys(payload).filter((key) => key.includes('_')),
    payload.sourceRef ? ['sourceRef'] : [],
    payload.canonicalSourceRef ? ['canonicalSourceRef'] : [],
    payload.filePath ? ['filePath'] : [],
    payload.path ? ['path'] : [],
    payload.featureId ? ['featureId'] : [],
    payload.featureLabel ? ['featureLabel'] : [],
    payload.communityId ? ['communityId'] : [],
    payload.communityConfidence ? ['communityConfidence'] : [],
    payload.clusterId ? ['clusterId'] : [],
    payload.somCluster ? ['somCluster'] : [],
    payload.centroidId ? ['centroidId'] : [],
    payload.qdrantTagId ? ['qdrantTagId'] : [],
    payload.redisHotKey ? ['redisHotKey'] : [],
    payload.neo4jNodeId ? ['neo4jNodeId'] : [],
    payload.pathLabel ? ['pathLabel'] : [],
  );

  const sourceRefs = mergeUniqueArrays(
    sourceRef,
    payload.source_ref,
    payload.sourceRef,
    payload.canonicalSourceRef,
    payload.sourceRefs,
    row.source_ref,
    row.source_path,
    row.source_ref_key,
  );

  const payloadFeatureId = canonicalFeatureId(payload.feature_id, payload.featureId);
  const featureIds = mergeUniqueArrays(
    featureId,
    payloadFeatureId,
    payload.feature_ids,
    payload.featureIds,
  );

  const mergedMetadata = {
    ...metadata,
    ...rowMetadata,
    packet_identity_source: 'qdrant-payload-complete-backfill',
    qdrant_payload_version: QDRANT_PAYLOAD_VERSION,
    payload_backfilled_at: nowIso,
    source_ref: sourceRef,
    source_ref_key: sourceRefKey,
    file_path: filePath,
    feature_id: featureId,
    feature_label: featureLabel,
    community_id: communityId,
    community_confidence: communityConfidence,
    som_cluster: somCluster,
    cluster_id: clusterId,
    centroid_id: centroidId,
    domain,
    packet_type: packetType,
    legacy_aliases: legacyAliases,
  };

  return {
    packet_key: packetKey,
    packetKey,
    source_ref: sourceRef,
    sourceRef: sourceRef,
    canonicalSourceRef: sourceRef,
    sourceRefs,
    file_path: filePath,
    filePath: filePath,
    path: filePath,
    feature_id: featureId,
    featureId: featureId,
    feature_ids: featureIds,
    feature_label: featureLabel,
    featureLabel: featureLabel,
    community_id: communityId,
    communityId: communityId,
    community_confidence: communityConfidence,
    communityConfidence: communityConfidence,
    som_cluster: somCluster,
    cluster_id: clusterId,
    centroid_id: centroidId,
    qdrant_tag_id: qdrantTagId,
    qdrantTagId,
    qdrant_point_id: qdrantPointId,
    qdrantPointId: qdrantPointId,
    qdrant_payload_version: QDRANT_PAYLOAD_VERSION,
    lineage_version: LINEAGE_VERSION,
    ledger_type: row.ledger_type,
    canonical: true,
    payload_unmatched: false,
    payload_backfilled_at: nowIso,
    domain,
    domain_class: domain,
    path_label: pathLabel,
    packet_type: packetType,
    metadata: mergedMetadata,
    updated_at: nowIso,
  };
}

function buildLegacyPayload(point, nowIso) {
  const payload = compactObject(parseJsonMaybe(point?.payload, {}));
  const metadata = compactObject(parseJsonMaybe(payload.metadata, {}));
  return {
    ...payload,
    metadata: {
      ...metadata,
      packet_identity_source: 'qdrant-payload-complete-backfill',
      qdrant_payload_version: QDRANT_PAYLOAD_VERSION,
      payload_backfilled_at: nowIso,
    },
    qdrant_payload_version: QDRANT_PAYLOAD_VERSION,
    lineage_version: LINEAGE_VERSION,
    ledger_type: LEDGER_TYPE_LEGACY,
    canonical: false,
    payload_unmatched: true,
    payload_backfilled_at: nowIso,
  };
}

function summarizeCanonicalCoverage(rows) {
  const fields = ['packet_key', 'source_ref', 'feature_id'];
  const totals = Object.fromEntries(fields.map((field) => [field, { matched: 0, total: 0 }]));

  for (const row of rows) {
    for (const field of fields) {
      if (row[field] !== null && row[field] !== undefined && asText(row[field]).length > 0) {
        totals[field].total += 1;
        totals[field].matched += 1;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([field, stats]) => [
      field,
      {
        matched: stats.matched,
        total: stats.total,
        pct: stats.total > 0 ? Number(((stats.matched / stats.total) * 100).toFixed(2)) : 0,
      },
    ]),
  );
}

async function resolveTableRows(pool, tableName) {
  const columns = await resolveTableColumns(pool, tableName);
  if (columns.size === 0) return [];

  const selectList = buildSelectListForTable(tableName, columns);
  if (selectList.length === 0) return [];

  const orderColumn = columns.has('updated_at') ? 'updated_at' : 'packet_key';

  const { rows } = await pool.query(
    `
      SELECT ${selectList.join(', ')}
      FROM ${tableName}
      ORDER BY ${orderColumn} DESC NULLS LAST, packet_key ASC NULLS LAST
    `,
  );

  return rows.map((row) => ({
    ...row,
    ledger_type: tableName,
    packet_key: firstText(row.packet_key, row.packet_id),
    source_ref: firstText(row.source_ref, row.source_ref_key, row.source_path),
    file_path: firstText(row.file_path, row.source_path),
    feature_id: firstText(row.feature_id),
    feature_label: firstText(row.feature_label, parseJsonMaybe(row.metadata, {})?.feature_label, parseJsonMaybe(row.payload, {})?.feature_label),
    community_id: firstDefined(row.community_id),
    community_confidence: firstDefined(row.community_confidence),
    som_cluster: firstDefined(row.som_cluster, parseJsonMaybe(row.metadata, {})?.som_cluster),
    cluster_id: firstDefined(row.cluster_id, parseJsonMaybe(row.metadata, {})?.cluster_id),
    centroid_id: firstDefined(row.centroid_id, parseJsonMaybe(row.metadata, {})?.centroid_id),
    qdrant_tag_id: firstDefined(row.qdrant_tag_id, parseJsonMaybe(row.metadata, {})?.qdrant_tag_id),
    source_ref_key: firstText(row.source_ref_key),
    domain: firstText(row.domain, parseJsonMaybe(row.metadata, {})?.domain, parseJsonMaybe(row.payload, {})?.domain),
    packet_type: firstText(row.packet_type),
    metadata: compactObject(parseJsonMaybe(row.metadata, {})),
    payload: compactObject(parseJsonMaybe(row.payload, {})),
    updated_at: row.updated_at ?? null,
  }));
}

async function loadLedgerRows(pool) {
  const tableChecks = await Promise.all(
    ['atlas_codebase_packets', 'atlas_feature_packets', 'atlas_packets', 'task_semantic_packets', 'parent_atlas_documents'].map(async (tableName) => {
      const exists = await pool.query(
        `
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = $1
          LIMIT 1
        `,
        [tableName],
      );
      return { tableName, exists: exists.rowCount > 0 };
    }),
  );

  const availableTables = tableChecks.filter((item) => item.exists).map((item) => item.tableName);
  if (availableTables.length === 0) {
    throw new Error('No canonical packet table found (expected atlas_codebase_packets, atlas_feature_packets, atlas_packets, task_semantic_packets, or parent_atlas_documents)');
  }

  const rows = [];
  for (const tableName of availableTables) {
    const tableRows = await resolveTableRows(pool, tableName);
    rows.push(...tableRows);
  }

  return {
    availableTables,
    rows,
  };
}

async function scanQdrantPoints(maxPoints = null) {
  const indexed = {
    total: 0,
    byPacketKey: new Map(),
    bySourceRef: new Map(),
    byFilePath: new Map(),
  };

  for await (const batch of qdrant.scroll(COLLECTION, { limit: 256, withPayload: true, withVector: false })) {
    for (const point of batch) {
      indexed.total += 1;
      const payload = compactObject(parseJsonMaybe(point.payload, {}));
      const pointId = asText(point.id);

      const packetKeys = unique([pointId, payload.packet_key, payload.packetKey]);
      const sourceRefs = unique([
        normalizeComparableRef(payload.source_ref),
        normalizeComparableRef(payload.sourceRef),
        normalizeComparableRef(payload.canonicalSourceRef),
      ]);
      const filePaths = unique([
        normalizeComparablePath(payload.file_path),
        normalizeComparablePath(payload.filePath),
        normalizeComparablePath(payload.relative_path),
        normalizeComparablePath(payload.path),
      ]);

      for (const key of packetKeys) {
        const list = indexed.byPacketKey.get(key) ?? [];
        list.push(point);
        indexed.byPacketKey.set(key, list);
      }
      for (const key of sourceRefs) {
        const list = indexed.bySourceRef.get(key) ?? [];
        list.push(point);
        indexed.bySourceRef.set(key, list);
      }
      for (const key of filePaths) {
        const list = indexed.byFilePath.get(key) ?? [];
        list.push(point);
        indexed.byFilePath.set(key, list);
      }

      if (maxPoints !== null && indexed.total >= maxPoints) {
        return indexed;
      }
    }
  }

  return indexed;
}

function collectCandidates(rowIndexes, point) {
  const payload = compactObject(parseJsonMaybe(point?.payload, {}));
  const pointId = asText(point?.id);
  const keys = new Set();

  for (const key of [pointId, payload.packet_key, payload.packetKey]) {
    const normalized = asText(key);
    if (normalized) keys.add(normalized);
  }

  for (const key of [
    normalizeComparableRef(payload.source_ref),
    normalizeComparableRef(payload.sourceRef),
    normalizeComparableRef(payload.canonicalSourceRef),
  ]) {
    if (key) keys.add(key);
  }

  for (const key of [
    normalizeComparablePath(payload.file_path),
    normalizeComparablePath(payload.filePath),
    normalizeComparablePath(payload.relative_path),
    normalizeComparablePath(payload.path),
  ]) {
    if (key) keys.add(key);
  }

  const candidates = new Map();
  const ingest = (rows = []) => {
    for (const row of rows) {
      const rowKey = `${row.ledger_type}:${asText(row.packet_key)}`;
      if (!candidates.has(rowKey)) {
        candidates.set(rowKey, row);
      }
    }
  };

  for (const key of keys) {
    ingest(rowIndexes.byPacketKey.get(key));
    ingest(rowIndexes.bySourceRef.get(key));
    ingest(rowIndexes.byFilePath.get(key));
  }

  return [...candidates.values()];
}

function chooseBestLedgerRow(point, rowIndexes) {
  const payload = compactObject(parseJsonMaybe(point?.payload, {}));
  const candidates = collectCandidates(rowIndexes, point);
  if (candidates.length === 0) {
    return { row: null, reason: 'unmatched', ambiguous: false };
  }

  const ranked = candidates
    .map((row) => ({
      row,
      ...scoreRowAgainstPoint(row, point?.id, payload),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return compareRows(left.row, right.row);
    });

  if (ranked.length === 0) {
    return { row: null, reason: 'unmatched', ambiguous: false };
  }

  const best = ranked[0];
  const bestMatches = ranked.filter((item) => item.score === best.score);
  if (bestMatches.length > 1) {
    return {
      row: null,
      reason: `ambiguous:${best.reason}`,
      ambiguous: true,
    };
  }

  return {
    row: best.row,
    reason: best.reason,
    ambiguous: false,
  };
}

async function updatePointPayload(pointId, payload) {
  return qdrant.post(`/collections/${COLLECTION}/points/payload?wait=true`, {
    points: [pointId],
    payload,
  });
}

async function flushPendingWrites(pendingWrites) {
  if (pendingWrites.length === 0) return;
  const batch = pendingWrites.splice(0, pendingWrites.length);
  await Promise.allSettled(batch);
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const env = loadRepoEnv(process.env);
  const databaseUrl = resolveDatabaseUrl(env);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  const startedAt = new Date().toISOString();
  const report = {
    generatedAt: startedAt,
    mode: APPLY ? 'apply' : VERIFY ? 'verify' : 'dry-run',
    collection: COLLECTION,
    databaseUrl: redactUrl(databaseUrl),
    availableLedgers: [],
    limits: {
      requested: LIMIT,
    },
    postgres: {
      rowsScanned: 0,
      rowsMatched: 0,
      rowsUpdated: 0,
      rowsAlreadyCanonical: 0,
      rowsSkipped: 0,
      rowsAmbiguous: 0,
      rowsUnmatched: 0,
      rowsMissingPacketKey: 0,
      rowsMissingSourceRef: 0,
      rowsMissingFilePath: 0,
      rowsFromFeaturePackets: 0,
      rowsFromAtlasPackets: 0,
    },
    qdrant: {
      pointsScanned: 0,
      pointsMatched: 0,
      pointsUpdated: 0,
      pointsAlreadyCanonical: 0,
      pointsLegacyOnly: 0,
      pointsAmbiguous: 0,
      pointsUnmatched: 0,
    },
    canonicalCoverage: {
      packet_key: { matched: 0, total: 0, pct: 0 },
      source_ref: { matched: 0, total: 0, pct: 0 },
      feature_id: { matched: 0, total: 0, pct: 0 },
    },
    ledgerCounts: {
      atlas_codebase_packets: 0,
      atlas_feature_packets: 0,
      atlas_packets: 0,
      task_semantic_packets: 0,
      parent_atlas_documents: 0,
      legacy_qdrant_only: 0,
    },
    samples: [],
    updates: [],
  };

  try {
    const { availableTables, rows } = await loadLedgerRows(pool);
    report.availableLedgers = availableTables;
    report.postgres.rowsScanned = rows.length;
    report.postgres.rowsFromCodebasePackets = rows.filter((row) => row.ledger_type === 'atlas_codebase_packets').length;
    report.postgres.rowsFromFeaturePackets = rows.filter((row) => row.ledger_type === LEDGER_TYPE_FEATURE).length;
    report.postgres.rowsFromAtlasPackets = rows.filter((row) => row.ledger_type === LEDGER_TYPE_PACKETS).length;
    report.postgres.rowsFromTaskSemanticPackets = rows.filter((row) => row.ledger_type === 'task_semantic_packets').length;
    report.postgres.rowsFromParentAtlasDocuments = rows.filter((row) => row.ledger_type === 'parent_atlas_documents').length;

    const rowIndexes = buildRowIndexes(rows);

    const matchedCanonicalRows = [];
    const pendingWrites = [];
    const enqueueWrite = async (task) => {
      pendingWrites.push(task);
      if (pendingWrites.length >= WRITE_CONCURRENCY) {
        await flushPendingWrites(pendingWrites);
      }
    };

    let processed = 0;
    for await (const batch of qdrant.scroll(COLLECTION, { limit: 256, withPayload: true, withVector: false })) {
      for (const point of batch) {
        if (LIMIT !== null && processed >= LIMIT) {
          break;
        }
        processed += 1;
        report.qdrant.pointsScanned += 1;

        const payload = compactObject(parseJsonMaybe(point.payload, {}));
        const selection = chooseBestLedgerRow(point, rowIndexes);

        if (selection.ambiguous) {
          report.qdrant.pointsAmbiguous += 1;
          report.postgres.rowsAmbiguous += 1;
          report.postgres.rowsSkipped += 1;
          if (report.samples.length < 25) {
            report.samples.push({
              qdrant_point_id: asText(point.id),
              status: 'ambiguous',
              reason: selection.reason,
            });
          }
          continue;
        }

        if (!selection.row) {
          report.qdrant.pointsLegacyOnly += 1;
          report.qdrant.pointsUnmatched += 1;
          report.postgres.rowsUnmatched += 1;
          report.postgres.rowsSkipped += 1;
          report.ledgerCounts[LEDGER_TYPE_LEGACY] += 1;

          const legacyPayload = buildLegacyPayload(point, NOW_ISO);
          const shouldUpdateLegacy = JSON.stringify(redactPayload(payload)) !== JSON.stringify(redactPayload(legacyPayload));
          if (shouldUpdateLegacy && !DRY_RUN) {
            await enqueueWrite(
              updatePointPayload(point.id, legacyPayload)
                .then((response) => {
                  if (response?.status === 'ok' || response?.result?.status === 'acknowledged') {
                    report.qdrant.pointsUpdated += 1;
                    report.postgres.rowsUpdated += 1;
                  } else {
                    report.postgres.rowsSkipped += 1;
                  }
                })
                .catch(() => {
                  report.postgres.rowsSkipped += 1;
                }),
            );
          } else if (shouldUpdateLegacy && DRY_RUN) {
            report.postgres.rowsUpdated += 1;
          }

          if (report.samples.length < 25) {
            report.samples.push({
              qdrant_point_id: asText(point.id),
              status: DRY_RUN ? 'legacy-would-update' : 'legacy-updated-or-kept',
              reason: 'legacy_qdrant_only',
            });
          }
          continue;
        }

        const row = selection.row;
        const canonicalPayload = buildCanonicalPayload(row, point, NOW_ISO);
        const existingPayload = compactObject(parseJsonMaybe(point.payload, {}));
        const mergedPayload = {
          ...existingPayload,
          ...canonicalPayload,
          metadata: {
            ...compactObject(parseJsonMaybe(existingPayload.metadata, {})),
            ...compactObject(canonicalPayload.metadata),
          },
        };

        report.qdrant.pointsMatched += 1;
        report.postgres.rowsMatched += 1;
        report.ledgerCounts[row.ledger_type] += 1;
        matchedCanonicalRows.push(canonicalPayload);

        const fieldChecks = {
          packet_key: asText(canonicalPayload.packet_key).length > 0,
          source_ref: asText(canonicalPayload.source_ref).length > 0,
          feature_id: asText(canonicalPayload.feature_id).length > 0,
        };

        for (const field of Object.keys(report.canonicalCoverage)) {
          report.canonicalCoverage[field].total += 1;
          if (fieldChecks[field]) {
            report.canonicalCoverage[field].matched += 1;
          }
        }

        const alreadyCanonical =
          asText(existingPayload.packet_key ?? existingPayload.packetKey) === asText(canonicalPayload.packet_key) &&
          normalizeComparableRef(existingPayload.source_ref ?? existingPayload.sourceRef ?? existingPayload.canonicalSourceRef) === normalizeComparableRef(canonicalPayload.source_ref) &&
          asText(existingPayload.feature_id ?? existingPayload.featureId) === asText(canonicalPayload.feature_id) &&
          asText(existingPayload.ledger_type) === asText(canonicalPayload.ledger_type) &&
          asText(existingPayload.lineage_version) === LINEAGE_VERSION &&
          asText(existingPayload.qdrant_payload_version) === QDRANT_PAYLOAD_VERSION &&
          asText(existingPayload.canonical) === 'true';

        if (alreadyCanonical) {
          report.qdrant.pointsAlreadyCanonical += 1;
          report.postgres.rowsAlreadyCanonical += 1;
          if (report.samples.length < 25) {
            report.samples.push({
              qdrant_point_id: asText(point.id),
              packet_key: canonicalPayload.packet_key,
              status: 'already-canonical',
              reason: selection.reason,
            });
          }
          continue;
        }

        if (DRY_RUN) {
          report.postgres.rowsUpdated += 1;
          if (report.samples.length < 25) {
            report.samples.push({
              qdrant_point_id: asText(point.id),
              packet_key: canonicalPayload.packet_key,
              status: 'would-update',
              reason: selection.reason,
            });
          }
          report.updates.push({
            qdrant_point_id: asText(point.id),
            packet_key: canonicalPayload.packet_key,
            source_ref: canonicalPayload.source_ref,
            file_path: canonicalPayload.file_path,
            feature_id: canonicalPayload.feature_id,
            feature_label: canonicalPayload.feature_label,
            ledger_type: canonicalPayload.ledger_type,
          });
          continue;
        }

        await enqueueWrite(
          updatePointPayload(point.id, mergedPayload)
            .then((response) => {
              const applied = response?.status === 'ok' || response?.result?.status === 'acknowledged';
              if (applied) {
                report.postgres.rowsUpdated += 1;
                report.qdrant.pointsUpdated += 1;
                if (report.samples.length < 25) {
                  report.samples.push({
                    qdrant_point_id: asText(point.id),
                    packet_key: canonicalPayload.packet_key,
                    status: 'updated',
                    reason: selection.reason,
                  });
                }
                report.updates.push({
                  qdrant_point_id: asText(point.id),
                  packet_key: canonicalPayload.packet_key,
                  source_ref: canonicalPayload.source_ref,
                  file_path: canonicalPayload.file_path,
                  feature_id: canonicalPayload.feature_id,
                  feature_label: canonicalPayload.feature_label,
                  ledger_type: canonicalPayload.ledger_type,
                });
              } else {
                report.postgres.rowsSkipped += 1;
              }
            })
            .catch(() => {
              report.postgres.rowsSkipped += 1;
            }),
        );
      }
      if (LIMIT !== null && processed >= LIMIT) {
        break;
      }
    }

    await flushPendingWrites(pendingWrites);

    report.canonicalCoverage = summarizeCanonicalCoverage(matchedCanonicalRows);
    report.summary = {
      rowsScanned: report.postgres.rowsScanned,
      rowsMatched: report.postgres.rowsMatched,
      rowsUpdated: report.postgres.rowsUpdated,
      rowsAlreadyCanonical: report.postgres.rowsAlreadyCanonical,
      rowsSkipped: report.postgres.rowsSkipped,
      rowsAmbiguous: report.postgres.rowsAmbiguous,
      rowsUnmatched: report.postgres.rowsUnmatched,
      qdrantPointsScanned: report.qdrant.pointsScanned,
      qdrantPointsMatched: report.qdrant.pointsMatched,
      qdrantPointsUpdated: report.qdrant.pointsUpdated,
      qdrantPointsAlreadyCanonical: report.qdrant.pointsAlreadyCanonical,
      qdrantPointsLegacyOnly: report.qdrant.pointsLegacyOnly,
      qdrantPointsAmbiguous: report.qdrant.pointsAmbiguous,
      qdrantPointsUnmatched: report.qdrant.pointsUnmatched,
      canonicalCoverage: report.canonicalCoverage,
      ledgerCounts: report.ledgerCounts,
    };

    await fs.mkdir(DOCS_DIR, { recursive: true });
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Qdrant Payload Complete Backfill',
        '',
        `Generated: ${report.generatedAt}`,
        `Mode: ${report.mode}`,
        `Collection: ${report.collection}`,
        `Database: ${report.databaseUrl}`,
        `Ledgers: ${report.availableLedgers.join(', ') || 'none'}`,
        '',
        '## Summary',
        '',
        `- Postgres rows scanned: ${report.postgres.rowsScanned}`,
        `- Postgres rows matched: ${report.postgres.rowsMatched}`,
        `- Rows updated: ${report.postgres.rowsUpdated}`,
        `- Rows already canonical: ${report.postgres.rowsAlreadyCanonical}`,
        `- Rows skipped: ${report.postgres.rowsSkipped}`,
        `- Rows ambiguous: ${report.postgres.rowsAmbiguous}`,
        `- Rows unmatched: ${report.postgres.rowsUnmatched}`,
        `- Qdrant points scanned: ${report.qdrant.pointsScanned}`,
        `- Qdrant points matched: ${report.qdrant.pointsMatched}`,
        `- Qdrant points updated: ${report.qdrant.pointsUpdated}`,
        `- Qdrant points already canonical: ${report.qdrant.pointsAlreadyCanonical}`,
        `- Qdrant points legacy only: ${report.qdrant.pointsLegacyOnly}`,
        '',
        '## Canonical Coverage',
        '',
        ...Object.entries(report.canonicalCoverage).map(
          ([field, stats]) => `- ${field}: ${stats.matched}/${stats.total} (${stats.pct}%)`,
        ),
        '',
        '## Ledger Counts',
        '',
        ...Object.entries(report.ledgerCounts).map(([ledger, count]) => `- ${ledger}: ${count}`),
        '',
        '## Sample',
        '',
        ...(report.samples.length > 0
          ? report.samples.map((sample) =>
              `- ${sample.qdrant_point_id ?? 'n/a'} | ${sample.packet_key ?? 'n/a'} | ${sample.status} | ${sample.reason}`,
            )
          : ['- none']),
      ].join('\n'),
      'utf8',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: report.mode,
          collection: report.collection,
          report: REPORT_JSON,
          markdown: REPORT_MD,
          stats: {
            qdrantPointsScanned: report.qdrant.pointsScanned,
            qdrantPointsMatched: report.qdrant.pointsMatched,
            qdrantPointsUpdated: report.qdrant.pointsUpdated,
            qdrantPointsLegacyOnly: report.qdrant.pointsLegacyOnly,
            canonicalCoverage: report.canonicalCoverage,
            ledgerCounts: report.ledgerCounts,
          },
        },
        null,
        2,
      ),
    );

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fs.mkdir(DOCS_DIR, { recursive: true }).catch(() => {});
    await fs.writeFile(
      REPORT_JSON,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: APPLY ? 'apply' : VERIFY ? 'verify' : 'dry-run',
          collection: COLLECTION,
          databaseUrl: redactUrl(databaseUrl),
          ok: false,
          error: message,
        },
        null,
        2,
      )}\n`,
      'utf8',
    ).catch(() => {});
    console.error('[atlas:qdrant:payload:complete] Failed:', message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[atlas:qdrant:payload:complete] Unhandled failure:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
