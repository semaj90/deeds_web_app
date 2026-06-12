#!/usr/bin/env node
/**
 * bridge-gpu-clusters-to-atlas-feature-map.mjs
 *
 * Reads the GPU-enriched parquet (.tmp/ingest/parent_atlas_gpu.parquet) and
 * UPSERTs gpu_kmeans_cluster → som_cluster on atlas_feature_map rows that
 * currently have no som_cluster (the 3,539 gap rows).
 *
 * This raises SOM/cluster coverage from 31% toward 70%+ without re-embedding.
 *
 * Usage:
 *   node scripts/atlas/bridge-gpu-clusters-to-atlas-feature-map.mjs --dry-run
 *   node scripts/atlas/bridge-gpu-clusters-to-atlas-feature-map.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const PARQUET_GPU = path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_gpu.parquet');

// ── Env loader ──────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}

const envVars = loadEnv();
const DATABASE_URL = envVars.DATABASE_URL
  ?? `postgresql://${envVars.DB_USER ?? 'legal_admin'}:${envVars.DB_PASSWORD ?? 'legal_password'}@${envVars.DB_HOST ?? '127.0.0.1'}:${envVars.DB_PORT ?? '5432'}/${envVars.DB_NAME ?? 'legal_ai_db'}`;

// ── Read parquet via DuckDB CLI ─────────────────────────────────────────────
function readParquet(parquetPath) {
  if (!fs.existsSync(parquetPath)) {
    throw new Error(`Parquet not found: ${parquetPath}\n  Run: node scripts/atlas/gpu-enrich-parent-atlas.mjs --apply`);
  }
  const tmp = parquetPath + '.bridge.tmp.json';
  const pq = parquetPath.replace(/\\/g, '/');
  const tj = tmp.replace(/\\/g, '/');
  const r = spawnSync('duckdb', [
    '-c',
    `COPY (SELECT node_id, gpu_kmeans_cluster, gpu_pagerank, gpu_reward FROM read_parquet('${pq}')) TO '${tj}' (FORMAT JSON, ARRAY TRUE);`,
  ], { encoding: 'utf8' });
  let data = [];
  try {
    const text = fs.readFileSync(tmp, 'utf8').trim();
    data = text ? JSON.parse(text) : [];
  } catch (err) {
    console.warn(`DuckDB read failed for ${tmp}: ${err.message}`);
  }
  if (fs.existsSync(tmp)) {
    fs.unlinkSync(tmp);
  }
  return data;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Bridge GPU Clusters → atlas_feature_map ════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Source: ${PARQUET_GPU}`);

  // Load GPU parquet
  console.log('\n  Step 1: Load GPU-enriched parquet...');
  const gpuRows = readParquet(PARQUET_GPU);
  console.log(`  ✅ Loaded ${gpuRows.length} nodes from parquet`);

  // Build node_id → cluster map
  // node_id in the parquet is typically the source_ref or a path-derived ID
  const clusterMap = new Map();
  for (const row of gpuRows) {
    if (row.node_id && row.gpu_kmeans_cluster != null) {
      clusterMap.set(String(row.node_id), {
        cluster: `gpu:${row.gpu_kmeans_cluster}`,
        pagerank: row.gpu_pagerank ?? 0,
        reward: row.gpu_reward ?? 0,
      });
    }
  }
  console.log(`  ✅ ${clusterMap.size} nodes with cluster assignments`);

  // Connect to Postgres
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Load all atlas_feature_map rows that have no som_cluster
  console.log('\n  Step 2: Load atlas_feature_map rows missing som_cluster...');
  const gapResult = await pool.query(`
    SELECT normalized_path, source_ref, qdrant_point_id
    FROM atlas_feature_map
    WHERE som_cluster IS NULL
    ORDER BY source_ref
  `);
  const gapRows = gapResult.rows;
  console.log(`  ✅ Found ${gapRows.length} rows with no som_cluster`);

  // Match against GPU parquet by normalized_path / source_ref
  let matched = 0;
  let unmatched = 0;
  const updates = [];

  for (const row of gapRows) {
    const key = row.normalized_path || row.source_ref;
    // Try exact match first, then basename match
    let gpuEntry = clusterMap.get(key);
    if (!gpuEntry) {
      // Try basename
      const base = path.basename(key);
      for (const [k, v] of clusterMap) {
        if (path.basename(k) === base) {
          gpuEntry = v;
          break;
        }
      }
    }

    if (gpuEntry) {
      matched++;
      updates.push({ normalized_path: row.normalized_path || row.source_ref, ...gpuEntry });
    } else {
      unmatched++;
      if (VERBOSE) console.log(`  [unmatched] ${key}`);
    }
  }

  console.log(`  Matched:   ${matched} rows → will get gpu cluster assignments`);
  console.log(`  Unmatched: ${unmatched} rows → still no cluster (these are non-Qdrant paths)`);

  if (!APPLY) {
    // Show sample
    console.log('\n  Sample matches (first 5):');
    updates.slice(0, 5).forEach(u => {
      console.log(`    ${u.normalized_path} → ${u.cluster}`);
    });
    console.log('\n  [DRY-RUN] No writes. Pass --apply to update atlas_feature_map.');
    await pool.end();
    return;
  }

  // Apply: UPDATE atlas_feature_map SET som_cluster, cluster_id WHERE normalized_path = ?
  console.log('\n  Step 3: Upserting GPU cluster assignments...');
  let upserted = 0;
  let failed = 0;
  const BATCH = 100;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of batch) {
        await client.query(`
          UPDATE atlas_feature_map
          SET
            som_cluster = $1,
            cluster_id  = COALESCE(cluster_id, $1),
            indexed_at  = now()
          WHERE (normalized_path = $2 OR source_ref = $2)
            AND som_cluster IS NULL
        `, [u.cluster, u.normalized_path]);
        upserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      failed += batch.length;
      console.error(`  [batch ${i}] failed:`, err.message);
    } finally {
      client.release();
    }
    if ((i + BATCH) % 500 === 0) console.log(`  updated ${upserted}...`);
  }

  // Verify final coverage
  const coverageResult = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE som_cluster IS NOT NULL) AS with_som,
      COUNT(*) FILTER (WHERE centroid_id IS NOT NULL) AS with_centroid,
      COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) AS with_qdrant
    FROM atlas_feature_map
  `);
  const cov = coverageResult.rows[0];

  await pool.end();

  const somPct = Math.round(parseInt(cov.with_som) / parseInt(cov.total) * 100);
  console.log('\n══ Results ════════════════════════════════════════════════');
  console.log(`  Rows processed:  ${updates.length}`);
  console.log(`  Upserted:        ${upserted}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`\n  atlas_feature_map coverage:`);
  console.log(`    total:         ${cov.total}`);
  console.log(`    with_som:      ${cov.with_som} (${somPct}%)`);
  console.log(`    with_centroid: ${cov.with_centroid}`);
  console.log(`    with_qdrant:   ${cov.with_qdrant}`);
  console.log(`\n  ✅ Bridge complete. Run atlas:synthesize to rebuild synthesized map.`);
}

main().catch(e => {
  console.error('Error:', e.message);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
