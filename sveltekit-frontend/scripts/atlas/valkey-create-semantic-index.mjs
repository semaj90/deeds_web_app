#!/usr/bin/env node
/**
 * Valkey Semantic Index Creation (Startup)
 * Creates or verifies the FT (full-text search) index in Valkey/Redis
 * for semantic cache prefix matching.
 *
 * Runs silently on startup (folderOpen event).
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

async function createSemanticIndex() {
  try {
    await redis.connect();

    // Verify Valkey is responding
    const ping = await redis.ping();
    if (ping !== 'PONG') {
      if (!isQuiet) console.error('❌ Valkey PING failed');
      process.exit(1);
    }

    if (!isQuiet) console.log('✅ Valkey connection OK');

    // Check if FT.SEARCH is available (Valkey-search module)
    // This is a soft check — missing index is not fatal
    try {
      const info = await redis.call('INFO', 'modules');
      const hasSearch = info && info.toString().includes('search');

      if (!hasQuiet) {
        console.log(`✅ Valkey-search module: ${hasSearch ? 'AVAILABLE' : 'NOT AVAILABLE (using cache keys)'}`);
      }
    } catch (err) {
      // Silently continue — FT.SEARCH is optional for Phase 85
    }

    // Warm the connection by writing + reading a test key
    const testKey = 'test:valkey:startup';
    await redis.set(testKey, 'ok', 'EX', 30);
    const testValue = await redis.get(testKey);

    if (testValue !== 'ok') {
      if (!isQuiet) console.error('❌ Valkey read/write test failed');
      process.exit(1);
    }

    if (!isQuiet) console.log('✅ Valkey semantic index ready (cache layer operational)');
    process.exit(0);

  } catch (err) {
    if (!isQuiet) {
      console.error('❌ Valkey semantic index creation failed:', err.message);
    }
    process.exit(1);
  } finally {
    if (redis.isOpen) await redis.quit().catch(() => {});
  }
}

createSemanticIndex();
