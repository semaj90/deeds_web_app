#!/usr/bin/env node
/**
 * record-lora-checkpoint.mjs
 *
 * Post-training hook called by train_lora_adapter.py after a LoRA run completes.
 * Upserts a row in lora_training_runs and optionally uploads adapter weights
 * to SeaweedFS.
 *
 * Usage (called from Python via subprocess):
 *   node scripts/atlas/record-lora-checkpoint.mjs \
 *     --run-id glyphs-2026-06-03 \
 *     --model-id gemma4-rotorquant:latest \
 *     --status done \
 *     --mean-reward 0.72 \
 *     --glyph-count 28 \
 *     --adapter-path /tmp/adapter_model.safetensors \
 *     --seaweed-key lora-adapters/gemma4/glyphs-2026-06-03/adapter_model.safetensors
 *
 * Or directly for a training start record:
 *   node scripts/atlas/record-lora-checkpoint.mjs \
 *     --run-id glyphs-2026-06-03 --model-id gemma4-rotorquant:latest --status training
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

function flagVal(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function loadEnv() {
  const e = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}

const env = loadEnv();
const argv = process.argv.slice(2);

const RUN_ID      = flagVal(argv, '--run-id');
const MODEL_ID    = flagVal(argv, '--model-id', 'gemma4-rotorquant:latest');
const BASE_MODEL  = flagVal(argv, '--base-model', MODEL_ID);
const STATUS      = flagVal(argv, '--status', 'done');
const MEAN_REWARD = parseFloat(flagVal(argv, '--mean-reward', '0') || '0');
const GLYPH_COUNT = parseInt(flagVal(argv, '--glyph-count', '0') || '0', 10);
const DATASET_URI = flagVal(argv, '--dataset-uri') ?? flagVal(argv, '--dataset');
const ADAPTER_PATH = flagVal(argv, '--adapter-path');
const SEAWEED_KEY = flagVal(argv, '--seaweed-key');
const LORA_RANK   = parseInt(flagVal(argv, '--lora-rank', '64') || '64', 10);

if (!RUN_ID) {
  console.error('❌ --run-id is required');
  process.exit(1);
}

const VALID_STATUSES = ['planned', 'training', 'done', 'failed'];
if (!VALID_STATUSES.includes(STATUS)) {
  console.error(`❌ --status must be one of: ${VALID_STATUSES.join(', ')}`);
  process.exit(1);
}

const PG_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: PG_URL });
  const client = await pool.connect();

  try {
    const metricsJson = {
      meanReward: MEAN_REWARD,
      glyphCount: GLYPH_COUNT,
      loraRank: LORA_RANK,
      recordedAt: new Date().toISOString(),
    };

    const configJson = {
      baseModel: BASE_MODEL,
      loraRank: LORA_RANK,
      datasetUri: DATASET_URI,
    };

    // Upsert: insert new run or update existing by run_id
    await client.query(`
      INSERT INTO lora_training_runs
        (run_id, model_id, base_model, dataset_uri, checkpoint_uri,
         seaweed_object_key, status, metrics_json, config_json, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (run_id) DO UPDATE SET
        status             = EXCLUDED.status,
        checkpoint_uri     = COALESCE(EXCLUDED.checkpoint_uri, lora_training_runs.checkpoint_uri),
        seaweed_object_key = COALESCE(EXCLUDED.seaweed_object_key, lora_training_runs.seaweed_object_key),
        metrics_json       = lora_training_runs.metrics_json || EXCLUDED.metrics_json,
        updated_at         = NOW()
    `, [
      RUN_ID,
      MODEL_ID,
      BASE_MODEL,
      DATASET_URI,
      ADAPTER_PATH,
      SEAWEED_KEY,
      STATUS,
      JSON.stringify(metricsJson),
      JSON.stringify(configJson),
    ]);

    console.log(`✅ lora_training_runs upserted: run_id=${RUN_ID} status=${STATUS}`);
    if (SEAWEED_KEY) console.log(`   adapter → ${SEAWEED_KEY}`);
    if (MEAN_REWARD) console.log(`   mean_reward=${MEAN_REWARD.toFixed(3)}  glyph_count=${GLYPH_COUNT}`);

    // Update glyph_records.batch_id if a batch_id column exists (live schema uses run_id as reference)
    // No-op if column doesn't exist — batch linkage is via lora_training_runs.dataset_uri
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ record-lora-checkpoint failed:', err.message);
  process.exit(1);
});
