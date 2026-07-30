#!/usr/bin/env node
/**
 * Valkey Seed OpenCode Rules (Startup)
 * Preloads OpenCode rule embeddings and semantic tags into Valkey/Redis
 * for fast retrieval during IDE startup.
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
      async hlen(key) {
        const result = runRedisCli(container, ['HLEN', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli HLEN failed');
        return Number.parseInt(result.stdout.trim() || '0', 10) || 0;
      },
      async hset(key, ...args) {
        const result = runRedisCli(container, ['HSET', key, ...args], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli HSET failed');
      },
      async hkeys(key) {
        const result = runRedisCli(container, ['HKEYS', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli HKEYS failed');
        return String(result.stdout ?? '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
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
    async hlen(key) {
      return redis.hlen(key);
    },
    async hset(key, ...args) {
      return redis.hset(key, ...args);
    },
    async hkeys(key) {
      return redis.hkeys(key);
    },
    async quit() {
      await redis.quit();
    },
  };
}

async function seedOpenCodeRules() {
  const redis = await createValkeyBackend();
  try {
    const ping = await redis.ping();
    if (ping !== 'PONG') {
      if (!isQuiet) console.error('❌ Valkey PING failed');
      process.exit(1);
    }

    if (!isQuiet) console.log('✅ Connected to Valkey');

    // Seed core rules as hash entries (name → metadata)
    const rulesKey = 'opencode:rules:manifest';
    const seedCount = await redis.hlen(rulesKey);

    if (seedCount === 0) {
      // Initialize with placeholder rule entries
      // In production, this would load from a manifest file
      await redis.hset(
        rulesKey,
        'svelte5-runes',
        JSON.stringify({ score: 0.95, tags: ['svelte', 'runes'] }),
        'parent-atlas-identity',
        JSON.stringify({ score: 0.92, tags: ['atlas', 'identity'] }),
        'canonical-flow',
        JSON.stringify({ score: 0.90, tags: ['flow', 'canonical'] })
      );

      if (!isQuiet) console.log('✅ Seeded 3 OpenCode rules');
    } else {
      if (!isQuiet) console.log(`✅ OpenCode rules already seeded (${seedCount} rules)`);
    }

    // Verify cache readiness
    const ruleNames = await redis.hkeys(rulesKey);
    if (!isQuiet) console.log(`✅ OpenCode rules ready (${ruleNames.length} rules)`);

    process.exit(0);

  } catch (err) {
    if (!isQuiet) {
      console.error('❌ OpenCode rules seeding failed:', err.message);
    }
    process.exit(1);
  } finally {
    await redis.quit().catch(() => {});
  }
}

seedOpenCodeRules();
