import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIntentSynthesisQueryHash,
  buildIntentSynthesisKey,
} from '../../src/lib/server/ace/intent-synthesis.ts';
import {
  getRecentIntentRewards,
  writeIntentReward,
} from '../../src/lib/server/ace/intent-synthesis-reward.ts';
import { pool } from '../../src/lib/server/db/client.ts';
import { getRedis, redisPool } from '../../src/lib/server/redis.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.resolve(ROOT, 'logs', 'ace-intent-reward');

async function main() {
  await fs.mkdir(LOG_DIR, { recursive: true });

  const query = 'where is auth?';
  const contextPackKey = 'smoke:ace-intent-reward';
  const queryHash = buildIntentSynthesisQueryHash(query);
  const rewardKey = buildIntentSynthesisKey(query, contextPackKey);
  const redis = getRedis();
  const [weightsCount, metaCount] = await Promise.all([
    redis.hlen('ace:autoencoder:weights').catch(() => 0),
    redis.hlen('ace:autoencoder:meta').catch(() => 0),
  ]);
  const karpathyEncodedCount = await redis.hlen('gpu:karpathy:encoded').catch(() => 0);
  const degradedReason = karpathyEncodedCount > 0 ? null : 'karpathy_encoded_pending';

  const written = await writeIntentReward({
    queryHash,
    contextPackKey,
    selectedLane: karpathyEncodedCount > 0 ? 'qdrant' : 'degraded',
    sourceRefs: [
      'src/lib/server/ace/context-assembler.ts',
      'src/lib/server/ace/intent-synthesis-reward.ts',
    ],
    chunkIds: ['chunk:auth:1', 'chunk:auth:2'],
    retrievedCards: [{ id: 'card:auth:1', title: 'Auth route' }],
    authority: { combinedScore: 0.87, graphAuthority: 0.81, pagerank: 0.77 },
    retrievalTrace: {
      cacheHit: true,
      cacheSource: 'redis',
      lane: 'qdrant',
      karpathyEncodedCount,
    },
    cachedSteps: ['ACE pack', 'Retrieval', 'Synthesis'],
    degraded: karpathyEncodedCount === 0,
    degradedReason,
    cacheHit: true,
    latencyMs: 850,
  });

  const recent = await getRecentIntentRewards(5, queryHash);
  const latest = recent[0] ?? null;
  const rewardCache = await redis.get(`ace:reward:latest:${queryHash}`).catch(() => null);

  const report = {
    query,
    contextPackKey,
    rewardKey,
    queryHash,
    weightsCount,
    metaCount,
    karpathyEncodedCount,
    written,
    recent,
    latest,
    rewardCache: rewardCache ? JSON.parse(rewardCache) : null,
    degradedReason,
  };

  await fs.writeFile(
    path.join(LOG_DIR, 'latest.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  console.log(JSON.stringify({
    rewardKey,
    rewardScore: written.rewardScore,
    degraded: written.degraded,
    degradedReason: written.degradedReason,
    rowCount: recent.length,
    output: path.join(LOG_DIR, 'latest.json'),
  }, null, 2));

  if (!latest || latest.queryHash !== queryHash) process.exitCode = 1;
  if (!rewardCache) process.exitCode = 1;

  await redisPool.closeAll().catch(() => {});
  await pool.end().catch(() => {});
}

main().catch(err => {
  console.error('[ace:intent-reward:smoke] Fatal:', err?.message ?? err);
  process.exit(1);
});
