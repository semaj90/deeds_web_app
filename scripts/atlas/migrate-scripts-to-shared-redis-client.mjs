#!/usr/bin/env node
/**
 * Migration guide: Convert existing Redis scripts to use shared redis-client-factory.mjs
 *
 * This script demonstrates the migration pattern without modifying existing scripts.
 * Use this as a reference when refactoring older pipeline scripts.
 */

import { createAtlasRedisClient, VECTOR_LANE_REGISTRY, getAtlasRedisConfig } from './lib/redis-client-factory.mjs';

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !process.argv.includes('--apply');

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

/**
 * BEFORE: Old pattern (scattered across scripts)
 * ❌ WRONG:
 *   const redis = new Redis('redis://127.0.0.1:6379', { password: REDIS_PASSWORD });
 *   const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379, password: ... });
 *
 * AFTER: New pattern (canonical)
 * ✅ CORRECT:
 *   import { createAtlasRedisClient, VECTOR_LANE_REGISTRY } from './lib/redis-client-factory.mjs';
 *   const redis = createAtlasRedisClient();
 *   await redis.connect();
 */

async function testNewPattern() {
  log('\n📋 Testing Shared Redis Client Pattern\n');

  // Show current config
  const config = getAtlasRedisConfig();
  log('Current environment config:');
  log(JSON.stringify(config, null, 2));

  // Create client using the shared helper
  const redis = createAtlasRedisClient();
  log('\n✔️ Client created via createAtlasRedisClient()');

  try {
    await redis.connect();
    log('✔️ Connected to Redis successfully');

    // Test PING
    const pong = await redis.ping();
    log(`✔️ PING response: ${pong}`);

    // Test write operation (dry-run safe)
    const testKey = 'atlas:migration:test';
    const testValue = {
      timestamp: new Date().toISOString(),
      scriptVersion: '1.0',
      vectorLanesRegistered: Object.keys(VECTOR_LANE_REGISTRY).length
    };

    if (DRY_RUN) {
      log(`\n🔍 DRY-RUN: Would set key ${testKey}`);
      log(`   Value: ${JSON.stringify(testValue)}`);
    } else {
      await redis.setex(testKey, 300, JSON.stringify(testValue));
      log(`\n✅ SET ${testKey} (TTL: 300s)`);

      const readBack = await redis.get(testKey);
      log(`✅ GET ${testKey}: ${readBack?.substring(0, 50)}...`);
    }

    // Show vector lane registry
    log('\n📦 Vector Lane Registry:');
    for (const [lane, config] of Object.entries(VECTOR_LANE_REGISTRY)) {
      log(`  ${lane}:`);
      log(`    Role: ${config.role}`);
      log(`    Dimensions: ${config.dimensions}`);
      log(`    Model: ${config.model} (${config.modelVersion})`);
      log(`    Authoritative: ${config.authoritative}`);
      log(`    Online Search: ${config.onlineSearch}`);
    }

    log('\n✅ All tests passed!');

  } catch (err) {
    log(`\n❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.quit();
    log('\n✔️ Connection closed');
  }
}

/**
 * Show migration checklist for a specific script
 */
function showMigrationChecklist(scriptName) {
  log(`\n📝 Migration Checklist for ${scriptName}:\n`);
  log('1. ✅ Replace individual env var reading:');
  log('   OLD: const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";');
  log('   NEW: (removed — managed by createAtlasRedisClient)');
  log('');
  log('2. ✅ Replace Redis constructor call:');
  log('   OLD: const redis = new Redis({ host, port, password });');
  log('   NEW: const redis = createAtlasRedisClient();');
  log('');
  log('3. ✅ Add explicit connection (if not lazyConnect):');
  log('   ADD: await redis.connect();');
  log('');
  log('4. ✅ (Optional) Use vector lane registry for context:');
  log('   ADD: import { VECTOR_LANE_REGISTRY } from "./lib/redis-client-factory.mjs";');
  log('   ADD: const canonical768d = VECTOR_LANE_REGISTRY.DENSE_768;');
  log('');
  log('5. ✅ Update error handling:');
  log('   ADD: client.on("error", (err) => { /* handle */ });');
  log('');
  log('6. ✅ Clean up on exit:');
  log('   ADD: await redis.quit();');
}

/**
 * Generate before/after migration example
 */
function showFullExample() {
  log('\n📚 Full Migration Example\n');

  log('BEFORE (scattered pattern):');
  log('═'.repeat(60));
  log(`
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

async function main() {
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true
  });

  try {
    await redis.connect();
    const result = await redis.get('some-key');
    console.log(result);
  } finally {
    await redis.quit();
  }
}
  `);

  log('\nAFTER (canonical pattern):');
  log('═'.repeat(60));
  log(`
import { createAtlasRedisClient, VECTOR_LANE_REGISTRY } from './lib/redis-client-factory.mjs';

async function main() {
  const redis = createAtlasRedisClient();

  try {
    await redis.connect();
    const result = await redis.get('some-key');
    console.log(result);
  } finally {
    await redis.quit();
  }
}
  `);

  log('\n✨ Benefits:');
  log('  • Single source of truth for Redis config');
  log('  • Prevents REDIS_PASSWORD divergence');
  log('  • Vector lane registry documents embedding strategies');
  log('  • Standardized error handling');
  log('  • Easy to audit and upgrade');
}

// Main
(async () => {
  log('🚀 Redis Client Factory Migration Guide\n');

  // Run the test
  await testNewPattern();

  // Show examples
  showFullExample();
  showMigrationChecklist('your-script.mjs');

  log('\n📖 Scripts already using shared pattern:');
  log('  (none yet — this is the first deployment)');

  log('\n📋 Scripts to migrate (priority order):');
  log('  1. graphify-semantic-cluster.mjs (P0 — daily pipeline)');
  log('  2. graphify-cluster-pagerank.mjs (P0 — daily pipeline)');
  log('  3. prewarm-compact-cache.mjs (P0 — daily pipeline)');
  log('  4. daily-graphify-cold-processing.mjs (P1 — optional)');
  log('  5. backfill-redis-cache-from-postgres.mjs (P1 — already working)');

  log('\n✅ Done. Review the patterns above and migrate scripts incrementally.');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
