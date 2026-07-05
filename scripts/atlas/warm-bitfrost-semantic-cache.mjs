#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packetFieldValue, safeJsonObject } from './lib/adaptive-schema.mjs';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';
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
        and table_name in ('atlas_higher_hop_index', 'atlas_feature_packets', 'atlas_codebase_packets', 'atlas_packets')
      order by case table_name
        when 'atlas_higher_hop_index' then 1
        when 'atlas_feature_packets' then 2
        when 'atlas_codebase_packets' then 3
        else 4
      end
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

function writeKey(container, key, value, ttlSeconds, password = '') {
  if (!container) {
    return { ok: false, status: 1, stderr: 'No Redis/Valkey container found' };
  }
  const setResult = runRedisCli(container, ['-x', 'SET', key], password, value);
  if (!setResult.ok) return setResult;
  const expireResult = runRedisCli(container, ['EXPIRE', key, String(ttlSeconds)], password);
  return expireResult.ok ? expireResult : expireResult;
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
  ].join('\n');
}

async function main() {
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
  const col = (name, alias = name) => (columnSet.has(name) ? `${name}::text as ${alias}` : `null::text as ${alias}`);
  const whereCandidates = [
    columnSet.has('source_ref_key') ? 'source_ref_key' : null,
    columnSet.has('source_ref') ? 'source_ref' : null,
    columnSet.has('file_path') ? 'file_path' : null,
    columnSet.has('packet_key') ? 'packet_key' : null,
  ].filter(Boolean);
  const sourceClause = whereCandidates.length > 0
    ? `nullif(btrim(coalesce(${whereCandidates.join(', ')})::text), '') is not null`
    : 'true';
  const featureClause = columnSet.has('feature_id') ? "nullif(btrim(feature_id::text), '') is not null" : 'false';
  const sql = `
    select
      ${col('packet_key')},
      ${col('source_ref_key')},
      ${col('source_ref')},
      ${col('canonical_source_ref')},
      ${col('file_path')},
      ${col('feature_id')},
      ${col('feature_label')},
      ${col('community_id')},
      ${col('community_source')},
      ${col('community_confidence')},
      ${col('som_cluster')},
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
      ${col('metadata')}
    from public.${sourceTable}
    where ${sourceClause} and ${featureClause}
    order by
      ${columnSet.has('community_id') ? 'community_id asc nulls last,' : ''}
      ${columnSet.has('som_cluster') ? 'som_cluster asc nulls last,' : ''}
      ${columnSet.has('identity_confidence') ? 'identity_confidence desc nulls last,' : ''}
      ${columnSet.has('packet_key') ? 'packet_key asc' : '1'}
      ${LIMIT > 0 ? `limit ${LIMIT}` : ''}
  `;

  const rows = parseTsvRows(runPsql(sql), [
    'packet_key',
    'source_ref_key',
    'source_ref',
    'canonical_source_ref',
    'file_path',
    'feature_id',
    'feature_label',
    'community_id',
    'community_source',
    'community_confidence',
    'som_cluster',
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
  ]).map((row) => ({
    packet_key: normalizeText(row.packet_key),
    source_ref_key: normalizeSourceRef(row.source_ref_key),
    source_ref: normalizeSourceRef(row.source_ref || row.canonical_source_ref || row.file_path || row.source_ref_key),
    canonical_source_ref: normalizeSourceRef(row.canonical_source_ref || row.source_ref || row.source_ref_key),
    file_path: normalizeText(row.file_path),
    feature_id: normalizeText(row.feature_id),
    feature_label: normalizeText(row.feature_label),
    community_id: normalizeText(row.community_id),
    community_source: normalizeText(row.community_source),
    community_confidence: normalizeText(row.community_confidence),
    som_cluster: normalizeText(row.som_cluster),
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
    const somCluster = String(packetFieldValue(row, 'som_cluster') ?? packetFieldValue(row, 'cluster_id') ?? row.som_cluster ?? row.cluster_id ?? '').trim();
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
      som_cell: packetFieldValue(row, 'som_cluster') ?? row.som_cluster ?? null,
    });
    const centroidKeys = deriveCentroidKeys({
      ...row,
      som_cell: packetFieldValue(row, 'som_cluster') ?? row.som_cluster ?? null,
    });

    const base = {
      packet_key: packetKey,
      source_ref: sourceRef,
      source_ref_key: sourceRefKey || null,
      canonical_source_ref: canonicalSourceRef || null,
      qdrant_point_id: qdrantPointId || null,
      qdrant_collection: qdrantCollection || null,
      qdrant_payload_key: qdrantPayloadKey || null,
      feature_id: featureId,
      feature_label: featureLabel,
      community_id: toOptionalNumber(communityId),
      community_source: communitySource || null,
      community_confidence: toOptionalNumber(communityConfidence),
      som_cluster: toOptionalNumber(somCluster),
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
      centroid_keys: centroidKeys,
    };
    plans.push(
      {
        key: `bifrost:sem:packet:${packetKey}`,
        ttl: 86400,
        value: base,
      },
      {
        key: `bifrost:sem:feature:${featureId}`,
        ttl: 86400,
        value: {
          feature_id: featureId,
          feature_label: featureLabel,
          source_ref: sourceRef,
          source_ref_key: sourceRefKey || null,
          canonical_source_ref: canonicalSourceRef || null,
          community_id: base.community_id,
          som_cluster: base.som_cluster,
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
          som_cluster: base.som_cluster,
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
          som_cluster: base.som_cluster,
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
      ...(centroidKeys.kmeans_centroid_key ? [{
        key: centroidKeys.kmeans_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          kmeans_cluster: clusterId || somCluster || null,
          source_ref: sourceRef,
          centroid_keys: centroidKeys,
        },
      }] : []),
      ...(centroidKeys.som_centroid_key ? [{
        key: centroidKeys.som_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          som_cluster: somCluster || null,
          source_ref: sourceRef,
          centroid_keys: centroidKeys,
        },
      }] : []),
      ...(centroidKeys.community_centroid_key ? [{
        key: centroidKeys.community_centroid_key,
        ttl: 7200,
        value: {
          packet_key: packetKey,
          community_id: communityId || null,
          source_ref: sourceRef,
          centroid_keys: centroidKeys,
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
    limit: LIMIT,
    source: {
      table: sourceTable,
      rowsRead: rows.length,
    },
    summary: {
      candidateRows: rows.length,
      packetKeysPlanned: plans.filter((plan) => plan.key.startsWith('bifrost:sem:packet:')).length,
      featureKeysPlanned: plans.filter((plan) => plan.key.startsWith('bifrost:sem:feature:')).length,
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
      som_cluster: plan.value.som_cluster ?? null,
    })),
    nextSafeAction: APPLY_REQUESTED
      ? 'Warm writes have been requested; rerun the audit to confirm hot cache families exist.'
      : 'Review the dry-run plan, then rerun with --apply to materialize the hot Bitfrost families.',
  };

  if (APPLY_REQUESTED) {
    let appliedWrites = 0;
    const failures = [];
    for (const plan of plans) {
      const payload = JSON.stringify(plan.value);
      const setResult = writeKey(container, plan.key, payload, plan.ttl, redisPassword);
      if (!setResult.ok) {
        failures.push({ key: plan.key, status: setResult.status, error: setResult.stderr.trim() });
        continue;
      }
      appliedWrites += 1;
    }
    report.summary.appliedWrites = appliedWrites;
    report.summary.failures = failures.length;
    report.failures = failures;
    report.nextSafeAction = failures.length === 0
      ? 'Hot cache families were warmed; rerun the Bitfrost audit to verify key counts and TTL samples.'
      : 'Some warm writes failed; inspect the failures and rerun the apply pass.';
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
