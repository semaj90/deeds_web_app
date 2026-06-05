#!/usr/bin/env node
/**
 * materialize-feature-map-duckdb.mjs
 *
 * Connects DuckDB directly to the live Postgres database, reads the canonical
 * `atlas_feature_map` lineage table, and materializes it into the persistent
 * DuckDB file `docs/reports/offline-synthesis-mapreduce.duckdb`.
 *
 * Usage:
 *   node scripts/atlas/materialize-feature-map-duckdb.mjs           # dry-run
 *   node scripts/atlas/materialize-feature-map-duckdb.mjs --write   # apply writes
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DUCKDB = process.env.DUCKDB_BIN || 'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--write');
const DB_PATH = path.join(ROOT, 'docs', 'reports', 'offline-synthesis-mapreduce.duckdb');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'atlas-feature-map-duckdb-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'atlas-feature-map-duckdb-report.md');

// Load environment config to get DB connection details
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const env = loadEnv();
const DB_HOST = env.DB_HOST || '127.0.0.1';
const DB_PORT = env.DB_PORT || '5434';
const DB_USER = env.DB_USER || 'legal_admin';
const DB_PASSWORD = env.DB_PASSWORD || '123456';
const DB_NAME = env.DB_NAME || 'legal_ai_db';

const pgConnectionString = `dbname=${DB_NAME} user=${DB_USER} password=${DB_PASSWORD} host=${DB_HOST} port=${DB_PORT}`;

function runDuckdb(sql, dbPath = DB_PATH) {
  const res = spawnSync(DUCKDB, [dbPath, '-c', sql], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || '').trim() || `duckdb exited ${res.status}`);
  }
  return (res.stdout || '').trim();
}

function runDuckdbJson(sql, dbPath = DB_PATH) {
  const res = spawnSync(DUCKDB, [dbPath, '-json', '-c', sql], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || '').trim() || `duckdb exited ${res.status}`);
  }
  return JSON.parse(res.stdout || '[]');
}

function main() {
  console.log(`=== materialize-feature-map-duckdb.mjs ===`);
  console.log(`DuckDB Database: ${DB_PATH}`);
  console.log(`Postgres Target: ${DB_HOST}:${DB_PORT} / ${DB_NAME}`);
  console.log(`Mode:            ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  if (DRY_RUN) {
    console.log('\n[Dry-run] Fetching stats from Postgres...');
    const testSql = `
      INSTALL postgres;
      LOAD postgres;
      ATTACH '${pgConnectionString}' AS pg_db (TYPE postgres);
      SELECT count(*)::BIGINT AS total_rows,
             count(DISTINCT feature_id)::BIGINT AS total_features,
             count(DISTINCT som_cluster)::BIGINT AS total_som_clusters
      FROM pg_db.atlas_feature_map;
    `;
    const statsRows = runDuckdbJson(testSql, ':memory:');
    const stats = statsRows[0] ?? { total_rows: 0, total_features: 0, total_som_clusters: 0 };
    
    const report = {
      generatedAt: new Date().toISOString(),
      applied: false,
      summary: {
        rows: Number(stats.total_rows),
        features: Number(stats.total_features),
        somClusters: Number(stats.total_som_clusters),
      }
    };
    
    fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    
    const tmpReportPath = path.join(ROOT, '.tmp', 'duckdb-mapreduce-join-report.json');
    fs.mkdirSync(path.dirname(tmpReportPath), { recursive: true });
    fs.writeFileSync(tmpReportPath, JSON.stringify(report, null, 2), 'utf8');
    
    const md = `# Atlas Feature Map DuckDB Report (Dry Run)\n\n` +
      `- Total Lineage Rows: ${report.summary.rows}\n` +
      `- Distinct Features:  ${report.summary.features}\n` +
      `- SOM Clusters:       ${report.summary.somClusters}\n\n` +
      `*Dry-run complete. Run with --write to save to offline-synthesis-mapreduce.duckdb.*\n`;
    fs.writeFileSync(REPORT_MD, md, 'utf8');
    
    console.log(`Wrote ${REPORT_JSON}`);
    console.log(`Wrote ${tmpReportPath}`);
    console.log(`Wrote ${REPORT_MD}`);
    return;
  }

  console.log('\n[Write] Materializing into DuckDB...');
  const sql = `
    INSTALL postgres;
    LOAD postgres;
    ATTACH '${pgConnectionString}' AS pg_db (TYPE postgres);
    
    CREATE OR REPLACE TABLE atlas_feature_map AS 
      SELECT 
        normalized_path,
        source_ref, 
        source_ref AS source_id,
        feature_id, 
        related_feature_ids, 
        cluster_id, 
        centroid_id, 
        som_cluster, 
        qdrant_point_id, 
        neo4j_node_id, 
        nes_card_id,
        lane_ids,
        atlas_version,
        indexed_at
      FROM pg_db.atlas_feature_map;
      
    SELECT count(*)::BIGINT AS total_rows,
           count(DISTINCT feature_id)::BIGINT AS total_features,
           count(DISTINCT som_cluster)::BIGINT AS total_som_clusters
    FROM atlas_feature_map;
  `;

  const results = runDuckdbJson(sql);
  const stats = results[0] ?? { total_rows: 0, total_features: 0, total_som_clusters: 0 };
  
  const report = {
    generatedAt: new Date().toISOString(),
    applied: true,
    summary: {
      rows: Number(stats.total_rows),
      features: Number(stats.total_features),
      somClusters: Number(stats.total_som_clusters),
    }
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  
  const tmpReportPath = path.join(ROOT, '.tmp', 'duckdb-mapreduce-join-report.json');
  fs.writeFileSync(tmpReportPath, JSON.stringify(report, null, 2), 'utf8');
  
  const md = `# Atlas Feature Map DuckDB Report\n\n` +
    `- Total Lineage Rows: ${report.summary.rows}\n` +
    `- Distinct Features:  ${report.summary.features}\n` +
    `- SOM Clusters:       ${report.summary.somClusters}\n\n` +
    `*Successfully materialized into persistent DuckDB store at ${DB_PATH}*\n`;
  fs.writeFileSync(REPORT_MD, md, 'utf8');
  
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${tmpReportPath}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Rows materialized: ${report.summary.rows}`);
}

main();
