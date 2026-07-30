#!/usr/bin/env node
/**
 * scripts/atlas/cache-task-distillates-redis.mjs
 * 
 * Caches v2 task cards in Redis.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from 'redis';
import {
  resolveAtlasRedisContext,
  runRedisCli,
  shouldPreferValkeyCli,
} from './lib/redis-valkey.mjs';

const DISTILLATES_FILE = resolve(process.cwd(), 'tmp/task-distillates-v2.json');
const HLL_KEY = 'ace:task:v2:hll:keys';

async function main() {
  console.log('🚀 Atlas: Caching v2 Task Distillates in Redis...');

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

  console.log(`📥 Caching ${distillates.length} v2 task cards...`);
  for (const task of distillates) {
    await client.set(`ace:task:${task.task_key}`, JSON.stringify(task));
    if (typeof client.pfadd === 'function') {
      await client.pfadd(HLL_KEY, task.task_key);
    }
  }

  console.log('✅ v2 Task cards cached.');
  if (typeof client.pfcount === 'function') {
    console.log(`🔢 HyperLogLog summary: ${HLL_KEY} = ${await client.pfcount(HLL_KEY)}`);
  }
  await client.disconnect();
}

main().catch(err => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
