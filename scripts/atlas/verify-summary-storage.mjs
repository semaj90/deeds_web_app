#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'summary-storage-proof.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'summary-storage-proof.md');

function pct(part, total) {
  const numerator = Number(part ?? 0);
  const denominator = Number(total ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function queryOne(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? {};
}

async function tableExists(pool, tableName) {
  const row = await queryOne(pool, `SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
  return row.exists === true;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# Summary Storage Proof',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.status}`,
      '',
      '## Tables',
      '',
      `- atlas_packets: ${report.tables.atlas_packets.exists ? `PASS (${report.tables.atlas_packets.rows} rows)` : 'FAIL'}`,
      `- atlas_summary_layers: ${report.tables.atlas_summary_layers.exists ? `PASS (${report.tables.atlas_summary_layers.rows} rows)` : 'FAIL'}`,
      '',
      '## JSONB Coverage',
      '',
      `- atlas_packets.metadata: ${report.coverage.atlas_packets_metadata_pct}%`,
      `- atlas_packets.topology: ${report.coverage.atlas_packets_topology_pct}%`,
      `- atlas_packets.vectors: ${report.coverage.atlas_packets_vectors_pct}%`,
      `- atlas_summary_layers.metadata: ${report.coverage.atlas_summary_layers_metadata_pct}%`,
      '',
      '## Proof',
      '',
      `- summary rows > 0: ${report.proof.summary_rows ? 'PASS' : 'WARN'}`,
      `- summary JSONB metadata present: ${report.proof.summary_metadata ? 'PASS' : 'WARN'}`,
      `- packet JSONB coverage present: ${report.proof.packet_jsonb ? 'PASS' : 'WARN'}`,
    ].join('\n'),
    'utf8',
  );
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

  const report = {
    generated_at: new Date().toISOString(),
    status: 'PASS',
    tables: {
      atlas_packets: { exists: false, rows: 0 },
      atlas_summary_layers: { exists: false, rows: 0 },
    },
    coverage: {
      atlas_packets_metadata_pct: 0,
      atlas_packets_topology_pct: 0,
      atlas_packets_vectors_pct: 0,
      atlas_summary_layers_metadata_pct: 0,
    },
    proof: {
      summary_rows: false,
      summary_metadata: false,
      packet_jsonb: false,
    },
    sample: {},
  };

  try {
    report.tables.atlas_packets.exists = await tableExists(pool, 'atlas_packets');
    report.tables.atlas_summary_layers.exists = await tableExists(pool, 'atlas_summary_layers');

    if (report.tables.atlas_packets.exists) {
      report.tables.atlas_packets.rows = Number((await queryOne(pool, `SELECT COUNT(*)::bigint AS count FROM atlas_packets`)).count ?? 0);
      const row = await queryOne(pool, `
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata <> '{}'::jsonb)::bigint AS with_metadata,
          COUNT(*) FILTER (WHERE topology IS NOT NULL AND topology <> '{}'::jsonb)::bigint AS with_topology,
          COUNT(*) FILTER (WHERE vectors IS NOT NULL AND vectors <> '{}'::jsonb)::bigint AS with_vectors
        FROM atlas_packets
      `);
      report.coverage.atlas_packets_metadata_pct = pct(row.with_metadata, row.total);
      report.coverage.atlas_packets_topology_pct = pct(row.with_topology, row.total);
      report.coverage.atlas_packets_vectors_pct = pct(row.with_vectors, row.total);
      report.proof.packet_jsonb = Number(row.total ?? 0) > 0 && Number(row.with_metadata ?? 0) > 0;
      report.sample.atlas_packets = await queryOne(pool, `
        SELECT packet_key, source_ref, feature_id, metadata, topology, vectors
        FROM atlas_packets
        WHERE metadata IS NOT NULL
        LIMIT 1
      `);
    } else {
      report.status = 'WARN';
    }

    if (report.tables.atlas_summary_layers.exists) {
      report.tables.atlas_summary_layers.rows = Number((await queryOne(pool, `SELECT COUNT(*)::bigint AS count FROM atlas_summary_layers`)).count ?? 0);
      const row = await queryOne(pool, `
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata <> '{}'::jsonb)::bigint AS with_metadata,
          COUNT(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::bigint AS with_summary
        FROM atlas_summary_layers
      `);
      report.coverage.atlas_summary_layers_metadata_pct = pct(row.with_metadata, row.total);
      report.proof.summary_rows = Number(row.total ?? 0) > 0;
      report.proof.summary_metadata = Number(row.with_metadata ?? 0) > 0;
      report.sample.atlas_summary_layers = await queryOne(pool, `
        SELECT packet_key, summary_level, summary_text, metadata
        FROM atlas_summary_layers
        WHERE metadata IS NOT NULL
        LIMIT 1
      `);
    } else {
      report.status = 'WARN';
    }

    if (!report.proof.summary_rows || !report.proof.summary_metadata || !report.proof.packet_jsonb) {
      report.status = 'WARN';
    }

    writeReport(report);
    console.log(`Wrote ${path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/')}`);
    console.log(`Wrote ${path.relative(ROOT, REPORT_MD).replace(/\\/g, '/')}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
