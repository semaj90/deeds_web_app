#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ADDRESSABLE_MANIFEST,
  ADDRESSABLE_NDJSON,
  DOCS_DIR,
  PACKET_TABLES,
  buildBm25Text,
  buildTopology,
  buildVectors,
  ensureDirFor,
  firstNumber,
  firstText,
  loadPool,
  mergeObjects,
  normalizeCanonicalSourceRef,
  normalizeText,
  resolveTableColumns,
  tableExists,
  toNullableText,
} from './phase-20-packet-helpers.mjs';

const APPLY = process.argv.includes('--apply');
const LIMIT = parseLimit(process.argv.slice(2));
const REPORT_JSON = path.join(DOCS_DIR, 'packet-reader-writer-audit.json');
const REPORT_MD = path.join(DOCS_DIR, 'packet-reader-writer-audit.md');

function parseLimit(argv) {
  const direct = argv.find((arg) => arg.startsWith('--limit='));
  const value = Number.parseInt(direct?.split('=')[1] ?? process.env.npm_config_limit ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function defaultPermissions(sourceRef) {
  const normalized = String(sourceRef ?? '').toLowerCase();
  return {
    visibility: 'internal',
    can_write: false,
    can_execute: normalized.includes('runtime') || normalized.includes('tool'),
    can_export: false,
    source: normalized.includes('runtime') ? 'runtime_capture' : 'repo_index',
  };
}

function normalizeArray(values) {
  return [...new Set(asArray(values).map((value) => normalizeText(value)).filter(Boolean))];
}

function selectField(columns, column, alias = column, fallbackType = 'text') {
  return columns.has(column) ? `${column} AS ${alias}` : `NULL::${fallbackType} AS ${alias}`;
}

function selectJsonField(columns, column, alias = column) {
  return selectField(columns, column, alias, 'jsonb');
}

function selectTextArrayField(columns, column, alias = column) {
  return selectField(columns, column, alias, 'text[]');
}

function selectNumericField(columns, column, alias = column) {
  return selectField(columns, column, alias, 'double precision');
}

function buildSelectList(columns, tableName) {
  if (tableName === 'atlas_packets') {
    return [
      selectField(columns, 'packet_id'),
      selectField(columns, 'packet_key'),
      selectField(columns, 'source_ref'),
      selectField(columns, 'directory_path'),
      selectField(columns, 'file_path'),
      selectField(columns, 'function_symbol'),
      selectField(columns, 'feature_id'),
      selectField(columns, 'feature_label'),
      selectField(columns, 'community_id'),
      selectField(columns, 'community_source'),
      selectNumericField(columns, 'community_confidence'),
      selectTextArrayField(columns, 'concept_ids'),
      selectField(columns, 'cluster_id'),
      selectField(columns, 'embedding', 'embedding', 'text'),
      selectJsonField(columns, 'payload'),
      selectJsonField(columns, 'permissions'),
      selectJsonField(columns, 'metadata'),
      selectJsonField(columns, 'topology'),
      selectJsonField(columns, 'vectors'),
      selectField(columns, 'summary'),
      selectField(columns, 'source_kind'),
      selectField(columns, 'source_path'),
      selectField(columns, 'source_ref_key'),
      selectNumericField(columns, 'reward_prior'),
      selectNumericField(columns, 'pagerank'),
      selectNumericField(columns, 'betweenness'),
      selectNumericField(columns, 'eigenvector'),
      selectField(columns, 'neo4j_node_id'),
      selectField(columns, 'redis_centroid_key'),
      selectField(columns, 'domain_class'),
      selectTextArrayField(columns, 'tags'),
      selectField(columns, 'lineage_version'),
      selectField(columns, 'ledger_type'),
      selectField(columns, 'canonical'),
      selectField(columns, 'payload_backfilled_at'),
      selectField(columns, 'som_row'),
      selectField(columns, 'som_col'),
      selectField(columns, 'som_index'),
      selectField(columns, 'kmeans_cluster'),
      selectField(columns, 'identity_lane'),
      selectField(columns, 'qdrant_point_id'),
      selectField(columns, 'qdrant_collection'),
      selectField(columns, 'qdrant_vector_dim'),
      selectNumericField(columns, 'identity_confidence'),
      selectField(columns, 'created_at'),
      selectField(columns, 'updated_at'),
    ];
  }

  if (tableName === 'nes_chrom_packets') {
    return [
      selectField(columns, 'id'),
      selectField(columns, 'packet_key'),
      selectField(columns, 'query_hash'),
      selectField(columns, 'chunk_id'),
      selectField(columns, 'source_ref'),
      selectJsonField(columns, 'source_refs'),
      selectField(columns, 'feature_id'),
      selectField(columns, 'feature_label'),
      selectField(columns, 'packet_type'),
      selectField(columns, 'lane'),
      selectField(columns, 'model'),
      selectField(columns, 'summary'),
      selectField(columns, 'file_path'),
      selectField(columns, 'community_id'),
      selectNumericField(columns, 'community_confidence'),
      selectField(columns, 'community_source'),
      selectField(columns, 'domain_class'),
      selectJsonField(columns, 'permissions'),
      selectField(columns, 'pagerank'),
      selectField(columns, 'betweenness'),
      selectField(columns, 'eigenvector'),
      selectField(columns, 'neo4j_node_id'),
      selectField(columns, 'redis_centroid_key'),
      selectField(columns, 'ledger_type'),
      selectField(columns, 'lineage_version'),
      selectJsonField(columns, 'metadata'),
      selectJsonField(columns, 'topology'),
      selectJsonField(columns, 'vectors'),
      selectTextArrayField(columns, 'tags'),
      selectField(columns, 'canonical'),
      selectField(columns, 'identity_lane'),
      selectField(columns, 'payload_backfilled_at'),
      selectField(columns, 'som_row'),
      selectField(columns, 'som_col'),
      selectField(columns, 'som_index'),
      selectField(columns, 'kmeans_cluster'),
      selectJsonField(columns, 'payload'),
      selectField(columns, 'embedding', 'embedding', 'text'),
      selectField(columns, 'qdrant_point_id'),
      selectField(columns, 'kag_dag_run_id'),
      selectField(columns, 'kag_node_key'),
      selectField(columns, 'token_budget'),
      selectTextArrayField(columns, 'feature_ids'),
      selectField(columns, 'som_cluster'),
      selectTextArrayField(columns, 'lane_ids'),
      selectField(columns, 'source_ref_id'),
      selectField(columns, 'feature_code'),
      selectField(columns, 'som_code'),
      selectField(columns, 'confidence_score'),
      selectField(columns, 'packet_zstd', 'packet_zstd', 'text'),
      selectField(columns, 'created_at'),
      selectField(columns, 'updated_at'),
    ];
  }

  return [
    selectField(columns, 'packet_key'),
    selectField(columns, 'source_ref'),
    selectField(columns, 'feature_id'),
    selectField(columns, 'feature_label'),
    selectField(columns, 'packet_type'),
    selectField(columns, 'community_id'),
    selectField(columns, 'community_source'),
    selectNumericField(columns, 'community_confidence'),
    selectField(columns, 'file_path'),
    selectField(columns, 'tree_node_id'),
    selectField(columns, 'som_cluster'),
    selectJsonField(columns, 'permissions'),
    selectJsonField(columns, 'metadata'),
    selectJsonField(columns, 'topology'),
    selectJsonField(columns, 'vectors'),
    selectNumericField(columns, 'pagerank'),
    selectNumericField(columns, 'betweenness'),
    selectNumericField(columns, 'eigenvector'),
    selectField(columns, 'lineage_version'),
    selectField(columns, 'ledger_type'),
    selectField(columns, 'neo4j_node_id'),
    selectField(columns, 'redis_centroid_key'),
    selectField(columns, 'created_at'),
    selectField(columns, 'updated_at'),
  ];
}

function standardizePacket(tableName, row) {
  const payload = mergeObjects(row.payload);
  const metadata = mergeObjects(row.metadata, payload.metadata);
  const topology = mergeObjects(row.topology, payload.topology, buildTopology(row));
  const vectors = mergeObjects(row.vectors, payload.vectors, buildVectors(row));
  const permissions = mergeObjects(row.permissions, payload.permissions);

  const sourceRef = firstText(
    row.source_ref,
    row.sourceRefs?.[0],
    row.source_ref_key,
    row.source_path,
    row.file_path,
    metadata.source_ref,
    metadata.sourceRef,
    metadata.canonicalSourceRef,
    payload.source_ref,
    payload.sourceRef,
    payload.canonicalSourceRef,
  );
  const canonicalSourceRef = normalizeCanonicalSourceRef(sourceRef);
  const packetKey = firstText(row.packet_key, row.packetKey, payload.packet_key, payload.packetKey);
  const featureId = firstText(row.feature_id, row.featureId, payload.feature_id, payload.featureId) || canonicalSourceRef || packetKey;
  const featureLabel = firstText(row.feature_label, row.featureLabel, payload.feature_label, payload.featureLabel, featureId);
  const filePath = firstText(row.file_path, row.filePath, payload.file_path, payload.filePath, payload.path, metadata.file_path, metadata.filePath);
  const directoryPath = firstText(row.directory_path, row.directoryPath, metadata.directory_path, metadata.directoryPath) || (filePath ? path.posix.dirname(filePath.replace(/\\/g, '/')) : '');
  const packetType = firstText(row.packet_type, row.packetType, payload.packet_type, payload.packetType, tableName);
  const tags = normalizeArray(row.tags ?? payload.tags);
  const laneIds = normalizeArray(row.lane_ids ?? row.laneIds ?? payload.lane_ids ?? payload.laneIds ?? row.identity_lane);
  const qdrantPointId = firstText(row.qdrant_point_id, row.qdrantPointId, payload.qdrant_point_id, payload.qdrantPointId);
  const qdrantCollection = firstText(row.qdrant_collection, row.qdrantCollection, payload.qdrant_collection, payload.qdrantCollection);
  const communityId = firstNumber(row.community_id, row.communityId, payload.community_id, payload.communityId);
  const communityConfidence = firstNumber(row.community_confidence, row.communityConfidence, payload.community_confidence, payload.communityConfidence);
  const somCluster = firstNumber(row.som_cluster, row.somCluster, payload.som_cluster, payload.somCluster);
  const pagerank = firstNumber(row.pagerank, payload.pagerank);
  const betweenness = firstNumber(row.betweenness, payload.betweenness);
  const eigenvector = firstNumber(row.eigenvector, payload.eigenvector);
  const neo4jNodeId = firstText(row.neo4j_node_id, row.neo4jNodeId, payload.neo4j_node_id, payload.neo4jNodeId);
  const redisCentroidKey = firstText(row.redis_centroid_key, row.redisCentroidKey, payload.redis_centroid_key, payload.redisCentroidKey);
  const summary = firstText(row.summary, payload.summary) || '';

  const record = {
    packet_source_table: tableName,
    packet_id: firstText(row.packet_id, row.id, payload.packet_id),
    packet_key: packetKey,
    packet_type: packetType,
    source_ref: sourceRef,
    canonical_source_ref: canonicalSourceRef || sourceRef,
    feature_id: featureId,
    feature_label: featureLabel,
    file_path: filePath,
    directory_path: directoryPath || '',
    summary,
    bm25_text: buildBm25Text({
      feature_label: featureLabel,
      feature_id: featureId,
      summary,
      source_ref: sourceRef,
      file_path: filePath,
      tags,
      lane_ids: laneIds,
    }),
    tags,
    lane_ids: laneIds,
    permissions: permissions && Object.keys(permissions).length > 0 ? permissions : defaultPermissions(sourceRef),
    metadata: {
      ...metadata,
      packet_source_table: tableName,
      packet_type: packetType,
      file_path: filePath,
      directory_path: directoryPath || '',
      source_ref: sourceRef,
      canonical_source_ref: canonicalSourceRef || sourceRef,
      feature_id: featureId,
      feature_label: featureLabel,
      community_id: communityId,
      community_confidence: communityConfidence,
    },
    topology: {
      ...topology,
      community_id: communityId,
      community_confidence: communityConfidence,
      som_cluster: somCluster,
      pagerank,
      betweenness,
      eigenvector,
      neo4j_node_id: neo4jNodeId,
      redis_centroid_key: redisCentroidKey,
    },
    vectors: {
      ...vectors,
      qdrant_point_id: qdrantPointId,
      qdrant_collection: qdrantCollection,
      qdrant_vector_dim: row.qdrant_vector_dim ?? row.qdrantVectorDim ?? null,
      embedding: row.embedding ?? payload.embedding ?? null,
      latent_64: row.latent_64 ?? row.latent64 ?? payload.latent_64 ?? payload.latent64 ?? null,
    },
    community_id: communityId,
    community_confidence: communityConfidence,
    som_cluster: somCluster,
    pagerank,
    betweenness,
    eigenvector,
    neo4j_node_id: neo4jNodeId,
    redis_centroid_key: redisCentroidKey,
    qdrant_point_id: qdrantPointId,
    qdrant_collection: qdrantCollection,
    qdrant_vector_dim: row.qdrant_vector_dim ?? row.qdrantVectorDim ?? null,
    canonical: row.canonical ?? payload.canonical ?? false,
    lineage_version: row.lineage_version ?? row.lineageVersion ?? payload.lineage_version ?? payload.lineageVersion ?? 'packet-identity-v1',
    ledger_type: row.ledger_type ?? row.ledgerType ?? payload.ledger_type ?? payload.ledgerType ?? 'atlas:feature',
    topology_version: topology.topology_version ?? 'phase-20-v1',
    packet_kind: row.packet_kind ?? row.packetKind ?? packetType,
  };

  return record;
}

async function fetchTableRows(pool, tableName) {
  if (!(await tableExists(pool, tableName))) {
    return [];
  }
  const columns = await resolveTableColumns(pool, tableName);
  const selectList = buildSelectList(columns, tableName);
  const orderBy = columns.has('updated_at')
    ? 'ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, 1'
    : columns.has('created_at')
      ? 'ORDER BY created_at DESC NULLS LAST, 1'
      : 'ORDER BY 1';
  const limitClause = LIMIT ? 'LIMIT $1' : '';
  const query = `SELECT ${selectList.join(', ')} FROM ${tableName} ${orderBy} ${limitClause}`.trim();
  const params = LIMIT ? [LIMIT] : [];
  const { rows } = await pool.query(query, params);
  return rows.map((row) => standardizePacket(tableName, row));
}

function buildReport(records, tableStats) {
  const byTable = {};
  for (const stat of tableStats) {
    byTable[stat.table] = stat;
  }

  const coverage = {
    packet_key: records.filter((row) => toNullableText(row.packet_key)).length,
    source_ref: records.filter((row) => toNullableText(row.source_ref)).length,
    feature_id: records.filter((row) => toNullableText(row.feature_id)).length,
    feature_label: records.filter((row) => toNullableText(row.feature_label)).length,
    permissions: records.filter((row) => row.permissions && Object.keys(row.permissions).length > 0).length,
    metadata: records.filter((row) => row.metadata && Object.keys(row.metadata).length > 0).length,
    topology: records.filter((row) => row.topology && Object.keys(row.topology).length > 0).length,
    vectors: records.filter((row) => row.vectors && Object.keys(row.vectors).length > 0).length,
    qdrant_point_id: records.filter((row) => toNullableText(row.qdrant_point_id)).length,
    som_cluster: records.filter((row) => row.som_cluster !== null && row.som_cluster !== undefined).length,
  };

  const totalRows = records.length;
  return {
    generatedAt: new Date().toISOString(),
    applyMode: APPLY,
    totalRows,
    tableStats,
    byTable,
    coverage,
    outputFiles: APPLY ? {
      ndjson: ADDRESSABLE_NDJSON,
      manifest: ADDRESSABLE_MANIFEST,
    } : {},
  };
}

function writeNdjson(records) {
  const lines = records.map((record) => JSON.stringify(record));
  return fs.writeFile(ADDRESSABLE_NDJSON, `${lines.join('\n')}\n`, 'utf8');
}

function writeManifest(records, report) {
  const manifest = {
    generatedAt: report.generatedAt,
    totalRows: records.length,
    packetTables: [...new Set(records.map((record) => record.packet_source_table))],
    records: records.map((record) => ({
      packet_key: record.packet_key,
      packet_source_table: record.packet_source_table,
      source_ref: record.source_ref,
      feature_id: record.feature_id,
      qdrant_point_id: record.qdrant_point_id ?? null,
      qdrant_collection: record.qdrant_collection ?? null,
    })),
  };
  return fs.writeFile(ADDRESSABLE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function writeReport(report) {
  const md = [
    '# Packet Reader / Writer Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Apply mode: ${report.applyMode ? 'yes' : 'no'}`,
    `Rows: ${report.totalRows}`,
    '',
    '## Coverage',
    '',
    `- packet_key: ${report.coverage.packet_key}/${report.totalRows}`,
    `- source_ref: ${report.coverage.source_ref}/${report.totalRows}`,
    `- feature_id: ${report.coverage.feature_id}/${report.totalRows}`,
    `- feature_label: ${report.coverage.feature_label}/${report.totalRows}`,
    `- permissions envelope: ${report.coverage.permissions}/${report.totalRows}`,
    `- metadata envelope: ${report.coverage.metadata}/${report.totalRows}`,
    `- topology envelope: ${report.coverage.topology}/${report.totalRows}`,
    `- vectors envelope: ${report.coverage.vectors}/${report.totalRows}`,
    `- qdrant_point_id: ${report.coverage.qdrant_point_id}/${report.totalRows}`,
    `- som_cluster: ${report.coverage.som_cluster}/${report.totalRows}`,
    '',
    '## Tables',
    '',
    ...Object.values(report.tableStats).map(
      (table) => `- ${table.table}: ${table.rows} rows (${table.addressableRows} addressable)`,
    ),
  ].join('\n');

  return Promise.all([
    fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(REPORT_MD, `${md}\n`, 'utf8'),
  ]);
}

export async function main() {
  const pool = loadPool();
  const startedAt = new Date().toISOString();
  try {
    const tableStats = [];
    const records = [];

    for (const table of PACKET_TABLES) {
      const rows = await fetchTableRows(pool, table);
      tableStats.push({ table, rows: rows.length, addressableRows: rows.length });
      records.push(...rows);
    }

    const report = buildReport(records, tableStats);
    if (APPLY) {
      await ensureDirFor(ADDRESSABLE_NDJSON);
      await writeNdjson(records);
      await writeManifest(records, report);
    }
    await writeReport(report);

    console.log(
      JSON.stringify(
        {
          ok: true,
          startedAt,
          apply: APPLY,
          totalRows: report.totalRows,
          tableStats,
          output: APPLY ? { ndjson: ADDRESSABLE_NDJSON, manifest: ADDRESSABLE_MANIFEST } : null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      applyMode: APPLY,
      databaseAvailable: false,
      error: error instanceof Error ? error.message : String(error),
      totalRows: 0,
      tableStats: PACKET_TABLES.map((table) => ({ table, rows: 0, addressableRows: 0 })),
      coverage: {
        packet_key: 0,
        source_ref: 0,
        feature_id: 0,
        feature_label: 0,
        permissions: 0,
        metadata: 0,
        topology: 0,
        vectors: 0,
        qdrant_point_id: 0,
        som_cluster: 0,
      },
      outputFiles: {},
    };
    await writeReport(report);
    console.log(JSON.stringify({ ok: false, report }, null, 2));
  } finally {
    await pool.end().catch(() => {});
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entrypoint && import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error('[atlas:packets:materialize] Failed:', error);
    process.exitCode = 1;
  });
}
