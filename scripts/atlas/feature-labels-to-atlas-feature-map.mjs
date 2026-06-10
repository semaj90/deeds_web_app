#!/usr/bin/env node
/**
 * feature-labels-to-atlas-feature-map.mjs
 *
 * Reads .tmp/feature_labels.jsonl (output of feature_labelling.mjs) and
 * UPSERTs each file → feature_id row into atlas_feature_map.
 *
 * Only touches feature_id + related_feature_ids. Never overwrites
 * cluster_id, qdrant_point_id, neo4j_node_id, or other linkage columns.
 *
 * Usage:
 *   node scripts/atlas/feature-labels-to-atlas-feature-map.mjs [--dry-run] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__dir, '../..');
const TMP     = path.join(ROOT, '.tmp');
const IN_FILE = path.join(TMP, 'feature_labels.jsonl');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

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

const envVars   = loadEnv();
const DB_URL    = envVars.DATABASE_URL
  ?? `postgresql://${envVars.DB_USER ?? 'legal_admin'}:${envVars.DB_PASSWORD ?? 'legal_password'}@${envVars.DB_HOST ?? '127.0.0.1'}:${envVars.DB_PORT ?? '5432'}/${envVars.DB_NAME ?? 'legal_ai_db'}`;

// ── Read input ──────────────────────────────────────────────────────────────
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ── Derive feature_id from topFeature + file path ───────────────────────────
function deriveFeatureId(record) {
  if (record.schema_gap?.feature_id) return record.schema_gap.feature_id;
  const top = record.topFeature ?? 'other';
  // Namespace by directory segment to keep IDs stable but scoped
  const relPath = record.file?.replace(/\\/g, '/') ?? '';
  const dirParts = relPath.split('/').slice(0, 4).join('.');
  return `feature.${top}.${dirParts}`.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

// ── Derive lane_ids from feature list ───────────────────────────────────────
const FEATURE_TO_LANE = {
  cache:         'lane:cache',
  database:      'lane:db',
  evidence:      'lane:evidence',
  llm:           'lane:llm',
  'vector-search':'lane:vector',
  gpu:           'lane:gpu',
  graph:         'lane:graph',
  ui:            'lane:ui',
  auth:          'lane:auth',
  ingest:        'lane:ingest',
};

function deriveLaneIds(features) {
  return [...new Set(
    (features ?? []).map(f => FEATURE_TO_LANE[f.name]).filter(Boolean)
  )];
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n── Feature Labels → atlas_feature_map ──`);

  if (!fs.existsSync(IN_FILE)) {
    console.error(`  ERROR: ${IN_FILE} not found`);
    console.error(`  Run: node scripts/atlas/feature_labelling.mjs`);
    process.exit(1);
  }

  const records = readJsonl(IN_FILE);
  console.log(`  Input records: ${records.length} from ${IN_FILE}`);

  if (DRY_RUN) {
    console.log(`  DRY-RUN — no DB writes`);
    for (const r of records.slice(0, 5)) {
      console.log(`    source_ref=${r.file}  feature_id=${deriveFeatureId(r)}  top=${r.topFeature}`);
    }
    if (records.length > 5) console.log(`    … and ${records.length - 5} more`);
    process.exit(0);
  }

  const pool = new Pool({ connectionString: DB_URL, max: 3 });

  let upserted = 0;
  let skipped  = 0;
  let errors   = 0;

  // Batch upserts in groups of 200
  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let idx = 1;

    for (const r of batch) {
      const sourceRef      = r.file ?? null;
      if (!sourceRef) { skipped++; continue; }

      const featureId      = deriveFeatureId(r);
      const relatedIds     = JSON.stringify(
        (r.features ?? []).map(f => `feature.${f.name}`).filter(Boolean)
      );
      const laneIds        = deriveLaneIds(r.features);

      values.push(`($${idx++}, $${idx++}, $${idx++}::jsonb, $${idx++}::text[])`);
      params.push(sourceRef, featureId, relatedIds, laneIds);
    }

    if (!values.length) continue;

    const sql = `
      INSERT INTO atlas_feature_map (source_ref, feature_id, related_feature_ids, lane_ids)
      VALUES ${values.join(', ')}
      ON CONFLICT (source_ref) DO UPDATE SET
        feature_id         = COALESCE(EXCLUDED.feature_id, atlas_feature_map.feature_id),
        related_feature_ids= CASE
          WHEN EXCLUDED.related_feature_ids <> '[]'::jsonb
          THEN EXCLUDED.related_feature_ids
          ELSE atlas_feature_map.related_feature_ids
        END,
        lane_ids           = CASE
          WHEN array_length(EXCLUDED.lane_ids, 1) > 0
          THEN EXCLUDED.lane_ids
          ELSE atlas_feature_map.lane_ids
        END,
        indexed_at         = now()
    `;

    try {
      const res = await pool.query(sql, params);
      upserted += res.rowCount ?? batch.length;
      if (VERBOSE) console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${res.rowCount} rows`);
    } catch (err) {
      console.error(`  batch error: ${err.message}`);
      errors++;
    }
  }

  await pool.end();

  console.log(`\n  Done — upserted: ${upserted}  skipped: ${skipped}  errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
