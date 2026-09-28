#!/usr/bin/env node
/**
 * warm-bitfrost-semantic-cache.mjs (atlas/) — reads from Postgres `atlas_higher_hop_index`
 * directly and plans `bifrost:sem:packet:{packet_key}` / `bifrost:sem:feature:{feature_id}`
 * writes keyed on canonical packetKey identity.
 *
 * There is a SECOND, unrelated script with a near-identical name:
 * `scripts/cache/warm-bifrost-semantic-cache.mjs` — that one reads a DuckDB-exported
 * JSONL file and writes `bifrost:sem:query:{query_hash}` entries keyed on query-hash
 * identity, a different identity axis entirely. Do not conflate the two, and do not
 * assume one supersedes the other without reading both first (see root CLAUDE.md's
 * BitFrost warm-buckets section for the fuller history).
 *
 * THIS script's `--apply` is permanently hard-blocked
 * (`REVISION_BOUND_ACE_PACKET_IDENTITY_REQUIRED`) until a revision-bound ACE packet
 * identity/ordinal-map source exists — see `BITFROST-LIVE-WARM-01` in
 * `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`. Dry-run only.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packetFieldValue, safeJsonObject } from './lib/adaptive-schema.mjs';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';
import { resolveAtlasRedisContext } from './lib/redis-valkey.mjs';
import { buildTopologyEnvelope, deriveCentroidKeys } from './lib/topology-ontology.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const POSTGRES_CONTAINER = process.env.PARENT_ATLAS_POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';
const APPLY_REQUESTED = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split('=')[1] ?? 25) || 25) : 25;
const WORKSPACE_REVISION_ARG = process.argv.find((arg) => arg.startsWith('--workspace-revision='));
const WORKSPACE_REVISION = WORKSPACE_REVISION_ARG?.slice('--workspace-revision='.length) ?? null;
const SOURCE_AUTHORITY_REPO_ID = 'deeds-web-app'; // explicit root namespace bridge target
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'bitfrost-semantic-cache-warm.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'bitfrost-semantic-cache-warm.md');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function toOptionalNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

async function pickLedgerTable() {
  const result = parseTsvRows(
    runPsql(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'atlas_packets'
      limit 1
    `),
    ['table_name'],
  );
  return result[0]?.table_name || null;
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
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 },
  );

  if (result.status !== 0) {
    throw new Error(String(result.stderr ?? result.stdout ?? `psql exit ${result.status}`));
  }

  return String(result.stdout ?? '').trim();
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

function renderMarkdown(report) {
  return [
    '# Bitfrost Semantic Cache Warm Plan',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    `Limit: ${report.limit}`,
    '',
    '## Summary',
    '',
    `- candidate rows: ${report.summary.candidateRows}`,
    `- source table: ${report.source.table}`,
    `- source admission funnel: ${JSON.stringify(report.source.admissionFunnel ?? {})}`,
    `- packets planned: ${report.summary.packetKeysPlanned}`,
    `- feature keys planned: ${report.summary.featureKeysPlanned}`,
    `- ace keys planned: ${report.summary.aceKeysPlanned}`,
    `- writes applied: ${report.summary.appliedWrites}`,
    `- failures: ${report.summary.failures}`,
    '',
    '## Planned Keys',
    '',
    ...report.plans.map((plan) => `- ${plan.key} (${plan.ttl}s)`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    ...(report.applyBlockedReason ? ['', `Apply blocked: ${report.applyBlockedReason}`] : []),
  ].join('\n');
}

async function main() {
  if (WORKSPACE_REVISION !== null && !/^sha256:[a-f0-9]{64}$/i.test(WORKSPACE_REVISION)) {
    throw new Error('BITFROST_WARM_WORKSPACE_REVISION_MUST_BE_EXPLICIT_SHA256');
  }
  const { container, password: redisPassword } = await resolveAtlasRedisContext(REPO_ROOT, process.env);
  const sourceTable = await pickLedgerTable();
  if (!sourceTable) {
    throw new Error('No canonical packet ledger table found for Bitfrost warm path.');
  }

  const columnRows = parseTsvRows(
    runPsql(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = '${sourceTable}'
      order by ordinal_position
    `),
    ['column_name'],
  );
  const columnSet = new Set(columnRows.map((row) => row.column_name));
  const col = (name, alias = name) => (columnSet.has(name) ? `p.${name}::text as ${alias}` : `null::text as ${alias}`);
  const whereCandidates = [
    columnSet.has('source_ref_key') ? 'p.source_ref_key' : null,
    columnSet.has('source_ref') ? 'p.source_ref' : null,
    columnSet.has('file_path') ? 'p.file_path' : null,
    columnSet.has('packet_key') ? 'p.packet_key' : null,
  ].filter(Boolean);
  const sourceClause = whereCandidates.length > 0
    ? `nullif(btrim(coalesce(${whereCandidates.join(', ')})::text), '') is not null`
    : 'true';
  const featureClause = columnSet.has('feature_id') ? "nullif(btrim(p.feature_id::text), '') is not null" : 'false';
  const lineageColumns = ['source_revision', 'canonical_source_ref'];
  const missingLineageColumns = lineageColumns.filter((name) => !columnSet.has(name));
  if (missingLineageColumns.length > 0) {
    throw new Error(`BITFROST_WARM_SOURCE_LINEAGE_COLUMNS_MISSING:${missingLineageColumns.join(',')}`);
  }
  const sourceRevisionClause = `
      nullif(btrim(p.source_revision::text), '') is not null
      and lower(btrim(p.source_revision::text)) not in ('0', 'workspace:0')
    `;
  const workspaceRevisionClause = WORKSPACE_REVISION
    ? `b.workspace_revision = '${WORKSPACE_REVISION}'`
    : 'false';
  const canonicalSourceRefClause = "nullif(btrim(p.canonical_source_ref::text), '') is not null";
  const admissionFunnelRows = parseTsvRows(runPsql(`
    select
      count(*)::text as total_rows,
      count(*) filter (where ${sourceClause})::text as source_ref_rows,
      count(*) filter (where ${sourceClause} and ${featureClause})::text as feature_rows,
      count(*) filter (where ${sourceClause} and ${featureClause} and ${sourceRevisionClause})::text as source_revision_rows,
      (select count(*) from public.${sourceTable} p join public.atlas_workspace_source_bindings b
        on b.repo_id = '${SOURCE_AUTHORITY_REPO_ID}'
        and b.canonical_source_ref = p.canonical_source_ref
        and b.source_revision = p.source_revision
        and ${workspaceRevisionClause}
        where ${sourceClause} and ${featureClause} and ${sourceRevisionClause} and ${canonicalSourceRefClause})::text as workspace_revision_rows,
      (select count(distinct p.packet_key) from public.${sourceTable} p join public.atlas_workspace_source_bindings b
        on b.repo_id = '${SOURCE_AUTHORITY_REPO_ID}'
        and b.canonical_source_ref = p.canonical_source_ref
        and b.source_revision = p.source_revision
        and ${workspaceRevisionClause}
        where ${sourceClause} and ${featureClause} and ${sourceRevisionClause} and ${canonicalSourceRefClause})::text as fully_qualified_rows
    from public.${sourceTable} p
  `), [
    'total_rows',
    'source_ref_rows',
    'feature_rows',
    'source_revision_rows',
    'workspace_revision_rows',
    'fully_qualified_rows',
  ])[0] ?? {};
  const admissionFunnel = Object.fromEntries(
    Object.entries(admissionFunnelRows).map(([key, value]) => [key, Number(value) || 0]),
  );
  const sql = `
    with joined as (
    select
      ${col('packet_key')},
      ${col('source_ref_key')},
      ${col('source_ref')},
      ${col('canonical_source_ref')},
      ${col('source_revision')},
      ${col('file_path')},
      ${col('feature_id')},
      ${col('feature_label')},
      ${col('community_id')},
      ${col('community_source')},
      ${col('community_confidence')},
      ${col('som_cell_x')},
      ${col('som_cell_y')},
      ${col('som_cluster', 'legacy_som_cluster')},
      ${col('cluster_id')},
      ${col('centroid_id')},
      ${col('qdrant_point_id')},
      ${col('qdrant_collection')},
      ${col('qdrant_payload_key')},
      ${col('content_hash')},
      ${col('chunk_id')},
      ${col('tree_node_id')},
      ${col('glyph_record_id')},
      ${col('neo4j_node_id')},
      ${col('identity_lane')},
      ${col('identity_confidence')},
      ${col('evidence_mode')},
      ${col('repair_status')},
      ${col('lineage_version')},
      ${col('ledger_type')},
      ${col('metadata')},
      b.workspace_revision::text as workspace_revision,
      b.binding_checksum::text as binding_checksum,
      b.repo_id::text as source_authority_repo_id,
      count(*) over (partition by p.packet_key) as binding_match_count
    from public.${sourceTable} p
    join public.atlas_workspace_source_bindings b
      on b.repo_id = '${SOURCE_AUTHORITY_REPO_ID}'
      and b.canonical_source_ref = p.canonical_source_ref
      and b.source_revision = p.source_revision
      and ${workspaceRevisionClause}
    where ${sourceClause} and ${featureClause} and ${sourceRevisionClause} and ${canonicalSourceRefClause}
    )
    select * from joined
    where binding_match_count = 1
    order by
      community_id asc nulls last,
      som_cell_x asc nulls last,
      som_cell_y asc nulls last,
      identity_confidence desc nulls last,
      packet_key asc
      ${LIMIT > 0 ? `limit ${LIMIT}` : ''}
  `;

  const rows = parseTsvRows(runPsql(sql), [
    'packet_key',
    'source_ref_key',
    'source_ref',
    'canonical_source_ref',
    'source_revision',
    'file_path',
    'feature_id',
    'feature_label',
    'community_id',
    'community_source',
    'community_confidence',
    'som_cell_x',
    'som_cell_y',
    'legacy_som_cluster',
    'cluster_id',
    'centroid_id',
    'qdrant_point_id',
    'qdrant_collection',
    'qdrant_payload_key',
    'content_hash',
    'chunk_id',
    'tree_node_id',
    'glyph_record_id',
    'neo4j_node_id',
    'identity_lane',
    'identity_confidence',
    'evidence_mode',
    'repair_status',
    'lineage_version',
    'ledger_type',
    'metadata',
    'workspace_revision',
    'binding_checksum',
    'source_authority_repo_id',
    'binding_match_count',
  ]).map((row) => ({
    packet_key: normalizeText(row.packet_key),
    source_ref_key: normalizeSourceRef(row.source_ref_key),
    source_ref: normalizeSourceRef(row.source_ref || row.canonical_source_ref || row.file_path || row.source_ref_key),
    canonical_source_ref: normalizeSourceRef(row.canonical_source_ref || row.source_ref || row.source_ref_key),
    source_revision: normalizeText(row.source_revision),
    workspace_revision: normalizeText(row.workspace_revision),
    binding_checksum: normalizeText(row.binding_checksum),
    source_authority_repo_id: normalizeText(row.source_authority_repo_id),
    binding_match_count: toOptionalNumber(row.binding_match_count),
    file_path: normalizeText(row.file_path),
    feature_id: normalizeText(row.feature_id),
    feature_label: normalizeText(row.feature_label),
    community_id: normalizeText(row.community_id),
    community_source: normalizeText(row.community_source),
    community_confidence: normalizeText(row.community_confidence),
    som_cell_x: normalizeText(row.som_cell_x),
    som_cell_y: normalizeText(row.som_cell_y),
    legacy_som_cluster: normalizeText(row.legacy_som_cluster),
    cluster_id: normalizeText(row.cluster_id),
    centroid_id: normalizeText(row.centroid_id),
    qdrant_point_id: normalizeText(row.qdrant_point_id),
    qdrant_collection: normalizeText(row.qdrant_collection),
    qdrant_payload_key: normalizeText(row.qdrant_payload_key),
    content_hash: normalizeText(row.content_hash),
    chunk_id: normalizeText(row.chunk_id),
    tree_node_id: normalizeText(row.tree_node_id),
    glyph_record_id: normalizeText(row.glyph_record_id),
    neo4j_node_id: normalizeText(row.neo4j_node_id),
    identity_lane: normalizeText(row.identity_lane),
    identity_confidence: normalizeText(row.identity_confidence),
    evidence_mode: normalizeText(row.evidence_mode),
    repair_status: normalizeText(row.repair_status),
    lineage_version: normalizeText(row.lineage_version),
    ledger_type: normalizeText(row.ledger_type),
    metadata: (() => {
      try {
        return row.metadata ? JSON.parse(row.metadata) : {};
      } catch {
        return {};
      }
    })(),
  }));
  const plans = [];
  for (const row of rows) {
    const metadata = safeJsonObject(packetFieldValue(row, 'metadata'));
    const packetKey = String(packetFieldValue(row, 'packet_key') ?? row.packet_key ?? '').trim();
    const sourceRef = String(packetFieldValue(row, 'source_ref') ?? row.source_ref ?? '').trim();
    const sourceRefKey = String(packetFieldValue(row, 'source_ref_key') ?? row.source_ref_key ?? '').trim();
    const canonicalSourceRef = String(
      packetFieldValue(row, 'canonical_source_ref') ?? row.canonical_source_ref ?? sourceRefKey ?? sourceRef ?? '',
    ).trim();
    const featureId = String(packetFieldValue(row, 'feature_id') ?? row.feature_id ?? '').trim();
    const featureLabel = String(packetFieldValue(row, 'feature_label') ?? row.feature_label ?? '').trim();
    const communityId = String(packetFieldValue(row, 'community_id') ?? row.community_id ?? '').trim();
    const communitySource = String(packetFieldValue(row, 'community_source') ?? row.community_source ?? '').trim();
    const communityConfidence = String(packetFieldValue(row, 'community_confidence') ?? row.community_confidence ?? '').trim();
    const somCellX = toOptionalNumber(packetFieldValue(row, 'som_cell_x') ?? row.som_cell_x);
    const somCellY = toOptionalNumber(packetFieldValue(row, 'som_cell_y') ?? row.som_cell_y);
    const somCell = somCellX !== null && somCellY !== null ? `${somCellX}:${somCellY}` : null;
    const clusterId = String(packetFieldValue(row, 'cluster_id') ?? row.cluster_id ?? '').trim();
    const centroidId = String(packetFieldValue(row, 'centroid_id') ?? row.centroid_id ?? '').trim();
    const qdrantPointId = String(packetFieldValue(row, 'qdrant_point_id') ?? row.qdrant_point_id ?? '').trim();
    const qdrantCollection = String(packetFieldValue(row, 'qdrant_collection') ?? row.qdrant_collection ?? '').trim();
    const qdrantPayloadKey = String(packetFieldValue(row, 'qdrant_payload_key') ?? row.qdrant_payload_key ?? '').trim();
    const contentHash = String(packetFieldValue(row, 'content_hash') ?? row.content_hash ?? '').trim();
    const chunkId = String(packetFieldValue(row, 'chunk_id') ?? row.chunk_id ?? '').trim();
    const treeNodeId = String(packetFieldValue(row, 'tree_node_id') ?? row.tree_node_id ?? '').trim();
    const glyphRecordId = String(packetFieldValue(row, 'glyph_record_id') ?? row.glyph_record_id ?? '').trim();
    const neo4jNodeId = String(packetFieldValue(row, 'neo4j_node_id') ?? row.neo4j_node_id ?? '').trim();
    const identityLane = String(packetFieldValue(row, 'identity_lane') ?? row.identity_lane ?? '').trim();
    const identityConfidence = String(packetFieldValue(row, 'identity_confidence') ?? row.identity_confidence ?? '').trim();
    const evidenceMode = String(packetFieldValue(row, 'evidence_mode') ?? row.evidence_mode ?? '').trim();
    const repairStatus = String(packetFieldValue(row, 'repair_status') ?? row.repair_status ?? '').trim();
    const lineageVersion = String(packetFieldValue(row, 'lineage_version') ?? row.lineage_version ?? '').trim();
    const ledgerType = String(packetFieldValue(row, 'ledger_type') ?? row.ledger_type ?? '').trim();
    const tags = packetFieldValue(row, 'tags');
    const summary = String(
      packetFieldValue(row, 'summary') ??
      metadata.summary ??
      metadata.text ??
      '',
    ).trim();
    const topology = buildTopologyEnvelope({
      ...row,
      som_cell: somCell,
    });
    const centroidKeys = deriveCentroidKeys({
      ...row,
      som_cell: somCell,
    });
    const validCentroidKeys = Object.fromEntries(
      Object.entries(centroidKeys).map(([name, key]) => [name, key && !/:$/.test(key) ? key : null]),
    );

    const base = {
      packet_key: packetKey,
      source_ref: sourceRef,
      source_ref_key: sourceRefKey || null,
      canonical_source_ref: canonicalSourceRef || null,
      source_revision: row.source_revision,
      workspace_revision: row.workspace_revision,
      binding_checksum: row.binding_checksum,
      source_authority_repo_id: row.source_authority_repo_id,
      qdrant_point_id: qdrantPointId || null,
      qdrant_collection: qdrantCollection || null,
      qdrant_payload_key: qdrantPayloadKey || null,
      feature_id: featureId,
      feature_label: featureLabel,
      community_id: toOptionalNumber(communityId),
      community_source: communitySource || null,
      community_confidence: toOptionalNumber(communityConfidence),
      som_cell: somCell,
      som_cell_x: somCellX,
      som_cell_y: somCellY,
      cluster_id: toOptionalNumber(clusterId),
      centroid_id: centroidId || null,
      content_hash: contentHash || null,
      chunk_id: chunkId || null,
      tree_node_id: treeNodeId || null,
      glyph_record_id: glyphRecordId || null,
      neo4j_node_id: neo4jNodeId || null,
      identity_lane: identityLane || null,
      identity_confidence: toOptionalNumber(identityConfidence),
      evidence_mode: evidenceMode || null,
      repair_status: repairStatus || null,
      lineage_version: lineageVersion || null,
      ledger_type: ledgerType || null,
      summary: summary || null,
      metadata,
      tags: Array.isArray(tags) ? tags : [],
      topology,
      centroid_keys: validCentroidKeys,
    };
    plans.push(
      {
        key: `bifrost:warm:v1:packet:${packetKey}`,
        ttl: 86400,
        value: base,
      },
      {
        key: `bifrost:warm:v1:feature:${featureId}`,
        ttl: 86400,
        value: {
          feature_id: featureId,
          feature_label: featureLabel,
          source_ref: sourceRef,
          source_ref_key: sourceRefKey || null,
          canonical_source_ref: canonicalSourceRef || null,
          community_id: base.community_id,
          som_cell: base.som_cell,
          cluster_id: base.cluster_id,
          centroid_id: base.centroid_id,
          qdrant_point_id: qdrantPointId || null,
          qdrant_collection: qdrantCollection || null,
          qdrant_payload_key: qdrantPayloadKey || null,
          content_hash: contentHash || null,
          chunk_id: chunkId || null,
          tree_node_id: treeNodeId || null,
          glyph_record_id: glyphRecordId || null,
          neo4j_node_id: neo4jNodeId || null,
          identity_lane: identityLane || null,
          identity_confidence: base.identity_confidence,
          evidence_mode: evidenceMode || null,
          repair_status: repairStatus || null,
          lineage_version: lineageVersion || null,
        },
      },
      {
        key: `ace:context:${packetKey}`,
        ttl: 3600,
        value: {
          packet_key: packetKey,
          source_ref: sourceRef,
          source_ref_key: sourceRefKey || null,
          canonical_source_ref: canonicalSourceRef || null,
          feature_id: featureId,
          feature_label: featureLabel,
          community_id: base.community_id,
          som_cell: base.som_cell,
          som_cell_x: base.som_cell_x,
          som_cell_y: base.som_cell_y,
          cluster_id: base.cluster_id,
          centroid_id: base.centroid_id,
          qdrant_point_id: qdrantPointId || null,
          qdrant_collection: qdrantCollection || null,
          qdrant_payload_key: qdrantPayloadKey || null,
          content_hash: contentHash || null,
          chunk_id: chunkId || null,
          tree_node_id: treeNodeId || null,
          glyph_record_id: glyphRecordId || null,
          neo4j_node_id: neo4jNodeId || null,
          identity_lane: identityLane || null,
          identity_confidence: base.identity_confidence,
          evidence_mode: evidenceMode || null,
          repair_status: repairStatus || null,
          lineage_version: lineageVersion || null,
          ledger_type: ledgerType || null,
          summary: summary || '',
        },
      },
      {
        key: `ace:feature:${featureId}`,
        ttl: 3600,
        value: {
          feature_id: featureId,
          feature_label: featureLabel,
          source_ref: sourceRef,
          community_id: base.community_id,
          som_cell: base.som_cell,
          som_cell_x: base.som_cell_x,
          som_cell_y: base.som_cell_y,
          lineage_version: lineageVersion || null,
        },
      },
      {
        key: centroidKeys.domain_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          domain_class: centroidKeys.domain_class,
          feature_id: featureId,
          source_ref: sourceRef,
          centroid_keys: centroidKeys,
        },
      },
      ...(centroidKeys.feature_centroid_key ? [{
        key: centroidKeys.feature_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          feature_id: featureId,
          feature_label: featureLabel,
          source_ref: sourceRef,
          centroid_keys: centroidKeys,
        },
      }] : []),
      ...(validCentroidKeys.kmeans_centroid_key ? [{
        key: validCentroidKeys.kmeans_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          kmeans_cluster: clusterId || null,
          source_ref: sourceRef,
          centroid_keys: validCentroidKeys,
        },
      }] : []),
      ...(validCentroidKeys.som_centroid_key ? [{
        key: validCentroidKeys.som_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          som_cell: base.som_cell,
          source_ref: sourceRef,
          centroid_keys: validCentroidKeys,
        },
      }] : []),
      ...(validCentroidKeys.community_centroid_key ? [{
        key: validCentroidKeys.community_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          community_id: communityId || null,
          source_ref: sourceRef,
          centroid_keys: validCentroidKeys,
        },
      }] : []),
      {
        key: `ace:summary:${packetKey}`,
        ttl: 3600,
        value: {
          packet_key: packetKey,
          summary: summary || '',
          source_ref: sourceRef,
          source_ref_key: sourceRefKey || null,
          canonical_source_ref: canonicalSourceRef || null,
          feature_id: featureId,
          feature_label: featureLabel,
          qdrant_point_id: qdrantPointId || null,
          lineage_version: lineageVersion || null,
        },
      },
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    cacheRuntime: {
      targetContainer: container ?? null,
      passwordConfigured: Boolean(redisPassword),
      writesPerformed: false,
    },
    limit: LIMIT,
    source: {
      table: sourceTable,
      rowsRead: rows.length,
      sourceAuthorityRepoId: SOURCE_AUTHORITY_REPO_ID,
      workspaceRevision: WORKSPACE_REVISION,
      exactSourceBindingJoin: true,
      admissionFunnel,
    },
    summary: {
      candidateRows: rows.length,
      packetKeysPlanned: plans.filter((plan) => plan.key.startsWith('bifrost:warm:v1:packet:')).length,
      featureKeysPlanned: plans.filter((plan) => plan.key.startsWith('bifrost:warm:v1:feature:')).length,
      aceKeysPlanned: plans.filter((plan) => plan.key.startsWith('ace:')).length,
      appliedWrites: 0,
      failures: 0,
    },
    plans: plans.map((plan) => ({
      key: plan.key,
      ttl: plan.ttl,
      source_ref: plan.value.source_ref ?? null,
      feature_id: plan.value.feature_id ?? null,
      feature_label: plan.value.feature_label ?? null,
      community_id: plan.value.community_id ?? null,
      som_cell: plan.value.som_cell ?? null,
    })),
    nextSafeAction: APPLY_REQUESTED
      ? 'Apply was requested, but this legacy warm path emits packet-key cache entries without candidate snapshot/ordinal-map identity; no writes are performed. Use the validated ACE packet residency owner after a current ContextManifest admission exists.'
      : plans.length === 0
        ? `No rows passed the exact source-binding join (source=${admissionFunnel.source_ref_rows ?? 0}, feature=${admissionFunnel.feature_rows ?? 0}, sourceRevision=${admissionFunnel.source_revision_rows ?? 0}, exactWorkspaceBinding=${admissionFunnel.workspace_revision_rows ?? 0}, fullyQualified=${admissionFunnel.fully_qualified_rows ?? 0}). Supply an explicit --workspace-revision=sha256:...; do not apply this legacy cache format.`
        : 'Review the dry-run plan only; these legacy packet-key entries are not eligible for apply without snapshot/ordinal-map identity.',
  };

  if (APPLY_REQUESTED) {
    report.mode = 'apply-blocked-legacy-identity';
    report.applyBlockedReason = 'REVISION_BOUND_ACE_PACKET_IDENTITY_REQUIRED';
  }

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(JSON.stringify({
    mode: report.mode,
    candidateRows: report.summary.candidateRows,
    appliedWrites: report.summary.appliedWrites,
    failures: report.summary.failures,
    passwordConfigured: Boolean(redisPassword),
  }, null, 2));
  if (report.applyBlockedReason) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
