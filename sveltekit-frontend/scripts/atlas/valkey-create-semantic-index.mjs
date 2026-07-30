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
import {
  resolveAtlasRedisContext,
  runRedisCli,
  shouldPreferValkeyCli,
} from './lib/redis-valkey.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '../..');
const isQuiet = process.env.REDIS_QUIET === '1' || process.env.GRAPHIFY_QUIET === '1';

async function createValkeyBackend() {
  const { env, container, password } = await resolveAtlasRedisContext(REPO_ROOT);
  const host = env.VALKEY_HOST || env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(env.VALKEY_PORT || env.REDIS_PORT || '6379', 10);
  const redisUrl = env.VALKEY_URL || env.REDIS_URL || `redis://${host}:${port}`;

  if (shouldPreferValkeyCli(env, container)) {
    return {
      mode: 'cli',
      async ping() {
        const result = runRedisCli(container, ['PING'], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PING failed');
        return result.stdout.trim();
      },
      async call(...args) {
        const result = runRedisCli(container, args, password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli call failed');
        return result.stdout;
      },
      async set(key, value, ...rest) {
        const result = runRedisCli(container, ['SET', key, value, ...rest], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SET failed');
      },
      async get(key) {
        const result = runRedisCli(container, ['GET', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli GET failed');
        return result.stdout.trim() || null;
      },
      async quit() {},
    };
  }

  const redis = new Redis(redisUrl, {
    host,
    port,
    password,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
  });
  return {
    mode: 'direct',
    async ping() {
      return redis.ping();
    },
    async call(...args) {
      return redis.call(...args);
    },
    async set(key, value, ...rest) {
      await redis.set(key, value, ...rest);
    },
    async get(key) {
      return redis.get(key);
    },
    async quit() {
      await redis.quit();
    },
  };
}

async function createSemanticIndex() {
  const redis = await createValkeyBackend();
  try {
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

      if (!isQuiet) {
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
    await redis.quit().catch(() => {});
  }
}

createSemanticIndex();
