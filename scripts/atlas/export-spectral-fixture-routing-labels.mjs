#!/usr/bin/env node
/**
 * Export revision-pure ORF routing labels for the spectral live fixture.
 *
 * Input node parquet remains the graph/fixture identity owner. This script
 * reads gpu_node_id + packet_key, chooses ONE ORF feature_revision, joins
 * atlas_observation_feature_rows by packet_key, and writes Parquet keyed by
 * gpu_node_id. It never manufactures labels and never treats cluster IDs as
 * identity.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { DuckDBResultReader } from '@duckdb/node-api';
import { createAtlasDuckDB } from '../../sveltekit-frontend/packages/atlas-duckdb/src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const read = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const nodes = read('--nodes');
  if (!nodes) throw new Error('Usage: --nodes <fixture nodes.parquet> [--feature-revision REV] [--out labels.parquet]');
  return {
    nodes: path.resolve(nodes),
    featureRevision: read('--feature-revision') ?? process.env.ATLAS_FEATURE_REVISION ?? null,
    out: path.resolve(read('--out') ?? path.join(ROOT, 'docs', 'reports', 'spectral-live-fixture-routing-labels.parquet')),
  };
}

function loadEnv() {
  for (const candidate of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (fs.existsSync(candidate)) dotenv.config({ path: candidate, override: false });
  }
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER ?? 'legal_admin';
  const password = process.env.DB_PASSWORD ?? 'legal_password';
  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = process.env.DB_PORT ?? '5432';
  const db = process.env.DB_NAME ?? 'legal_ai_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

async function duckRows(connection, sql) {
  const result = await connection.run(sql);
  const reader = new DuckDBResultReader(result);
  await reader.readAll();
  return reader.getRowObjectsJS();
}

function sqlPath(value) {
  return value.replace(/\\/g, '/').replace(/'/g, "''");
}

async function readNodeIdentity(nodesPath) {
  const duck = await createAtlasDuckDB({ databasePath: ':memory:' });
  try {
    const rows = await duckRows(
      duck.connection,
      `SELECT CAST(gpu_node_id AS BIGINT) AS gpu_node_id, packet_key, source_ref
       FROM read_parquet('${sqlPath(nodesPath)}')
       WHERE packet_key IS NOT NULL
       ORDER BY gpu_node_id`,
    );
    return rows.map((row) => ({
      gpu_node_id: Number(row.gpu_node_id),
      packet_key: String(row.packet_key),
      source_ref: row.source_ref == null ? null : String(row.source_ref),
    }));
  } finally {
    await duck.close();
  }
}

async function chooseFeatureRevision(client, packetKeys, requested) {
  if (requested) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS coverage
       FROM atlas_observation_feature_rows
       WHERE feature_revision = $1 AND packet_key = ANY($2::text[])`,
      [requested, packetKeys],
    );
    if ((rows[0]?.coverage ?? 0) === 0) throw new Error(`feature_revision '${requested}' has zero fixture coverage`);
    return { featureRevision: requested, coverage: Number(rows[0].coverage), selection: 'EXPLICIT' };
  }

  const { rows } = await client.query(
    `SELECT feature_revision, count(*)::int AS coverage, max(updated_at) AS newest
     FROM atlas_observation_feature_rows
     WHERE packet_key = ANY($1::text[])
     GROUP BY feature_revision
     ORDER BY coverage DESC, newest DESC, feature_revision ASC
     LIMIT 1`,
    [packetKeys],
  );
  if (!rows.length) throw new Error('no atlas_observation_feature_rows match the frozen fixture packet keys');
  return {
    featureRevision: String(rows[0].feature_revision),
    coverage: Number(rows[0].coverage),
    selection: 'MAX_FIXTURE_COVERAGE_THEN_NEWEST',
  };
}

async function writeLabelsParquet(labels, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const ndjson = `${outPath}.tmp-${process.pid}.ndjson`;
  fs.writeFileSync(ndjson, labels.map((row) => JSON.stringify(row)).join('\n') + (labels.length ? '\n' : ''), 'utf8');
  const duck = await createAtlasDuckDB({ databasePath: ':memory:' });
  try {
    await duck.connection.run(`
      CREATE TABLE spectral_labels AS
      SELECT * FROM read_ndjson_auto('${sqlPath(ndjson)}');
    `);
    await duck.connection.run(`
      COPY spectral_labels TO '${sqlPath(outPath)}'
      (FORMAT PARQUET, COMPRESSION ZSTD);
    `);
  } finally {
    await duck.close();
    fs.rmSync(ndjson, { force: true });
  }
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const identities = await readNodeIdentity(args.nodes);
  if (!identities.length) throw new Error('fixture nodes parquet has no packet_key rows to join against ORF');
  const byPacket = new Map(identities.map((row) => [row.packet_key, row]));
  const packetKeys = [...byPacket.keys()];

  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 2 });
  try {
    const selected = await chooseFeatureRevision(pool, packetKeys, args.featureRevision);
    const labels = [];
    const chunkSize = 4000;
    for (let start = 0; start < packetKeys.length; start += chunkSize) {
      const chunk = packetKeys.slice(start, start + chunkSize);
      const { rows } = await pool.query(
        `SELECT
           packet_key,
           feature_revision,
           kmeans_cluster_id,
           som_row,
           som_col,
           community_id,
           pagerank,
           personalized_pagerank
         FROM atlas_observation_feature_rows
         WHERE feature_revision = $1
           AND packet_key = ANY($2::text[])`,
        [selected.featureRevision, chunk],
      );
      for (const row of rows) {
        const identity = byPacket.get(String(row.packet_key));
        if (!identity) continue;
        labels.push({
          gpu_node_id: identity.gpu_node_id,
          packet_key: identity.packet_key,
          source_ref: identity.source_ref,
          feature_revision: String(row.feature_revision),
          kmeans_cluster_id: row.kmeans_cluster_id == null ? null : Number(row.kmeans_cluster_id),
          som_cell: row.som_row == null || row.som_col == null ? null : `${Number(row.som_row)}:${Number(row.som_col)}`,
          community_id: row.community_id == null ? null : String(row.community_id),
          pagerank: row.pagerank == null ? null : Number(row.pagerank),
          ppr: row.personalized_pagerank == null ? null : Number(row.personalized_pagerank),
        });
      }
    }
    labels.sort((a, b) => a.gpu_node_id - b.gpu_node_id);
    if (!labels.length) throw new Error(`feature_revision '${selected.featureRevision}' produced zero label rows`);
    await writeLabelsParquet(labels, args.out);
    console.log(JSON.stringify({
      status: 'EXPORTED_UNPROVEN',
      nodes_with_packet_identity: identities.length,
      selected_feature_revision: selected.featureRevision,
      selection_policy: selected.selection,
      selected_revision_fixture_coverage: selected.coverage,
      exported_rows: labels.length,
      export_coverage: labels.length / identities.length,
      validator_success_available: false,
      repair_success_available: false,
      output_format: 'PARQUET_ZSTD',
      output: args.out,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
