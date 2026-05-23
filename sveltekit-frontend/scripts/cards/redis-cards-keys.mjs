#!/usr/bin/env node
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  connectTimeout: 4000,
});

try {
  await redis.connect();

  const [summary, byPath, byFeature, semantic, active, resolved, recent] = await Promise.all([
    redis.keys('card:summary:*'),
    redis.keys('card:path:*'),
    redis.keys('card:feature:*'),
    redis.keys('semantic:codebase-map:*'),
    redis.llen('error:list:active').catch(() => 0),
    redis.llen('error:list:resolved').catch(() => 0),
    redis.llen('obs:error-agent:recent').catch(() => 0),
  ]);

  console.log(JSON.stringify({
    ok: true,
    counts: {
      cardSummary: summary.length,
      cardPathSets: byPath.length,
      cardFeatureSets: byFeature.length,
      semanticCodebaseMap: semantic.length,
    },
    errorLists: {
      active: Number(active || 0),
      resolved: Number(resolved || 0),
      recent: Number(recent || 0),
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
} finally {
  await redis.quit().catch(() => {});
}
