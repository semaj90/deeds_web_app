#!/usr/bin/env node
/**
 * Phase 3C: Build Directory Topology Map
 *
 * Canonical source_ref → directory → feature_id → feature_label mapping.
 * Preserves identity chain for replayability.
 *
 * Output: docs/reports/directory-topology-map.json
 * No mutations. Read-only analysis of Parent Atlas state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Environment
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

// ══════════════════════════════════════════════════════════════════════════════
// QUERY: source_ref → directory → feature_id → feature_label
// ══════════════════════════════════════════════════════════════════════════════

async function buildDirectoryTopologyMap(pool) {
  console.log('\n🔍 Building directory topology map...');

  // Query the canonical identity chain
  const result = await pool.query(`
    SELECT
      fmap.source_ref,
      fmap.feature_id,
      fmap.qdrant_point_id,
      fmap.som_cluster,
      -- Infer directory from source_ref (filesystem-canonical)
      CASE
        WHEN fmap.source_ref LIKE 'src/%' THEN
          SPLIT_PART(fmap.source_ref, '/', 2)
        WHEN fmap.source_ref LIKE 'scripts/%' THEN
          SPLIT_PART(fmap.source_ref, '/', 2)
        WHEN fmap.source_ref LIKE 'tests/%' THEN
          SPLIT_PART(fmap.source_ref, '/', 2)
        WHEN fmap.source_ref LIKE 'drizzle/%' THEN
          'drizzle'
        ELSE
          SPLIT_PART(fmap.source_ref, '/', 1)
      END AS inferred_directory,
      COUNT(*) OVER (PARTITION BY SPLIT_PART(fmap.source_ref, '/', 1)) as dir_count
    FROM atlas_feature_map fmap
    WHERE fmap.source_ref IS NOT NULL
      AND fmap.feature_id IS NOT NULL
    ORDER BY fmap.source_ref ASC
  `);

  const rows = result.rows;
  console.log(`  ✓ Found ${rows.length} source_ref → feature_id mappings`);

  // Aggregate by directory
  const byDirectory = {};
  const topology = [];

  for (const row of rows) {
    const dir = row.inferred_directory || 'unknown';

    if (!byDirectory[dir]) {
      byDirectory[dir] = {
        directory: dir,
        count: 0,
        source_refs: new Set(),
        feature_ids: new Set(),
        features: [],
      };
    }

    byDirectory[dir].count++;
    byDirectory[dir].source_refs.add(row.source_ref);
    byDirectory[dir].feature_ids.add(row.feature_id);
    byDirectory[dir].features.push({
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      qdrant_point_id: row.qdrant_point_id,
      som_cluster: row.som_cluster,
    });

    topology.push({
      directory: dir,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      qdrant_point_id: row.qdrant_point_id,
      som_cluster: row.som_cluster,
    });
  }

  // Aggregate summary
  const directorySummary = Object.entries(byDirectory).map(([dir, data]) => ({
    directory: dir,
    total_mappings: data.count,
    unique_source_refs: data.source_refs.size,
    unique_feature_ids: data.feature_ids.size,
  })).sort((a, b) => b.total_mappings - a.total_mappings);

  console.log(`  ✓ Aggregated into ${Object.keys(byDirectory).length} directories`);

  return {
    timestamp: new Date().toISOString(),
    topology: {
      total_mappings: rows.length,
      total_directories: Object.keys(byDirectory).length,
      directories: directorySummary,
      canonical_identity_chain: 'source_ref → feature_id → qdrant_point_id → som_cluster',
    },
    flatList: topology,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   Phase 3C: Directory Topology Map Builder');
    console.log('═══════════════════════════════════════════════════════════');

    const map = await buildDirectoryTopologyMap(pool);

    // Write report
    const reportDir = path.join(ROOT, 'docs', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const jsonPath = path.join(reportDir, 'directory-topology-map.json');
    fs.writeFileSync(jsonPath, JSON.stringify(map, null, 2));

    console.log(`\n✅ Report written to ${jsonPath}`);
    console.log(`\n📊 Directory Topology Summary:`);
    console.log(`  Total Mappings: ${map.topology.total_mappings}`);
    console.log(`  Total Directories: ${map.topology.total_directories}`);
    console.log(`\nTop 10 Directories by Mapping Count:`);
    map.topology.directories.slice(0, 10).forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.directory.padEnd(40)} ${d.total_mappings.toString().padStart(5)} mappings (${d.unique_feature_ids} unique features)`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
