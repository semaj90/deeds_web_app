import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIntentSynthesisKey,
  buildIntentSynthesisQueryHash,
  getIntentSynthesisCandidate,
  writeIntentSynthesisRecord,
} from '../../src/lib/server/ace/intent-synthesis.ts';
import { pool } from '../../src/lib/server/db/client.ts';
import { getRedis, redisPool } from '../../src/lib/server/redis.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.resolve(ROOT, 'logs', 'ace-intent-synthesis');

async function main() {
  await fs.mkdir(LOG_DIR, { recursive: true });

  const query = 'where is auth?';
  const contextPackKey = 'smoke:ace-intent-synthesis';
  const queryHash = buildIntentSynthesisQueryHash(query);
  const cacheKey = buildIntentSynthesisKey(query, contextPackKey);
  const redis = getRedis();
  const [weightsCount, metaCount] = await Promise.all([
    redis.hlen('ace:autoencoder:weights'),
    redis.hlen('ace:autoencoder:meta'),
  ]);
  const weightsPresent = weightsCount > 0 && metaCount > 0;
  const expectedDegraded = !weightsPresent;
  const expectedReason = expectedDegraded ? 'autoencoder_weights_pending' : null;

  const written = await writeIntentSynthesisRecord({
    queryHash,
    contextPackKey,
    sourceRefs: [
      'src/lib/server/ace/intent-synthesis.ts',
      'src/lib/server/ace/llm-context-cache.ts',
    ],
    chunkIds: ['chunk:auth:1', 'chunk:auth:2'],
    summaryIds: ['summary:auth:1'],
    authority: { combinedScore: 0.42, graphAuthority: 0.36, pagerank: 0.31 },
    retrievalTrace: {
      redisHit: false,
      postgresHit: false,
      localJsonHit: false,
      degraded: true,
    },
    cachedSteps: ['ACE context pack', 'HyperRAG fallback', 'Gemma4 synthesis'],
  });

  const candidate = await getIntentSynthesisCandidate(query, contextPackKey);
  const report = {
    query,
    contextPackKey,
    cacheKey,
    queryHash,
    weightsPresent,
    written,
    candidate,
    degradedReason: candidate?.degradedReason ?? written.degradedReason ?? null,
  };

  await fs.writeFile(
    path.join(LOG_DIR, 'latest.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  console.log(JSON.stringify({
    cacheKey,
    degraded: written.degraded,
    degradedReason: written.degradedReason,
    weightsPresent,
    roundTrip: Boolean(candidate),
    output: path.join(LOG_DIR, 'latest.json'),
  }, null, 2));

  if (!candidate) process.exitCode = 1;
  if (written.degraded !== expectedDegraded || (written.degradedReason ?? null) !== expectedReason) {
    process.exitCode = 1;
  }
  if (candidate && (candidate.degraded !== expectedDegraded || candidate.degradedReason !== expectedReason)) {
    process.exitCode = 1;
  }

  await redisPool.closeAll().catch(() => {});
  await pool.end().catch(() => {});
}

main().catch(err => {
  console.error('[ace:intent-synthesis:smoke] Fatal:', err?.message ?? err);
  process.exit(1);
});
