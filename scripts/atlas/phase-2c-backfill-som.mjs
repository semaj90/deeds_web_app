#!/usr/bin/env node
/**
 * phase-2c-backfill-som.mjs
 *
 * Phase 2C: Backfill SOM coordinates from som-metrics.json into atlas_feature_map
 *
 * Maps cardId from SOM metrics to feature_id via card metadata,
 * then backfills som_bmu_row / som_bmu_col into atlas_feature_map
 *
 * Usage:
 *   node scripts/atlas/phase-2c-backfill-som.mjs --dry-run
 *   node scripts/atlas/phase-2c-backfill-som.mjs --apply
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
const VERBOSE = argv.includes('--verbose');

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

const SOM_METRICS = path.join(ROOT, 'memory', 'exports', 'som-metrics.json');

async function main() {
  console.log(`[phase-2c-backfill-som] Starting (dry_run=${DRY_RUN})`);

  // Load SOM metrics
  if (!fs.existsSync(SOM_METRICS)) {
    console.error(`❌ SOM metrics not found: ${SOM_METRICS}`);
    process.exit(1);
  }

  const metricsData = JSON.parse(fs.readFileSync(SOM_METRICS, 'utf8'));
  const allAssignments = metricsData.allAssignments || [];
  console.log(`  ✓ Loaded ${allAssignments.length} SOM assignments from metrics`);

  // Map cardId → bmuRow/Col
  const somByCardId = new Map();
  for (const { cardId, bmuRow, bmuCol } of allAssignments) {
    somByCardId.set(cardId, { bmuRow, bmuCol });
  }

  // Connect to Postgres
  const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

  // Query atlas_feature_map to link cardId → feature_id
  // Assume: each row has a deterministic cardId (e.g., from source_ref hash)
  // OR: each row's feature_id can be matched to a card
  // Strategy: Backfill based on feature_id → cardId mapping in Qdrant payload
  // For now, we'll backfill via a simple name-based match or direct Qdrant lookup

  // Step 1: Count current coverage
  const countRes = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE som_bmu_row IS NOT NULL) as filled
    FROM atlas_feature_map
  `);
  const { total, filled } = countRes.rows[0];
  console.log(`  Current coverage: ${filled}/${total} (${(100 * filled / total).toFixed(1)}%)`);

  // Step 2: Try to match via Qdrant metadata
  // Query recent Qdrant points to build feature_id → cardId mapping
  // For MVP: use feature_id directly if it matches a SOM cardId
  const featureRes = await pool.query(`
    SELECT DISTINCT feature_id 
    FROM atlas_feature_map 
    WHERE som_bmu_row IS NULL 
    LIMIT 1000
  `);

  let matched = 0;
  let unmatched = 0;

  for (const { feature_id } of featureRes.rows) {
    const som = somByCardId.get(feature_id);
    if (!som) {
      unmatched++;
      continue;
    }

    const { bmuRow, bmuCol } = som;
    if (!DRY_RUN) {
      await pool.query(
        `UPDATE atlas_feature_map 
         SET som_bmu_row = $1, som_bmu_col = $2 
         WHERE feature_id = $3`,
        [bmuRow, bmuCol, feature_id]
      );
    }
    matched++;
    if (VERBOSE) console.log(`  ✓ ${feature_id} → (${bmuRow}, ${bmuCol})`);
  }

  console.log(`\n  Backfilled: ${matched} (matched)`);
  console.log(`  Not found:  ${unmatched} (no SOM entry for feature_id)`);

  if (!DRY_RUN) {
    const newCountRes = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE som_bmu_row IS NOT NULL) as filled
      FROM atlas_feature_map
    `);
    const newFilled = newCountRes.rows[0].filled;
    console.log(`\n  New coverage: ${newFilled}/${total} (${(100 * newFilled / total).toFixed(1)}%)`);
  }

  await pool.end();
  console.log(`\n[phase-2c-backfill-som] Done`);
}

main().catch(err => {
  console.error('[phase-2c-backfill-som] Fatal:', err);
  process.exit(1);
});
