#!/usr/bin/env node
/**
 * scripts/tests/smoke-route-runtime-packets.mjs
 *
 * Verifies route_runtime_packets telemetry write-back logic on query execution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Load environment config
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

// Override config
const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });

// Setup pg client
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function getRrpCount() {
  const res = await pool.query('SELECT COUNT(*)::integer AS count FROM route_runtime_packets');
  return res.rows[0].count;
}

async function run() {
  console.log('🧪 Starting Route Runtime Packets Telemetry Smoke Test...');
  console.log(`Connecting to: ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);

  // 1. Check initial count
  const countBefore = await getRrpCount();
  console.log(`- Count before execution: ${countBefore}`);

  // 2. Import assembleACEContext dynamically
  console.log('⏳ Importing assembleACEContext...');
  const assemblerPath = path.resolve(ROOT, 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts');
  const { assembleACEContext } = await import(pathToFileURL(assemblerPath).href);

  // 3. Trigger context assembly
  const testQuery = 'auth middleware client-side caching ' + Date.now();
  console.log(`- Triggering assembleACEContext for query: "${testQuery}"`);
  
  const ctx = await assembleACEContext({
    query: testQuery,
    userId: '1',
    conversationId: 'smoke-test-session-' + Date.now(),
    enableCodebaseContext: true,
  });

  console.log('✓ Context assembly finished. Waiting 2 seconds for fire-and-forget telemetry write...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 4. Verify count increased
  const countAfter = await getRrpCount();
  console.log(`- Count after execution: ${countAfter}`);
  
  if (countAfter !== countBefore + 1) {
    console.error(`❌ FAILURE: Count did not increase by exactly 1. Before: ${countBefore}, After: ${countAfter}`);
    process.exit(1);
  }
  console.log('✓ route_runtime_packets count increased by 1');

  // 5. Query and validate the details of the inserted row
  const rowRes = await pool.query(`
    SELECT
      id,
      route,
      query_preview,
      source_refs,
      feature_ids,
      qdrant_hits,
      redis_hot_keys,
      cache_tier,
      captured_at
    FROM route_runtime_packets
    ORDER BY captured_at DESC
    LIMIT 1
  `);
  
  const row = rowRes.rows[0];
  if (!row) {
    console.error('❌ FAILURE: No telemetry row found in DB.');
    process.exit(1);
  }

  console.log('\n🔍 Telemetry Row Validation:');
  console.log(`- route           : ${row.route}`);
  console.log(`- query_preview   : ${row.query_preview}`);
  console.log(`- cache_tier      : ${row.cache_tier}`);
  console.log(`- captured_at     : ${row.captured_at}`);

  const sourceRefs = row.source_refs || [];
  const featureIds = row.feature_ids || [];
  const redisKeys = row.redis_hot_keys || [];
  const qdrantHits = row.qdrant_hits ?? 0;

  console.log(`- source_refs     : [${sourceRefs.join(', ')}] (count: ${sourceRefs.length})`);
  console.log(`- feature_ids     : [${featureIds.join(', ')}] (count: ${featureIds.length})`);
  console.log(`- qdrant_hits     : ${qdrantHits}`);
  console.log(`- redis_hot_keys  : [${redisKeys.join(', ')}] (count: ${redisKeys.length})`);

  let success = true;

  if (sourceRefs.length === 0) {
    console.error('✗ Validation failed: source_refs is empty');
    success = false;
  } else {
    console.log('✓ source_refs > 0');
  }

  if (featureIds.length === 0) {
    console.error('✗ Validation failed: feature_ids is empty');
    success = false;
  } else {
    console.log('✓ feature_ids > 0');
  }

  if (qdrantHits === 0) {
    console.error('✗ Validation failed: qdrant_hits is 0');
    success = false;
  } else {
    console.log('✓ qdrant_hits > 0');
  }

  if (redisKeys.length === 0) {
    console.error('✗ Validation failed: redis_hot_keys is empty');
    success = false;
  } else {
    console.log('✓ redis_hot_keys present');
  }

  if (!row.captured_at) {
    console.error('✗ Validation failed: captured_at is not populated');
    success = false;
  } else {
    console.log('✓ captured_at is populated');
  }

  // 6. Seed traversal check
  const seed = sourceRefs[0];
  if (!seed) {
    console.error('✗ Seed validation failed: no source_ref available to seed traversal');
    success = false;
  } else {
    console.log(`✓ packet can be used as traversal seed (Seed: "${seed}")`);
  }

  await pool.end();

  if (success) {
    console.log('\n🎉 TELEMETRY SMOKE TEST PASSED');
    process.exit(0);
  } else {
    console.error('\n❌ TELEMETRY SMOKE TEST FAILED');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
