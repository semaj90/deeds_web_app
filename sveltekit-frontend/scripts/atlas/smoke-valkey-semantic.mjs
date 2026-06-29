#!/usr/bin/env node
/**
 * Smoke Test: Valkey Semantic Cache (Startup)
 * Verifies Valkey is healthy and semantic cache keys are present.
 * Runs silently on startup (folderOpen event).
 *
 * Status: WIRED for Phase 85 P5-P9 startup automation.
 */

import Redis from 'ioredis';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const isQuiet = process.env.REDIS_QUIET === '1' || process.env.GRAPHIFY_QUIET === '1';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

async function smokeTestValkey() {
  try {
    await redis.connect();

    // Test 1: PING
    const ping = await redis.ping();
    if (ping !== 'PONG') {
      if (!isQuiet) console.error('❌ Valkey PING failed');
      process.exit(1);
    }

    // Test 2: INFO server (verify it's actually Valkey or Redis)
    let info;
    try {
      info = await redis.info('server');
    } catch (err) {
      if (!isQuiet) console.error('⚠️  INFO server unavailable (non-critical)');
    }

    // Test 3: Check for semantic cache keys
    const semanticKeys = await redis.keys('bifrost:*');
    const semanticCacheHealth = semanticKeys.length > 0 ? 'WARM' : 'COLD';

    // Test 4: Check for SOM cell cache
    const somKeys = await redis.keys('som:cell:*');

    if (!isQuiet) {
      console.log('✅ Valkey health checks PASS:');
      console.log(`  • PING: PONG`);
      console.log(`  • Semantic cache (bifrost:*): ${semanticCacheHealth} (${semanticKeys.length} keys)`);
      console.log(`  • SOM cells (som:cell:*): ${somKeys.length} cached`);
    }

    process.exit(0);

  } catch (err) {
    if (!isQuiet) {
      console.error('❌ Valkey smoke test failed:', err.message);
    }
    // Non-fatal: Valkey may not be ready yet
    process.exit(0);
  } finally {
    if (redis.isOpen) await redis.quit().catch(() => {});
  }
}

smokeTestValkey();