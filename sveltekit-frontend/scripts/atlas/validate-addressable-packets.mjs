#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ADDRESSABLE_NDJSON,
  DOCS_DIR,
  PACKET_TABLES,
  ensureDirFor,
  loadPool,
  resolveTableColumns,
  tableExists,
} from './phase-20-packet-helpers.mjs';

const APPLY = process.argv.includes('--apply');
const REPORT_JSON = path.join(DOCS_DIR, 'phase-20-addressable-packets-validation.json');
const REPORT_MD = path.join(DOCS_DIR, 'phase-20-addressable-packets-validation.md');

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function coverage(count, total) {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

function statusFor(requiredOk, enrichmentOk) {
  if (!requiredOk) return 'FAIL';
  if (!enrichmentOk) return 'WARN';
  return 'PASS';
}

function isStructuralCoverageComplete(table, totalRows, packetCoverage, sourceRefCoverage, featureIdCoverage, featureLabelCoverage) {
  if (!table.exists) return false;
  if (table.requiredMissing.length > 0) return false;
  if (totalRows === 0) return true;
  return (
    packetCoverage >= 1 &&
    sourceRefCoverage >= 1 &&
    featureIdCoverage >= 1 &&
    featureLabelCoverage >= 1
  );
}

export async function main() {
  const pool = loadPool();
  try {
    const tableStats = [];
    let structuralOk = true;
    let enrichmentOk = true;

    for (const table of PACKET_TABLES) {
      const exists = await tableExists(pool, table);
      const columns = exists ? await resolveTableColumns(pool, table) : new Set();
      const requiredColumns = ['packet_key', 'source_ref', 'feature_id', 'feature_label', 'permissions', 'metadata', 'topology', 'vectors'];
      const topologyColumns = ['pagerank', 'betweenness', 'eigenvector', 'neo4j_node_id', 'redis_centroid_key'];
      const requiredMissing = requiredColumns.filter((column) => !columns.has(column));
      const topologyMissing = topologyColumns.filter((column) => !columns.has(column));

      if (!exists || requiredMissing.length > 0) structuralOk = false;

      const selectList = [
        'COUNT(*)::int AS total_rows',
        'COUNT(packet_key)::int AS packet_key_rows',
        'COUNT(source_ref)::int AS source_ref_rows',
        'COUNT(feature_id)::int AS feature_id_rows',
        'COUNT(feature_label)::int AS feature_label_rows',
        columns.has('permissions') ? 'COUNT(permissions)::int AS permissions_rows' : '0::int AS permissions_rows',
        columns.has('metadata') ? 'COUNT(metadata)::int AS metadata_rows' : '0::int AS metadata_rows',
        columns.has('topology') ? 'COUNT(topology)::int AS topology_rows' : '0::int AS topology_rows',
        columns.has('vectors') ? 'COUNT(vectors)::int AS vectors_rows' : '0::int AS vectors_rows',
        columns.has('pagerank') ? 'COUNT(pagerank)::int AS pagerank_rows' : '0::int AS pagerank_rows',
        columns.has('betweenness') ? 'COUNT(betweenness)::int AS betweenness_rows' : '0::int AS betweenness_rows',
        columns.has('eigenvector') ? 'COUNT(eigenvector)::int AS eigenvector_rows' : '0::int AS eigenvector_rows',
        columns.has('neo4j_node_id') ? 'COUNT(neo4j_node_id)::int AS neo4j_node_id_rows' : '0::int AS neo4j_node_id_rows',
        columns.has('redis_centroid_key') ? 'COUNT(redis_centroid_key)::int AS redis_centroid_key_rows' : '0::int AS redis_centroid_key_rows',
      ];

      const rowQuery = exists
        ? `SELECT ${selectList.join(', ')} FROM ${table}`
        : null;
      const rowStats = exists ? (await pool.query(rowQuery)).rows[0] : {};
      const totalRows = Number(rowStats?.total_rows ?? 0);
      const packetKeyRows = Number(rowStats?.packet_key_rows ?? 0);
      const sourceRefRows = Number(rowStats?.source_ref_rows ?? 0);
      const featureIdRows = Number(rowStats?.feature_id_rows ?? 0);
      const featureLabelRows = Number(rowStats?.feature_label_rows ?? 0);

      const packetCoverage = coverage(packetKeyRows, totalRows);
      const sourceRefCoverage = coverage(sourceRefRows, totalRows);
      const featureIdCoverage = coverage(featureIdRows, totalRows);
      const featureLabelCoverage = coverage(featureLabelRows, totalRows);
      const topologyCoverage = {
        pagerank: coverage(Number(rowStats?.pagerank_rows ?? 0), totalRows),
        betweenness: coverage(Number(rowStats?.betweenness_rows ?? 0), totalRows),
        eigenvector: coverage(Number(rowStats?.eigenvector_rows ?? 0), totalRows),
        neo4j_node_id: coverage(Number(rowStats?.neo4j_node_id_rows ?? 0), totalRows),
        redis_centroid_key: coverage(Number(rowStats?.redis_centroid_key_rows ?? 0), totalRows),
      };

      const structuralCoverageComplete = isStructuralCoverageComplete(
        { exists, requiredMissing },
        totalRows,
        packetCoverage,
        sourceRefCoverage,
        featureIdCoverage,
        featureLabelCoverage,
      );

      if (!structuralCoverageComplete) {
        structuralOk = false;
      }

      const enrichmentComplete =
        topologyCoverage.pagerank >= 0.95 &&
        topologyCoverage.betweenness >= 0.95 &&
        topologyCoverage.eigenvector >= 0.95 &&
        topologyCoverage.neo4j_node_id >= 0.95 &&
        topologyCoverage.redis_centroid_key >= 0.95;
      if (!enrichmentComplete) enrichmentOk = false;

      tableStats.push({
        table,
        exists,
        totalRows,
        requiredMissing,
        topologyMissing,
        packetCoverage,
        sourceRefCoverage,
        featureIdCoverage,
        featureLabelCoverage,
        permissionsCoverage: coverage(Number(rowStats?.permissions_rows ?? 0), totalRows),
        metadataCoverage: coverage(Number(rowStats?.metadata_rows ?? 0), totalRows),
        topologyCoverage,
        vectorsCoverage: coverage(Number(rowStats?.vectors_rows ?? 0), totalRows),
        status: totalRows === 0
          ? 'WARN'
          : statusFor(requiredMissing.length === 0 && exists && structuralCoverageComplete, enrichmentComplete),
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      applyMode: APPLY,
      structuralStatus: structuralOk ? 'PASS' : 'FAIL',
      enrichmentStatus: enrichmentOk ? 'PASS' : 'WARN',
      overallStatus: statusFor(structuralOk, enrichmentOk),
      tables: tableStats,
      addressableFile: await fileExists(ADDRESSABLE_NDJSON),
    };

    await ensureDirFor(REPORT_JSON);
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Phase 20 Addressable Packets Validation',
        '',
        `Generated: ${report.generatedAt}`,
        `Structural status: ${report.structuralStatus}`,
        `Enrichment status: ${report.enrichmentStatus}`,
        `Overall status: ${report.overallStatus}`,
        '',
        '| Table | Rows | Packet | Source Ref | Feature ID | Feature Label | Permissions | Metadata | Topology | Vectors | Status |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
        ...tableStats.map((table) => {
          return `| \`${table.table}\` | ${table.totalRows} | ${(table.packetCoverage * 100).toFixed(2)}% | ${(table.sourceRefCoverage * 100).toFixed(2)}% | ${(table.featureIdCoverage * 100).toFixed(2)}% | ${(table.featureLabelCoverage * 100).toFixed(2)}% | ${(table.permissionsCoverage * 100).toFixed(2)}% | ${(table.metadataCoverage * 100).toFixed(2)}% | ${(table.topologyCoverage.pagerank * 100).toFixed(2)}% / ${(table.topologyCoverage.betweenness * 100).toFixed(2)}% / ${(table.topologyCoverage.eigenvector * 100).toFixed(2)}% | ${(table.vectorsCoverage * 100).toFixed(2)}% | ${table.status} |`;
        }),
      ].join('\n'),
      'utf8',
    );

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      applyMode: APPLY,
      databaseAvailable: false,
      error: error instanceof Error ? error.message : String(error),
      structuralStatus: 'WARN',
      enrichmentStatus: 'WARN',
      overallStatus: 'WARN',
      tables: PACKET_TABLES.map((table) => ({
        table,
        exists: false,
        totalRows: 0,
        requiredMissing: ['database_unavailable'],
        topologyMissing: [],
        packetCoverage: 0,
        sourceRefCoverage: 0,
        featureIdCoverage: 0,
        featureLabelCoverage: 0,
        permissionsCoverage: 0,
        metadataCoverage: 0,
        topologyCoverage: {
          pagerank: 0,
          betweenness: 0,
          eigenvector: 0,
          neo4j_node_id: 0,
          redis_centroid_key: 0,
        },
        vectorsCoverage: 0,
        status: 'WARN',
      })),
      addressableFile: await fileExists(ADDRESSABLE_NDJSON),
    };
    await ensureDirFor(REPORT_JSON);
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Phase 20 Addressable Packets Validation',
        '',
        `Generated: ${report.generatedAt}`,
        `Structural status: ${report.structuralStatus}`,
        `Enrichment status: ${report.enrichmentStatus}`,
        `Overall status: ${report.overallStatus}`,
        '',
        `Database available: no`,
        `Error: ${report.error}`,
      ].join('\n'),
      'utf8',
    );
    console.log(JSON.stringify({ ok: false, report }, null, 2));
  } finally {
    await pool.end().catch(() => {});
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entrypoint && import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error('[atlas:packets:validate] Failed:', error);
    process.exitCode = 1;
  });
}
