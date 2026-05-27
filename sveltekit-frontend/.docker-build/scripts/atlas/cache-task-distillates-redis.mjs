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

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const DISTILLATES_FILE = resolve(process.cwd(), 'tmp/task-distillates.json');

async function main() {
  console.log('🚀 Atlas: Caching Task Distillates in Redis');

  if (!existsSync(DISTILLATES_FILE)) {
    console.error(`❌ Distillates file not found: ${DISTILLATES_FILE}`);
    process.exit(1);
  }

  const distillates = JSON.parse(readFileSync(DISTILLATES_FILE, 'utf-8'));
  
  const client = createClient({ url: REDIS_URL });
  await client.connect();

  console.log(`🧹 Clearing old task cards...`);
  const keys = await client.keys('ace:task:*');
  if (keys.length > 0) {
    await client.del(keys);
  }

  console.log(`📥 Caching ${distillates.length} task cards...`);
  for (const task of distillates) {
    const key = `ace:task:${task.task_key}`;
    await client.set(key, JSON.stringify(task));
  }

  const count = await client.keys('ace:task:*');
  console.log(`✅ Cached ${count.length} task cards in Redis.`);

  await client.disconnect();
}

main().catch(err => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
