#!/usr/bin/env node
/**
 * scripts/atlas/cache-task-distillates-redis.mjs
 * 
 * Caches task distillates in Redis for low-latency retrieval 
 * during HyperRAG synthesis.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from 'redis';
import {
  resolveAtlasRedisContext,
  runRedisCli,
  shouldPreferValkeyCli,
} from './lib/redis-valkey.mjs';

const DISTILLATES_FILE = resolve(process.cwd(), 'tmp/task-distillates.json');
const HLL_KEY = 'ace:task:hll:keys';

async function main() {
  console.log('🚀 Atlas: Caching Task Distillates in Redis');

  if (!existsSync(DISTILLATES_FILE)) {
    console.error(`❌ Distillates file not found: ${DISTILLATES_FILE}`);
    process.exit(1);
  }

  const distillates = JSON.parse(readFileSync(DISTILLATES_FILE, 'utf-8'));
  const { env, container, password } = await resolveAtlasRedisContext(resolve(process.cwd()));
  const host = env.VALKEY_HOST || env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(env.VALKEY_PORT || env.REDIS_PORT || '6379', 10);
  const redisUrl = env.VALKEY_URL || env.REDIS_URL || `redis://${host}:${port}`;
  const preferCli = shouldPreferValkeyCli(env, container);

  const client = preferCli
    ? {
        mode: 'cli',
        async connect() {},
        async set(key, value) {
          const result = runRedisCli(container, ['SET', key, value], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SET failed');
        },
        async del(keys) {
          const result = runRedisCli(container, ['DEL', ...keys], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli DEL failed');
        },
        async keys(pattern) {
          const result = runRedisCli(container, ['--raw', 'KEYS', pattern], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli KEYS failed');
          return String(result.stdout ?? '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        },
        async pfadd(key, ...members) {
          const result = runRedisCli(container, ['PFADD', key, ...members], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFADD failed');
        },
        async pfcount(key) {
          const result = runRedisCli(container, ['PFCOUNT', key], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFCOUNT failed');
          return Number.parseInt(result.stdout.trim() || '0', 10) || 0;
        },
        async disconnect() {},
      }
    : createClient({ url: redisUrl });

  if (!preferCli) await client.connect();

  console.log(`🧹 Clearing old task cards...`);
  const keys = await client.keys('ace:task:*');
  if (keys.length > 0) {
    await client.del(keys);
  }

  console.log(`📥 Caching ${distillates.length} task cards...`);
  for (const task of distillates) {
    const key = `ace:task:${task.task_key}`;
    await client.set(key, JSON.stringify(task));
    if (typeof client.pfadd === 'function') {
      await client.pfadd(HLL_KEY, task.task_key);
    }
  }

  const count = await client.keys('ace:task:*');
  console.log(`✅ Cached ${count.length} task cards in Redis.`);
  if (typeof client.pfcount === 'function') {
    console.log(`🔢 HyperLogLog summary: ${HLL_KEY} = ${await client.pfcount(HLL_KEY)}`);
  }

  await client.disconnect();
}

main().catch(err => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
