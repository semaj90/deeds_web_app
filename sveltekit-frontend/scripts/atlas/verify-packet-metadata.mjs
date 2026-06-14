#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'packet-metadata-verify.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'packet-metadata-verify.md');

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);

const TABLES = [
  'atlas_packets',
  'nes_chrom_packets',
  'route_runtime_packets',
  'task_semantic_packets',
  'concept_records',
];

const COLUMNS = [
  'packet_key',
  'source_ref',
  'feature_id',
  'feature_label',
  'metadata',
  'qdrant_tag_id',
  'cluster_id',
  'community_id',
  'som_cluster',
  'domain_class',
  'domain',
  'neo4j_node',
  'redis_hot_key',
];

function pct(part, total) {
  return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}

async function tableExists(pool, tableName) {
  const { rows } = await pool.query(
    `
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = $1
      limit 1
    `,
    [tableName],
  );
  return rows.length > 0;
}

async function tableColumns(pool, tableName) {
  const { rows } = await pool.query(
    `
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [tableName],
  );
  return rows;
}

async function tableCoverage(pool, tableName) {
  const columns = await tableColumns(pool, tableName);
  const columnNames = new Set(columns.map((column) => column.column_name));
  const availableColumns = COLUMNS.filter((column) => columnNames.has(column));

  if (availableColumns.length === 0) {
    return {
      tableName,
      exists: true,
      rowCount: 0,
      presentColumns: [],
      coverage: {},
      notes: ['No packet metadata columns found'],
    };
  }

  const selectParts = ['COUNT(*)::int AS total'];
  for (const column of availableColumns) {
    selectParts.push(`COUNT(*) FILTER (WHERE ${column} IS NOT NULL)::int AS ${column}_count`);
  }

  const { rows } = await pool.query(`SELECT ${selectParts.join(', ')} FROM ${tableName}`);
  const row = rows[0] ?? {};
  const total = Number(row.total ?? 0);
  const coverage = {};
  for (const column of availableColumns) {
    const count = Number(row[`${column}_count`] ?? 0);
    coverage[column] = {
      count,
      pct: pct(count, total),
    };
  }

  return {
    tableName,
    exists: true,
    rowCount: total,
    presentColumns: availableColumns,
    coverage,
    notes: [],
  };
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1, statement_timeout: 10_000 });
  const startedAt = new Date().toISOString();

  let report;
  try {
    const tablePresence = await Promise.all(TABLES.map(async (tableName) => ({
      tableName,
      exists: await tableExists(pool, tableName),
    })));

    const presentTables = tablePresence.filter((table) => table.exists).map((table) => table.tableName);
    const missingTables = tablePresence.filter((table) => !table.exists).map((table) => table.tableName);
    const tableReports = [];
    for (const tableName of presentTables) {
      tableReports.push(await tableCoverage(pool, tableName));
    }

    const packetTables = tableReports.filter((table) => table.presentColumns.includes('feature_id') || table.presentColumns.includes('source_ref') || table.presentColumns.includes('metadata'));
    const featureIdCoverage = packetTables.reduce((sum, table) => sum + (table.coverage.feature_id?.count ?? 0), 0);
    const sourceRefCoverage = packetTables.reduce((sum, table) => sum + (table.coverage.source_ref?.count ?? 0), 0);
    const metadataCoverage = packetTables.reduce((sum, table) => sum + (table.coverage.metadata?.count ?? 0), 0);
    const rowTotal = packetTables.reduce((sum, table) => sum + table.rowCount, 0);

    const coveragePct = {
      feature_id: pct(featureIdCoverage, rowTotal),
      source_ref: pct(sourceRefCoverage, rowTotal),
      metadata: pct(metadataCoverage, rowTotal),
    };

    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      databaseUrl: DATABASE_URL.replace(/:[^:@/]+@/, ':***@'),
      tables: tableReports,
      missingTables,
      packetTables: packetTables.map((table) => table.tableName),
      summary: {
        packetTablesChecked: packetTables.length,
        rowTotal,
        featureIdCoverage,
        sourceRefCoverage,
        metadataCoverage,
        coveragePct,
      },
    };
  } catch (error) {
    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      databaseUrl: DATABASE_URL.replace(/:[^:@/]+@/, ':***@'),
      error: error instanceof Error ? error.message : String(error),
      tables: [],
      missingTables: [],
      packetTables: [],
      summary: {
        packetTablesChecked: 0,
        rowTotal: 0,
        featureIdCoverage: 0,
        sourceRefCoverage: 0,
        metadataCoverage: 0,
        coveragePct: {
          feature_id: 0,
          source_ref: 0,
          metadata: 0,
        },
      },
    };
  } finally {
    await pool.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Packet Metadata Verify',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '## Summary',
      '',
      `- Packet tables checked: ${report.summary.packetTablesChecked}`,
      `- Row total: ${report.summary.rowTotal}`,
      `- feature_id coverage: ${report.summary.coveragePct.feature_id}%`,
      `- source_ref coverage: ${report.summary.coveragePct.source_ref}%`,
      `- metadata coverage: ${report.summary.coveragePct.metadata}%`,
      '',
      '## Tables',
      '',
      ...report.tables.map((table) => {
        const coverage = table.coverage ?? {};
        const feature = coverage.feature_id?.pct ?? 0;
        const source = coverage.source_ref?.pct ?? 0;
        const metadata = coverage.metadata?.pct ?? 0;
        return `- ${table.tableName}: rows=${table.rowCount}, feature_id=${feature}%, source_ref=${source}%, metadata=${metadata}%`;
      }),
      '',
      ...(report.missingTables.length > 0 ? ['## Missing Tables', '', ...report.missingTables.map((name) => `- ${name}`)] : []),
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify({ ok: true, report }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error('[atlas:feature-metadata:verify] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
