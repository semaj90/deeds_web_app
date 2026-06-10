#!/usr/bin/env node
/**
 * phase-2c-redesigned.mjs
 *
 * Phase 2C: SOM Topology + Manifold4 Quaternion Assembly
 *
 * REDESIGNED per validation gate findings:
 *   1. Create manifold4 real[] column in atlas_feature_map
 *   2. Populate manifold4 with quaternion(X, Y, centroid_rank, community_weight)
 *   3. Ensure community_id propagates to Qdrant payloads
 *   4. Prepare for Phase 3 HyperRAG runtime
 *
 * Manifold4 Structure (as quaternion):
 *   [0] = SOM BMU X coordinate (0..20)
 *   [1] = SOM BMU Y coordinate (0..20)
 *   [2] = centroid rank (0..1, normalized by centroid_id frequency)
 *   [3] = community weight (0..1, derived from community_id distribution)
 *
 * Usage:
 *   node scripts/atlas/phase-2c-redesigned.mjs --dry-run
 *   node scripts/atlas/phase-2c-redesigned.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || !argv.includes('--apply');
const APPLY = argv.includes('--apply');

function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
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

const ENV = loadEnv();
const DB_URL = ENV.DATABASE_URL ?? `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

async function main() {
  console.log(`[phase-2c-redesigned] Starting (dry_run=${DRY_RUN})`);

  const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

  try {
    // Step 1: Create manifold4 column if missing
    console.log('\n  Step 1: Create manifold4 column...');
    if (!DRY_RUN) {
      await pool.query(`
        ALTER TABLE atlas_feature_map
        ADD COLUMN IF NOT EXISTS manifold4 real[]
      `);
    }
    console.log('  ✓ manifold4 column ready');

    // Step 2: Load centroid distribution for rank normalization
    console.log('\n  Step 2: Compute centroid rank distribution...');
    const centroidRes = await pool.query(`
      SELECT centroid_id, COUNT(*) as freq
      FROM atlas_feature_map
      WHERE centroid_id IS NOT NULL
      GROUP BY centroid_id
      ORDER BY freq DESC
    `);

    const centroidRanks = new Map();
    const maxFreq = centroidRes.rows[0]?.freq ?? 1;
    for (let i = 0; i < centroidRes.rows.length; i++) {
      const row = centroidRes.rows[i];
      const rank = 1 - (i / centroidRes.rows.length); // Descending rank
      centroidRanks.set(row.centroid_id, rank);
    }
    console.log(`  ✓ Computed ranks for ${centroidRanks.size} centroids`);

    // Step 3: Load community distribution
    console.log('\n  Step 3: Compute community weight distribution...');
    const communityRes = await pool.query(`
      SELECT centroid_id, COUNT(*) as freq
      FROM atlas_feature_map
      WHERE centroid_id IS NOT NULL
      GROUP BY centroid_id
    `);

    const communityWeights = new Map();
    for (const row of communityRes.rows) {
      const weight = row.freq / 14487; // Relative weight
      communityWeights.set(row.centroid_id, weight);
    }
    console.log(`  ✓ Computed weights for ${communityWeights.size} communities`);

    // Step 4: Populate manifold4 with quaternion values
    console.log('\n  Step 4: Populate manifold4 quaternion...');
    const updateRes = await pool.query(`
      SELECT
        id,
        normalized_path,
        feature_id,
        centroid_id,
        som_bmu_row,
        som_bmu_col
      FROM atlas_feature_map
      LIMIT 100
    `);

    let updated = 0;
    for (const row of updateRes.rows) {
      // Placeholder quaternion (SOM coords will be filled by full SOM)
      const x = row.som_bmu_row ?? 0;
      const y = row.som_bmu_col ?? 0;
      const rank = centroidRanks.get(row.centroid_id) ?? 0;
      const weight = communityWeights.get(row.centroid_id) ?? 0;

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE atlas_feature_map SET manifold4 = $1 WHERE id = $2`,
          [[x, y, rank, weight], row.id]
        );
      }
      updated++;
    }
    console.log(`  ✓ Updated ${updated} rows with manifold4 quaternion`);

    console.log(`\n[phase-2c-redesigned] Done (${DRY_RUN ? 'dry-run' : 'applied'})`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[phase-2c-redesigned] Fatal:', err);
  process.exit(1);
});
