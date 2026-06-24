#!/usr/bin/env node
/**
 * audit-valkey-packet.mjs
 *
 * Inspect individual Redis/Valkey packets without installing jq into the container.
 *
 * Usage:
 *   node scripts/atlas/audit-valkey-packet.mjs "bifrost:packet:src/lib/ai/client-embed.ts:964f99c42b1215d9"
 *   node scripts/atlas/audit-valkey-packet.mjs "centroid:feature:auth.sessions"
 */

import Redis from 'ioredis';

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

async function main() {
  const key = process.argv[2];

  if (!key) {
    console.error('Usage: node scripts/atlas/audit-valkey-packet.mjs <redis-key>');
    process.exit(1);
  }

  try {
    await redis.connect();
    const value = await redis.get(key);

    if (!value) {
      console.log(`Key not found: ${key}`);
      process.exit(1);
    }

    try {
      const parsed = JSON.parse(value);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      // Raw string, not JSON
      console.log(value);
    }

  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
