#!/usr/bin/env node
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  connectTimeout: 4000,
});

try {
  await redis.connect();

  const [semanticKeys, cardKeys, exactKeys, errorActiveLen, errorResolvedLen, errorRecentLen] = await Promise.all([
    redis.keys('semantic:codebase-map:*'),
    redis.keys('card:summary:*'),
    redis.keys('llm:exact:*'),
    redis.llen('error:list:active').catch(() => 0),
    redis.llen('error:list:resolved').catch(() => 0),
    redis.llen('obs:error-agent:recent').catch(() => 0),
  ]);

  console.log(JSON.stringify({
    ok: true,
    redis: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    semanticCodebaseMapKeys: semanticKeys.length,
    cardSummaryKeys: cardKeys.length,
    llmExactPromptCacheKeys: exactKeys.length,
    errorQueue: {
      active: Number(errorActiveLen || 0),
      resolved: Number(errorResolvedLen || 0),
      recent: Number(errorRecentLen || 0),
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
} finally {
  await redis.quit().catch(() => {});
}
