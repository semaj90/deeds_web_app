#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const POSTGRES_CONTAINER = process.env.PARENT_ATLAS_POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';
const QDRANT_URL = String(process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const REPORT_BASENAME = 'qdrant-postgres-mirror-reconciliation';
const DOC_JSON = path.join(REPO_ROOT, 'docs', 'reports', `${REPORT_BASENAME}.json`);
const DOC_MD = path.join(REPO_ROOT, 'docs', 'reports', `${REPORT_BASENAME}.md`);
const TMP_JSON = path.join(REPO_ROOT, '.tmp', `${REPORT_BASENAME}.json`);
const TMP_MD = path.join(REPO_ROOT, '.tmp', `${REPORT_BASENAME}.md`);
const APPLY_REQUESTED = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const SCROLL_LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split('=')[1] ?? 0) || 0) : 0;
const PAGE_SIZE = 250;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeDomain(value) {
  return normalizeText(value).toLowerCase();
}

function safeJsonParse(text) {
  if (text === undefined || text === null || text === '') return null;
  if (typeof text === 'object') return text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function firstDefined(row, aliases) {
  for (const alias of aliases) {
    const value = row?.[alias];
    if (Array.isArray(value)) {
      const candidate = value.find((item) => String(item ?? '').trim());
      if (candidate !== undefined) return candidate;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function textField(row, aliases) {
  return normalizeText(firstDefined(row, aliases));
}

function parseTsvRows(text, columns) {
  const lines = String(text ?? '').split('\n').filter(Boolean);
  return lines.map((line) => {
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

async function qdrantJson(method, pathname, body) {
  const url = new URL(pathname, `${QDRANT_URL}/`);
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, parsed, text };
}

function payloadField(payload, aliases) {
  if (!payload || typeof payload !== 'object') return undefined;
  return firstDefined(payload, aliases);
}

function parsePayloadObject(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload;
}

function coercePointId(pointId) {
  const text = normalizeText(pointId);
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isInteger(numeric) && String(numeric) === text) return numeric;
  return text;
}

function canonicalizeRow(row) {
  const metadataText = textField(row, ['metadata_json', 'metadata', 'payload_json', 'payload']);
  const metadata = safeJsonParse(metadataText) ?? null;
  const packetKey = textField(row, ['packet_key', 'packetKey']);
  const sourceRef = normalizeSourceRef(
    firstDefined(row, ['source_ref', 'sourceRef', 'canonical_source_ref', 'canonicalSourceRef', 'rel_path', 'relPath', 'file_path', 'filePath', 'path']) ??
      '',
  );
  const featureId = textField(row, ['feature_id', 'featureId']);
  const featureLabel = textField(row, ['feature_label', 'featureLabel']);
  const clusterId = textField(row, ['cluster_id', 'clusterId']);
  const centroidId = textField(row, ['centroid_id', 'centroidId']);
  const communityId = textField(row, ['community_id', 'communityId']);
  const topologyLabel = textField(row, ['topology_label', 'topologyLabel']) || textField(metadata, ['topology_label', 'topologyLabel', 'domain_class', 'domainClass']);
  const ontologyLabel = textField(row, ['ontology_label', 'ontologyLabel']) || textField(metadata, ['ontology_label', 'ontologyLabel', 'domain', 'domainClass']);
  const clusterKey = textField(row, ['cluster_key', 'clusterKey']) || textField(metadata, ['cluster_key', 'clusterKey']);
  const kmeansCluster = textField(row, ['kmeans_cluster', 'kmeansCluster']) || textField(metadata, ['kmeans_cluster', 'kmeansCluster']) || clusterId;
  const domain = normalizeDomain(firstDefined(row, ['domain', 'domain_class', 'domainClass', 'source_kind']) ?? '');
  const qdrantPointId = textField(row, ['qdrant_point_id', 'qdrantPointId', 'point_id', 'pointId']);
  const sourceRefHash = textField(row, ['source_ref_hash', 'sourceRefHash']);
  const canonicalSourceRef = normalizeSourceRef(firstDefined(row, ['canonical_source_ref', 'canonicalSourceRef', 'source_ref', 'sourceRef']) ?? sourceRef);
  const somCluster = textField(row, ['som_cluster', 'somCluster']) || clusterId;

  return {
    sourceTable: textField(row, ['source_table', 'sourceTable']) || 'task_semantic_packets',
    rowId: textField(row, ['row_id', 'id', 'rowId']),
    qdrantPointId,
    packetKey,
    sourceRef,
    canonicalSourceRef,
    featureId,
    featureLabel,
    clusterId,
    centroidId,
    communityId,
    topologyLabel,
    ontologyLabel,
    clusterKey,
    kmeansCluster,
    domain,
    somCluster,
    metadata,
    sourceRefHash,
  };
}

function mergeCanonical(target, incoming) {
  const merged = { ...target };
  const scalarFields = [
    'sourceTable',
    'rowId',
    'qdrantPointId',
    'packetKey',
    'sourceRef',
    'canonicalSourceRef',
    'featureId',
    'featureLabel',
    'clusterId',
    'centroidId',
    'communityId',
    'topologyLabel',
    'ontologyLabel',
    'clusterKey',
    'kmeansCluster',
    'domain',
    'somCluster',
    'sourceRefHash',
  ];

  for (const field of scalarFields) {
    if (!merged[field] && incoming[field]) merged[field] = incoming[field];
  }

  if (!merged.metadata && incoming.metadata) merged.metadata = incoming.metadata;
  if (!merged.sourceTables) merged.sourceTables = new Set();
  if (incoming.sourceTable) merged.sourceTables.add(incoming.sourceTable);
  return merged;
}

function canonicalRowToPayload(row) {
  const payload = {};
  if (row.packetKey) payload.packet_key = row.packetKey;
  if (row.sourceRef) payload.source_ref = row.sourceRef;
  if (row.canonicalSourceRef) payload.canonical_source_ref = row.canonicalSourceRef;
  if (row.featureId) payload.feature_id = row.featureId;
  if (row.featureLabel) payload.feature_label = row.featureLabel;
  if (row.clusterId) payload.cluster_id = row.clusterId;
  if (row.centroidId) payload.centroid_id = row.centroidId;
  if (row.communityId) payload.community_id = row.communityId;
  if (row.topologyLabel) payload.topology_label = row.topologyLabel;
  if (row.ontologyLabel) payload.ontology_label = row.ontologyLabel;
  if (row.clusterKey) payload.cluster_key = row.clusterKey;
  if (row.kmeansCluster) payload.kmeans_cluster = row.kmeansCluster;
  if (row.somCluster) payload.som_cluster = row.somCluster;
  if (row.domain) payload.domain = row.domain;
  if (row.metadata && Object.keys(row.metadata).length > 0) payload.metadata = row.metadata;
  if (row.sourceRefHash) payload.source_ref_hash = row.sourceRefHash;
  if (row.qdrantPointId) payload.qdrant_point_id = row.qdrantPointId;
  return payload;
}

function normalizeQdrantPayload(rawPayload) {
  const payload = parsePayloadObject(rawPayload);
  const metadata = safeJsonParse(payload.metadata) ?? (payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : null);
  return {
    raw: payload,
    sourceRef: normalizeSourceRef(
      payloadField(payload, ['source_ref', 'sourceRef', 'canonical_source_ref', 'canonicalSourceRef']) ?? '',
    ),
    featureId: textField(payload, ['feature_id', 'featureId', 'feature']),
    packetKey: textField(payload, ['packet_key', 'packetKey', 'packet_id', 'packetId']),
    clusterId: textField(payload, ['cluster_id', 'clusterId']),
    centroidId: textField(payload, ['centroid_id', 'centroidId']),
    communityId: textField(payload, ['community_id', 'communityId']),
    topologyLabel: textField(payload, ['topology_label', 'topologyLabel']) || textField(metadata ?? {}, ['topology_label', 'topologyLabel', 'domain_class', 'domainClass']),
    ontologyLabel: textField(payload, ['ontology_label', 'ontologyLabel']) || textField(metadata ?? {}, ['ontology_label', 'ontologyLabel', 'domain', 'domainClass']),
    clusterKey: textField(payload, ['cluster_key', 'clusterKey']) || textField(metadata ?? {}, ['cluster_key', 'clusterKey']),
    kmeansCluster: textField(payload, ['kmeans_cluster', 'kmeansCluster']) || textField(metadata ?? {}, ['kmeans_cluster', 'kmeansCluster', 'cluster_id', 'clusterId']),
    domain: normalizeDomain(payloadField(payload, ['domain', 'domain_class', 'domainClass']) ?? ''),
    somCluster: textField(payload, ['som_cluster', 'somCluster']) || textField(payload, ['cluster_id', 'clusterId']),
    qdrantTagId: textField(payload, ['qdrant_tag_id', 'qdrantTagId']),
    redisHotKey: textField(payload, ['redis_hot_key', 'redisHotKey']),
    neo4jNode: textField(payload, ['neo4j_node', 'neo4jNode']),
    karpathyScore: textField(payload, ['karpathy_score', 'karpathyScore']),
    metadata,
  };
}

async function loadCanonicalRows() {
  const sql = `
    with task_rows as (
      select
        'task_semantic_packets' as source_table,
        id::text as row_id,
        qdrant_point_id::text as qdrant_point_id,
        packet_key::text as packet_key,
        source_ref::text as source_ref,
        canonical_source_ref::text as canonical_source_ref,
        feature_id::text as feature_id,
        feature_label::text as feature_label,
        cluster_id::text as cluster_id,
        centroid_id::text as centroid_id,
        community_id::text as community_id,
        null::text as topology_label,
        null::text as ontology_label,
        null::text as cluster_key,
        null::text as kmeans_cluster,
        domain_class::text as domain,
        metadata::text as metadata_json,
        source_ref_hash::text as source_ref_hash,
        null::text as payload_json
      from task_semantic_packets
      where qdrant_point_id is not null
    ),
    parent_rows as (
      select
        'parent_atlas_documents' as source_table,
        id::text as row_id,
        qdrant_point_id::text as qdrant_point_id,
        null::text as packet_key,
        source_ref::text as source_ref,
        source_ref::text as canonical_source_ref,
        feature_id::text as feature_id,
        null::text as feature_label,
        cluster_id::text as cluster_id,
        centroid_id::text as centroid_id,
        null::text as community_id,
        coalesce(payload->>'topology_label', payload->>'domain_class', payload->>'domain')::text as topology_label,
        coalesce(payload->>'ontology_label', payload->>'domain', payload->>'domain_class')::text as ontology_label,
        payload->>'cluster_key' as cluster_key,
        coalesce(payload->>'kmeans_cluster', payload->>'cluster_id')::text as kmeans_cluster,
        coalesce(nullif(trim(payload->>'domain'), ''), nullif(trim(payload->>'domain_class'), ''), nullif(trim(source_kind::text), '')) as domain,
        coalesce(payload::text, '{}'::text) as metadata_json,
        null::text as source_ref_hash,
        payload::text as payload_json
      from parent_atlas_documents
      where qdrant_point_id is not null
    )
    select * from task_rows
    union all
    select * from parent_rows
    order by qdrant_point_id asc, source_table asc
  `;

  const rows = parseTsvRows(runPsql(sql), [
    'source_table',
    'row_id',
    'qdrant_point_id',
    'packet_key',
    'source_ref',
    'canonical_source_ref',
    'feature_id',
    'feature_label',
      'cluster_id',
      'centroid_id',
      'community_id',
      'topology_label',
      'ontology_label',
      'cluster_key',
      'kmeans_cluster',
      'domain',
    'metadata_json',
    'source_ref_hash',
    'payload_json',
  ]);

  const merged = new Map();
  for (const row of rows) {
    const canonical = canonicalizeRow(row);
    if (!canonical.qdrantPointId) continue;
    const existing = merged.get(canonical.qdrantPointId);
    if (existing) {
      merged.set(canonical.qdrantPointId, mergeCanonical(existing, canonical));
    } else {
      merged.set(canonical.qdrantPointId, mergeCanonical({ sourceTables: new Set() }, canonical));
    }
  }

  return [...merged.values()].map((row) => ({
    ...row,
    sourceTables: [...(row.sourceTables ?? [])].sort(),
  }));
}

async function scrollQdrantPoints() {
  const points = [];
  let offset = null;
  let fetched = 0;
  let reachable = false;
  let collectionInfo = null;

  try {
    const probe = await qdrantJson('GET', `/collections/${encodeURIComponent(QDRANT_COLLECTION)}`);
    reachable = probe.ok;
    collectionInfo = probe.parsed;
    if (!probe.ok) {
      return { reachable, collectionInfo, points, totalPoints: 0, error: probe.text || `HTTP ${probe.status}` };
    }
  } catch (error) {
    return { reachable: false, collectionInfo: null, points, totalPoints: 0, error: error?.message ?? String(error) };
  }

  while (true) {
    const body = {
      limit: PAGE_SIZE,
      with_payload: true,
      with_vector: false,
    };
    if (offset !== null) body.offset = offset;

    const response = await qdrantJson('POST', `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/scroll`, body);
    if (!response.ok) {
      throw new Error(response.text || `Qdrant scroll failed with HTTP ${response.status}`);
    }

    const batch = Array.isArray(response.parsed?.result?.points) ? response.parsed.result.points : [];
    points.push(...batch);
    fetched += batch.length;
    offset = response.parsed?.result?.next_page_offset ?? null;

    if (SCROLL_LIMIT > 0 && fetched >= SCROLL_LIMIT) break;
    if (!offset || batch.length === 0) break;
  }

  return {
    reachable: true,
    collectionInfo,
    points,
    totalPoints: points.length,
    error: null,
  };
}

function buildCanonicalLookups(rows) {
  const byQdrantId = new Map();
  const byPacketKey = new Map();
  const bySourceFeature = new Map();

  for (const row of rows) {
    if (row.qdrantPointId) byQdrantId.set(row.qdrantPointId, row);
    if (row.packetKey) byPacketKey.set(row.packetKey, row);
    if (row.sourceRef && row.featureId) {
      bySourceFeature.set(`${normalizeSourceRef(row.sourceRef)}::${row.featureId}`, row);
    }
  }

  return { byQdrantId, byPacketKey, bySourceFeature };
}

function compareField(fieldName, canonicalValue, payloadValue, options = {}) {
  const { normalize = (value) => normalizeText(value), optional = false } = options;
  const canonicalPresent = canonicalValue !== undefined && canonicalValue !== null && normalize(canonicalValue) !== '';
  const payloadPresent = payloadValue !== undefined && payloadValue !== null && normalize(payloadValue) !== '';

  if (!canonicalPresent) {
    return {
      fieldName,
      canonicalPresent: false,
      payloadPresent,
      match: true,
      deferred: optional ? true : false,
      patchValue: null,
    };
  }

  const normalizedCanonical = normalize(canonicalValue);
  const normalizedPayload = payloadPresent ? normalize(payloadValue) : '';
  const match = normalizedCanonical === normalizedPayload;
  return {
    fieldName,
    canonicalPresent: true,
    payloadPresent,
    match,
    deferred: false,
    patchValue: canonicalValue,
  };
}

function compareMetadata(canonicalMetadata, payloadMetadata) {
  const canonicalPresent = canonicalMetadata !== undefined && canonicalMetadata !== null;
  const payloadPresent = payloadMetadata !== undefined && payloadMetadata !== null;
  if (!canonicalPresent) {
    return {
      fieldName: 'metadata',
      canonicalPresent: false,
      payloadPresent,
      match: true,
      deferred: false,
      patchValue: null,
    };
  }
  const canonicalStable = stableStringify(canonicalMetadata);
  const payloadStable = stableStringify(payloadMetadata);
  return {
    fieldName: 'metadata',
    canonicalPresent: true,
    payloadPresent,
    match: canonicalStable === payloadStable,
    deferred: false,
    patchValue: canonicalMetadata,
  };
}

function buildPatch(canonical, payload) {
  const result = normalizeQdrantPayload(payload);
  const comparisons = [
    compareField('source_ref', canonical.sourceRef, result.sourceRef, { normalize: normalizeSourceRef }),
    compareField('feature_id', canonical.featureId, result.featureId),
    compareField('packet_key', canonical.packetKey, result.packetKey),
    compareMetadata(canonical.metadata, result.metadata),
    compareField('cluster_id', canonical.clusterId, result.clusterId),
    compareField('community_id', canonical.communityId, result.communityId),
    compareField('topology_label', canonical.topologyLabel, result.topologyLabel),
    compareField('ontology_label', canonical.ontologyLabel, result.ontologyLabel),
    compareField('cluster_key', canonical.clusterKey, result.clusterKey),
    compareField('kmeans_cluster', canonical.kmeansCluster, result.kmeansCluster),
    compareField('domain', canonical.domain, result.domain, { normalize: normalizeDomain }),
    compareField('som_cluster', canonical.somCluster || canonical.clusterId, result.somCluster),
  ];

  const patch = {};
  for (const comparison of comparisons) {
    if (comparison.canonicalPresent && !comparison.match && comparison.patchValue !== null && comparison.patchValue !== undefined) {
      if (comparison.fieldName === 'metadata') {
        patch.metadata = comparison.patchValue;
      } else if (comparison.fieldName === 'source_ref') {
        patch.source_ref = comparison.patchValue;
      } else if (comparison.fieldName === 'feature_id') {
        patch.feature_id = comparison.patchValue;
      } else if (comparison.fieldName === 'packet_key') {
        patch.packet_key = comparison.patchValue;
      } else if (comparison.fieldName === 'cluster_id') {
        patch.cluster_id = comparison.patchValue;
      } else if (comparison.fieldName === 'community_id') {
        patch.community_id = comparison.patchValue;
      } else if (comparison.fieldName === 'topology_label') {
        patch.topology_label = comparison.patchValue;
      } else if (comparison.fieldName === 'ontology_label') {
        patch.ontology_label = comparison.patchValue;
      } else if (comparison.fieldName === 'cluster_key') {
        patch.cluster_key = comparison.patchValue;
      } else if (comparison.fieldName === 'kmeans_cluster') {
        patch.kmeans_cluster = comparison.patchValue;
      } else if (comparison.fieldName === 'domain') {
        patch.domain = comparison.patchValue;
      } else if (comparison.fieldName === 'som_cluster') {
        patch.som_cluster = comparison.patchValue;
      }
    }
  }

  return { comparisons, patch, normalizedPayload: result };
}

async function updateQdrantPayload(pointId, patch) {
  const response = await qdrantJson('POST', `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/payload`, {
    points: [coercePointId(pointId)].filter((item) => item !== null),
    payload: patch,
    wait: true,
  });
  return response;
}

async function retrieveQdrantPoints(ids) {
  if (ids.length === 0) return [];
  const response = await qdrantJson('POST', `/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/retrieve`, {
    ids,
    with_payload: true,
    with_vector: false,
  });
  if (!response.ok) throw new Error(response.text || `Qdrant retrieve failed with HTTP ${response.status}`);
  return Array.isArray(response.parsed?.result) ? response.parsed.result : [];
}

function compareCanonicalToPayload(canonical, payloadPoint) {
  const payload = normalizeQdrantPayload(payloadPoint?.payload ?? payloadPoint ?? {});
  const comparisons = [
    compareField('source_ref', canonical.sourceRef, payload.sourceRef, { normalize: normalizeSourceRef }),
    compareField('feature_id', canonical.featureId, payload.featureId),
    compareField('packet_key', canonical.packetKey, payload.packetKey),
    compareMetadata(canonical.metadata, payload.metadata),
    compareField('cluster_id', canonical.clusterId, payload.clusterId),
    compareField('community_id', canonical.communityId, payload.communityId),
    compareField('topology_label', canonical.topologyLabel, payload.topologyLabel),
    compareField('ontology_label', canonical.ontologyLabel, payload.ontologyLabel),
    compareField('cluster_key', canonical.clusterKey, payload.clusterKey),
    compareField('kmeans_cluster', canonical.kmeansCluster, payload.kmeansCluster),
    compareField('domain', canonical.domain, payload.domain, { normalize: normalizeDomain }),
    compareField('som_cluster', canonical.somCluster || canonical.clusterId, payload.somCluster),
  ];

  const patch = {};
  for (const comparison of comparisons) {
    if (comparison.canonicalPresent && !comparison.match && comparison.patchValue !== null && comparison.patchValue !== undefined) {
      if (comparison.fieldName === 'metadata') patch.metadata = comparison.patchValue;
      if (comparison.fieldName === 'source_ref') patch.source_ref = comparison.patchValue;
      if (comparison.fieldName === 'feature_id') patch.feature_id = comparison.patchValue;
      if (comparison.fieldName === 'packet_key') patch.packet_key = comparison.patchValue;
      if (comparison.fieldName === 'cluster_id') patch.cluster_id = comparison.patchValue;
      if (comparison.fieldName === 'community_id') patch.community_id = comparison.patchValue;
      if (comparison.fieldName === 'topology_label') patch.topology_label = comparison.patchValue;
      if (comparison.fieldName === 'ontology_label') patch.ontology_label = comparison.patchValue;
      if (comparison.fieldName === 'cluster_key') patch.cluster_key = comparison.patchValue;
      if (comparison.fieldName === 'kmeans_cluster') patch.kmeans_cluster = comparison.patchValue;
      if (comparison.fieldName === 'domain') patch.domain = comparison.patchValue;
      if (comparison.fieldName === 'som_cluster') patch.som_cluster = comparison.patchValue;
    }
  }

  const optionalFields = {
    qdrant_tag_id: payload.qdrantTagId || null,
    redis_hot_key: payload.redisHotKey || null,
    neo4j_node: payload.neo4jNode || null,
    karpathy_score: payload.karpathyScore || null,
  };

  return { payload, comparisons, patch, optionalFields };
}

function summarizeFieldComparisons(rows) {
  const summary = {
    source_ref: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    feature_id: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    packet_key: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    metadata: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    cluster_id: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    community_id: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    topology_label: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    ontology_label: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    cluster_key: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    kmeans_cluster: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    domain: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
    som_cluster: { canonical: 0, present: 0, matched: 0, mismatched: 0, deferred: 0 },
  };

  for (const row of rows) {
    for (const comparison of row.comparison ?? []) {
      const bucket = summary[comparison.fieldName];
      if (!bucket) continue;
      if (comparison.canonicalPresent) bucket.canonical += 1;
      if (comparison.payloadPresent) bucket.present += 1;
      if (comparison.deferred) bucket.deferred += 1;
      if (comparison.canonicalPresent && comparison.match) bucket.matched += 1;
      if (comparison.canonicalPresent && !comparison.match) bucket.mismatched += 1;
    }
  }

  return summary;
}

function renderMarkdown(report) {
  const fieldRows = Object.entries(report.fieldCoverage)
    .map(([field, stats]) => `| ${field} | ${stats.canonical} | ${stats.present} | ${stats.matched} | ${stats.mismatched} | ${stats.deferred} |`)
    .join('\n');

  const orphanSample = report.orphanSamples.length > 0
    ? report.orphanSamples.slice(0, 8).map((item) => `- ${item.pointId} (${item.reason})`).join('\n')
    : '- none';

  const patchSample = report.patchCandidates.length > 0
    ? report.patchCandidates.slice(0, 8).map((item) => `- ${item.pointId}: ${Object.keys(item.patch).join(', ')}`).join('\n')
    : '- none';

  const visibility = report.gemma4Context?.fields ?? {};
  const visibilityLines = Object.entries(visibility)
    .map(([key, value]) => `- ${key}: ${value.status}${value.value !== null && value.value !== undefined && value.value !== '' ? ` (${String(value.value)})` : ''}`)
    .join('\n');

  return [
    '# Qdrant / Postgres Mirror Reconciliation',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Collection: ${report.collection}`,
    `Apply requested: ${report.applyRequested ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- canonical rows: ${report.summary.canonicalRows}`,
    `- qdrant points scanned: ${report.summary.qdrantPointsScanned}`,
    `- joinable points: ${report.summary.joinablePoints}`,
    `- orphan points: ${report.summary.orphanPoints}`,
    `- agreement before: ${report.summary.agreementBefore}`,
    `- agreement after: ${report.summary.agreementAfter}`,
    `- suggested patches: ${report.summary.patchCandidates}`,
    `- applied patches: ${report.summary.appliedPatches}`,
    '',
    '## Field Coverage',
    '',
    '| field | canonical | payload-present | matched | mismatched | deferred |',
    '|---|---:|---:|---:|---:|---:|',
    fieldRows || '| none | 0 | 0 | 0 | 0 | 0 |',
    '',
    '## Sample Orphans',
    '',
    orphanSample,
    '',
    '## Patch Candidates',
    '',
    patchSample,
    '',
    '## Gemma4 Context Visibility',
    '',
    visibilityLines || '- none',
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function writeReport(report) {
  await fs.mkdir(path.dirname(DOC_JSON), { recursive: true });
  await fs.mkdir(path.dirname(TMP_JSON), { recursive: true });
  await fs.writeFile(DOC_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(DOC_MD, `${renderMarkdown(report)}\n`, 'utf8');
  await fs.writeFile(TMP_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(TMP_MD, `${renderMarkdown(report)}\n`, 'utf8');
}

async function main() {
  const canonicalRows = await loadCanonicalRows();
  const lookups = buildCanonicalLookups(canonicalRows);

  const scroll = await scrollQdrantPoints();
  const qdrantPointsScanned = scroll.points.length;
  const qdrantReachable = scroll.reachable;

  const results = [];
  const orphanSamples = [];
  const patchCandidates = [];
  const matchedPointIds = new Set();

  for (const point of scroll.points) {
    const pointId = normalizeText(point?.id);
    const canonical =
      lookups.byQdrantId.get(pointId)
      ?? lookups.byPacketKey.get(normalizeText(point?.payload?.packet_key ?? point?.payload?.packetKey ?? ''))
      ?? lookups.bySourceFeature.get(
        `${normalizeSourceRef(point?.payload?.source_ref ?? point?.payload?.sourceRef ?? point?.payload?.canonical_source_ref ?? '')}::${normalizeText(point?.payload?.feature_id ?? point?.payload?.featureId ?? '')}`,
      )
      ?? null;

    if (!canonical) {
      orphanSamples.push({
        pointId,
        reason: 'not joinable to canonical Postgres spine',
      });
      continue;
    }

    matchedPointIds.add(pointId);
    const comparison = compareCanonicalToPayload(canonical, point);
    const mismatchedFields = comparison.comparisons.filter((item) => item.canonicalPresent && !item.match).map((item) => item.fieldName);
    const patch = comparison.patch;

    if (Object.keys(patch).length > 0) {
      patchCandidates.push({
        pointId,
        canonical: {
          sourceTable: canonical.sourceTables?.[0] ?? canonical.sourceTable ?? null,
          qdrantPointId: canonical.qdrantPointId,
          packetKey: canonical.packetKey || null,
          sourceRef: canonical.sourceRef || null,
          featureId: canonical.featureId || null,
        },
        mismatchedFields,
        patch,
      });
    }

    results.push({
      pointId,
      canonical,
      comparison: comparison.comparisons,
      patch,
      optionalFields: comparison.optionalFields,
      matched: mismatchedFields.length === 0,
    });
  }

  const fieldCoverage = summarizeFieldComparisons(results);
  const joinablePoints = results.length;
  const orphanPoints = Math.max(qdrantPointsScanned - joinablePoints, orphanSamples.length);
  const agreementBefore = results.filter((row) => row.matched).length;
  const patchCountBefore = patchCandidates.length;

  let appliedPatches = 0;
  let agreementAfter = agreementBefore;
  let qdrantLiveStatus = qdrantReachable ? 'LIVE_ALIGNED' : 'LIVE_UNAVAILABLE';
  let applyFailures = [];

  if (APPLY_REQUESTED && qdrantReachable && patchCandidates.length > 0) {
    for (const candidate of patchCandidates) {
      const response = await updateQdrantPayload(candidate.pointId, candidate.patch);
      if (!response.ok) {
        applyFailures.push({
          pointId: candidate.pointId,
          status: response.status,
          error: response.text || `HTTP ${response.status}`,
        });
      } else {
        appliedPatches += 1;
      }
    }

    agreementAfter = Math.max(agreementBefore, joinablePoints - applyFailures.length);
  } else if (APPLY_REQUESTED && !qdrantReachable) {
    applyFailures.push({
      pointId: null,
      status: 'LIVE_UNAVAILABLE',
      error: scroll.error || 'Qdrant not reachable',
    });
  }

  const deferredFields = {
    qdrant_tag_id: {
      status: 'DEFERRED',
      value: null,
      reason: 'no canonical contract field in the current Postgres spine',
    },
    karpathy_score: {
      status: 'DEFERRED',
      value: null,
      reason: 'not present in the canonical Postgres spine or current live payload sample',
    },
    redis_hot_key: {
      status: 'DEFERRED',
      value: null,
      reason: 'hot cache key is not part of the canonical Postgres payload contract',
    },
    neo4j_node: {
      status: 'DEFERRED',
      value: null,
      reason: 'Neo4j node ids are a traversal projection, not a Postgres source-of-truth field',
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    status:
      !qdrantReachable
        ? 'LIVE_UNAVAILABLE'
        : patchCandidates.length === 0 && applyFailures.length === 0
          ? 'IN_SYNC'
          : APPLY_REQUESTED && applyFailures.length === 0
            ? 'RECONCILED'
            : 'RECONCILIATION_REQUIRED',
    collection: QDRANT_COLLECTION,
    qdrantUrl: QDRANT_URL,
    postgresContainer: POSTGRES_CONTAINER,
    applyRequested: APPLY_REQUESTED,
    qdrant: {
      reachable: qdrantReachable,
      error: scroll.error ?? null,
      collectionInfo: scroll.collectionInfo ?? null,
    },
    summary: {
      canonicalRows: canonicalRows.length,
      qdrantPointsScanned,
      joinablePoints,
      orphanPoints,
      agreementBefore,
      agreementAfter,
      patchCandidates: patchCountBefore,
      appliedPatches,
      applyFailures: applyFailures.length,
      deferredFields: Object.fromEntries(Object.entries(deferredFields).map(([key, value]) => [key, value.status])),
    },
    fieldCoverage,
    orphanSamples,
    patchCandidates,
    applyFailures,
    deferredFields,
    canonicalSources: {
      taskSemanticPackets: canonicalRows.filter((row) => row.sourceTables.includes('task_semantic_packets')).length,
      parentAtlasDocuments: canonicalRows.filter((row) => row.sourceTables.includes('parent_atlas_documents')).length,
    },
    gemma4Context: {
      fields: {
        feature_id: { status: joinablePoints > 0 ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.featureId)?.featureId ?? null },
        source_ref: { status: joinablePoints > 0 ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.sourceRef)?.sourceRef ?? null },
        metadata: { status: canonicalRows.some((row) => row.metadata) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.metadata)?.metadata ?? null },
        packet_key: { status: canonicalRows.some((row) => row.packetKey) ? 'VISIBLE' : 'DEFERRED', value: canonicalRows.find((row) => row.packetKey)?.packetKey ?? null },
        cluster_id: { status: canonicalRows.some((row) => row.clusterId) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.clusterId)?.clusterId ?? null },
        community_id: { status: canonicalRows.some((row) => row.communityId) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.communityId)?.communityId ?? null },
        topology_label: { status: canonicalRows.some((row) => row.topologyLabel) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.topologyLabel)?.topologyLabel ?? null },
        ontology_label: { status: canonicalRows.some((row) => row.ontologyLabel) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.ontologyLabel)?.ontologyLabel ?? null },
        cluster_key: { status: canonicalRows.some((row) => row.clusterKey) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.clusterKey)?.clusterKey ?? null },
        kmeans_cluster: { status: canonicalRows.some((row) => row.kmeansCluster) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.kmeansCluster)?.kmeansCluster ?? null },
        som_cluster: { status: canonicalRows.some((row) => row.somCluster) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.somCluster)?.somCluster ?? null },
        domain: { status: canonicalRows.some((row) => row.domain) ? 'VISIBLE' : 'MISSING', value: canonicalRows.find((row) => row.domain)?.domain ?? null },
        qdrant_tag_id: deferredFields.qdrant_tag_id,
        karpathy_score: deferredFields.karpathy_score,
        redis_hot_key: deferredFields.redis_hot_key,
        neo4j_node: deferredFields.neo4j_node,
      },
      briefingCompatibility: {
        greeting: 'Hello James.',
        nextLane: patchCandidates.length > 0 ? 'Qdrant payload agreement' : 'Maintain current packet contract alignment',
      },
    },
    nextSafeAction:
      !qdrantReachable
        ? 'Restore Qdrant reachability, then rerun the reconciliation audit before attempting any backfill.'
        : patchCandidates.length > 0
          ? 'Backfill the Qdrant payload fields from the canonical Postgres spine using the apply alias, then rerun the audit.'
          : 'Keep the payload lane read-only; the current canonical rows are already aligned with Qdrant for the checked fields.',
  };

  await writeReport(report);

  console.log(`Wrote ${path.relative(REPO_ROOT, DOC_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, DOC_MD)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, TMP_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, TMP_MD)}`);
  console.log(JSON.stringify({
    status: report.status,
    canonicalRows: report.summary.canonicalRows,
    qdrantPointsScanned: report.summary.qdrantPointsScanned,
    joinablePoints: report.summary.joinablePoints,
    orphanPoints: report.summary.orphanPoints,
    agreementBefore: report.summary.agreementBefore,
    agreementAfter: report.summary.agreementAfter,
    patchCandidates: report.summary.patchCandidates,
    appliedPatches: report.summary.appliedPatches,
    qdrantReachable: report.qdrant.reachable,
  }, null, 2));
}

main().catch((error) => {
  console.error('[qdrant-postgres-mirror-reconciliation] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
