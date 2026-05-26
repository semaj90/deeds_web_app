#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  let Redis;
  try {
    ({ default: Redis } = await import('ioredis'));
  } catch {
    throw new Error('ioredis_not_installed');
  }

  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 3000,
  });

  try {
    const patterns = [
      'card:summary:*',
      'card:feature:*',
      'card:path:*',
      'semantic:codebase-map:*',
    ];
    const counts = {};
    const samples = {};
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      counts[pattern] = keys.length;
      samples[pattern] = keys.slice(0, 12);
    }

    console.log(JSON.stringify({
      ok: true,
      redis: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      counts,
      samples,
    }, null, 2));
  } catch (error) {
    console.error(`[redis:cards:keys] ${error?.message ?? String(error)}`);
    process.exit(1);
  } finally {
    await redis.quit().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[redis:cards:keys] ${error?.message ?? String(error)}`);
  process.exit(1);
});
