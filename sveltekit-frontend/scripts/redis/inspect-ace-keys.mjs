#!/usr/bin/env node
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  connectTimeout: 4000,
});

try {
  await redis.connect();

  const [
    aceFeature,
    aceCtx,
    wikiNotes,
    llmOutput,
  ] = await Promise.all([
    redis.keys('ace:feature:*'),
    redis.keys('ace:ctx:*'),
    redis.keys('wiki:note:dir:*'),
    redis.keys('code:llm_output:path:*'),
  ]);

  console.log(JSON.stringify({
    ok: true,
    redis: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    counts: {
      aceFeature: aceFeature.length,
      aceCtx: aceCtx.length,
      wikiNoteDir: wikiNotes.length,
      llmOutputPath: llmOutput.length,
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