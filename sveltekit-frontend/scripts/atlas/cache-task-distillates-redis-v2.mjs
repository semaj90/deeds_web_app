#!/usr/bin/env node
/**
 * scripts/atlas/cache-task-distillates-redis.mjs
 * 
 * Caches v2 task cards in Redis.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;
const DISTILLATES_FILE = resolve(process.cwd(), 'tmp/task-distillates-v2.json');

async function main() {
  if (!REDIS_URL) throw new Error('REDIS_URL is required');
  console.log('🚀 Atlas: Caching v2 Task Distillates in Redis...');

  if (!existsSync(DISTILLATES_FILE)) {
    console.error(`❌ Distillates file not found: ${DISTILLATES_FILE}`);
    process.exit(1);
  }

  const distillates = JSON.parse(readFileSync(DISTILLATES_FILE, 'utf-8'));
  
  const client = createClient({ url: REDIS_URL });
  await client.connect();

  console.log(`📥 Caching ${distillates.length} v2 task cards...`);
  for (const task of distillates) {
    await client.set(`ace:task:${task.task_key}`, JSON.stringify(task));
  }

  console.log('✅ v2 Task cards cached.');
  await client.disconnect();
}

main().catch(err => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
