#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ADDRESSABLE_NDJSON,
  BACKFILL_REPORT_JSON,
  BACKFILL_REPORT_MD,
  DOCS_DIR,
  PACKET_TABLES,
  ensureDirFor,
  firstNumber,
  firstText,
  loadPool,
  mergeObjects,
} from './phase-20-packet-helpers.mjs';

const APPLY = process.argv.includes('--apply');
const LIMIT = parseLimit(process.argv.slice(2));

function parseLimit(argv) {
  const direct = argv.find((arg) => arg.startsWith('--limit='));
  const value = Number.parseInt(direct?.split('=')[1] ?? process.env.npm_config_limit ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseNdjson(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function pickRecordFields(record) {
  const payload = mergeObjects(record.permissions, record.metadata, record.topology, record.vectors);
  return {
    permissions: record.permissions ?? {},
    metadata: record.metadata ?? {},
    topology: record.topology ?? {},
    vectors: record.vectors ?? {},
    pagerank: firstNumber(record.pagerank, payload.pagerank),
    betweenness: firstNumber(record.betweenness, payload.betweenness),
    eigenvector: firstNumber(record.eigenvector, payload.eigenvector),
    neo4j_node_id: firstText(record.neo4j_node_id, payload.neo4j_node_id, payload.neo4jNodeId),
    redis_centroid_key: firstText(record.redis_centroid_key, payload.redis_centroid_key, payload.redisCentroidKey),
  };
}

async function updatePacket(pool, tableName, record) {
  const fields = pickRecordFields(record);
  const params = [
    record.packet_key,
    JSON.stringify(fields.permissions ?? {}),
    JSON.stringify(fields.metadata ?? {}),
    JSON.stringify(fields.topology ?? {}),
    JSON.stringify(fields.vectors ?? {}),
    fields.pagerank,
    fields.betweenness,
    fields.eigenvector,
    fields.neo4j_node_id,
    fields.redis_centroid_key,
  ];

  if (tableName === 'atlas_feature_packets') {
    const sql = `
      UPDATE atlas_feature_packets
      SET permissions = $2::jsonb,
          metadata = $3::jsonb,
          topology = $4::jsonb,
          vectors = $5::jsonb,
          pagerank = $6,
          betweenness = $7,
          eigenvector = $8,
          neo4j_node_id = $9,
          redis_centroid_key = $10,
          updated_at = NOW()
      WHERE packet_key = $1
    `;
    return pool.query(sql, params);
  }

  if (tableName === 'nes_chrom_packets') {
    const sql = `
      UPDATE nes_chrom_packets
      SET permissions = $2::jsonb,
          metadata = $3::jsonb,
          topology = $4::jsonb,
          vectors = $5::jsonb,
          pagerank = $6,
          betweenness = $7,
          eigenvector = $8,
          neo4j_node_id = $9,
          redis_centroid_key = $10,
          updated_at = NOW()
      WHERE packet_key = $1
    `;
    return pool.query(sql, params);
  }

  const sql = `
    UPDATE atlas_packets
    SET permissions = $2::jsonb,
        metadata = $3::jsonb,
        topology = $4::jsonb,
        vectors = $5::jsonb,
        pagerank = $6,
        betweenness = $7,
        eigenvector = $8,
        neo4j_node_id = $9,
        redis_centroid_key = $10,
        updated_at = NOW()
    WHERE packet_key = $1
  `;
  return pool.query(sql, params);
}

function buildReport(records, stats, missingFile) {
  return {
    generatedAt: new Date().toISOString(),
    applyMode: APPLY,
    inputFile: ADDRESSABLE_NDJSON,
    inputExists: !missingFile,
    totalRecords: records.length,
    updatedRows: stats.updatedRows,
    skippedRows: stats.skippedRows,
    missingByTable: stats.missingByTable,
    tableCounts: stats.tableCounts,
  };
}

function writeReport(report) {
  return ensureDirFor(BACKFILL_REPORT_JSON).then(async () => {
    await fs.writeFile(BACKFILL_REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      BACKFILL_REPORT_MD,
      [
        '# Phase 20 Packet Metadata Backfill',
        '',
        `Generated: ${report.generatedAt}`,
        `Apply mode: ${report.applyMode ? 'yes' : 'no'}`,
        `Input file: ${report.inputFile}`,
        `Input exists: ${report.inputExists ? 'yes' : 'no'}`,
        `Total records: ${report.totalRecords}`,
        `Updated rows: ${report.updatedRows}`,
        `Skipped rows: ${report.skippedRows}`,
        '',
        '## Table counts',
        '',
        ...Object.entries(report.tableCounts).map(([table, count]) => `- ${table}: ${count}`),
        '',
        '## Missing by table',
        '',
        ...Object.entries(report.missingByTable).map(([table, count]) => `- ${table}: ${count}`),
      ].join('\n'),
      'utf8',
    );
  });
}

export async function main() {
  const pool = loadPool();
  try {
    const inputText = await fs.readFile(ADDRESSABLE_NDJSON, 'utf8').catch(() => null);
    if (!inputText) {
      throw new Error(`Missing materialized packet file: ${ADDRESSABLE_NDJSON}. Run materialize-addressable-packets.mjs --apply first.`);
    }

    const parsed = parseNdjson(inputText);
    const records = LIMIT ? parsed.slice(0, LIMIT) : parsed;
    const stats = {
      updatedRows: 0,
      skippedRows: 0,
      missingByTable: Object.fromEntries(PACKET_TABLES.map((table) => [table, 0])),
      tableCounts: Object.fromEntries(PACKET_TABLES.map((table) => [table, 0])),
    };

    for (const record of records) {
      const tableName = String(record.packet_source_table ?? '').trim();
      if (!PACKET_TABLES.includes(tableName)) {
        stats.skippedRows += 1;
        continue;
      }

      stats.tableCounts[tableName] += 1;

      const packetKey = firstText(record.packet_key, record.packetKey);
      if (!packetKey) {
        stats.skippedRows += 1;
        stats.missingByTable[tableName] += 1;
        continue;
      }

      if (APPLY) {
        const { rowCount } = await updatePacket(pool, tableName, record);
        if (rowCount > 0) {
          stats.updatedRows += rowCount;
        } else {
          stats.skippedRows += 1;
          stats.missingByTable[tableName] += 1;
        }
      } else {
        stats.updatedRows += 1;
      }
    }

    const report = buildReport(records, stats, false);
    await writeReport(report);

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      applyMode: APPLY,
      inputFile: ADDRESSABLE_NDJSON,
      inputExists: false,
      totalRecords: 0,
      updatedRows: 0,
      skippedRows: 0,
      missingByTable: Object.fromEntries(PACKET_TABLES.map((table) => [table, 0])),
      tableCounts: Object.fromEntries(PACKET_TABLES.map((table) => [table, 0])),
      databaseAvailable: false,
      error: error instanceof Error ? error.message : String(error),
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
    console.error('[atlas:packets:metadata:backfill] Failed:', error);
    process.exitCode = 1;
  });
}
