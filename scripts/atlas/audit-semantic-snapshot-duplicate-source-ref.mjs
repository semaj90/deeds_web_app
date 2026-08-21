#!/usr/bin/env node
import duckdb from 'duckdb';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('.tmp/atlas-vector-snapshots/atlas-vector-snapshot-5k-768.duckdb');
const outPath = path.resolve('docs/reports/semantic-snapshot-duplicate-source-ref-audit.json');
mkdirSync(path.dirname(outPath), { recursive: true });

const report = {
  schema: 'atlas.semantic-snapshot-duplicate-source-ref-audit.v1',
  timestamp: new Date().toISOString(),
  databasePath: path.relative(process.cwd(), dbPath),
  table: 'vector_snapshot_packets_5k_768',
  duplicateGroups: [],
  duplicateRowCount: 0,
  status: 'NOT_RUN',
  reason: null,
};

function queryAll(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

let db;
try {
  if (!existsSync(dbPath)) throw new Error('SNAPSHOT_DUCKDB_NOT_FOUND');
  db = new duckdb.Database(dbPath, { readonly: true });
  const connection = db.connect();
  const rows = await queryAll(connection, `
    SELECT
      source_ref,
      COUNT(*)::INTEGER AS row_count,
      LIST(packet_key ORDER BY packet_key) AS packet_keys
    FROM vector_snapshot_packets_5k_768
    WHERE source_ref IS NOT NULL AND TRIM(source_ref) <> ''
    GROUP BY source_ref
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC, source_ref
  `);
  connection.close();

  report.duplicateGroups = rows.map((row) => ({
    sourceRef: String(row.source_ref),
    rowCount: Number(row.row_count),
    packetKeys: Array.isArray(row.packet_keys) ? row.packet_keys.map(String) : row.packet_keys,
  }));
  report.duplicateRowCount = report.duplicateGroups.reduce((sum, row) => sum + row.rowCount, 0);
  report.status = report.duplicateGroups.length === 0
    ? 'SOURCE_REF_UNIQUENESS_PROVEN'
    : 'SOURCE_REF_DUPLICATE_FOUND';
} catch (error) {
  report.status = 'SOURCE_REF_AUDIT_NOT_PROVEN';
  report.reason = error instanceof Error ? error.message : String(error);
} finally {
  try { db?.close(); } catch {}
}

writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'SOURCE_REF_UNIQUENESS_PROVEN') process.exitCode = 1;
