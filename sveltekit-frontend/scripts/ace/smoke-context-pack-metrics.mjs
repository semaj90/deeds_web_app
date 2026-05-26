import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { recordContextCacheAccess } from '../../src/lib/server/cache/ace-context-cache-metrics.ts';

const ROOT = process.cwd();
const LOG_FILE = path.join(ROOT, 'logs', 'ace-context-cache', 'latest.json');

const fakeRedis = {
  state: new Map(),
  async incr(key) {
    const current = Number(this.state.get(key) ?? '0');
    this.state.set(key, String(current + 1));
    return current + 1;
  },
  async hset(key, fields) {
    this.state.set(`${key}:hash`, JSON.stringify(fields));
    return 1;
  },
  async expire(key, ttlSeconds) {
    this.state.set(`${key}:ttl`, String(ttlSeconds));
    return 1;
  },
};

function readLines(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function main() {
  const cacheKey = `smoke-metrics-${Date.now()}`;
  if (existsSync(LOG_FILE)) {
    rmSync(LOG_FILE, { force: true });
  }

  await recordContextCacheAccess(fakeRedis, {
    cacheKey,
    cacheSource: 'redis',
    contextCacheHit: true,
    reusedChunkCount: 3,
    skippedRetrievalLanes: ['qdrant', 'bifrost'],
    promptTokensSavedEstimate: 128,
    timeSavedMsEstimate: 250,
    repoGitSha: 'smoke-sha',
    ragBundleHash: 'smoke-rag',
    graphSnapshotHash: 'smoke-graph',
    kvQuant: 'q8_0/q8_0',
    draftModel: true,
    contextBudgetTokens: 4096,
    finalContextTokens: 1536,
    packId: 'smoke-pack',
    mode: 'context-cache',
    model: 'ace-context-pack',
    queryEmbeddingModel: 'embeddinggemma:latest',
    timeToFirstTokenMs: 12,
    tokensPerSecond: 54.5,
    promptTokens: 42,
    completionTokens: 9,
    cacheScenario: 'smoke',
    query: 'where is auth?',
    intent: 'smoke',
  });

  const lines = readLines(LOG_FILE);
  const last = lines.at(-1);
  if (!last || last.metrics?.cacheKey !== cacheKey) {
    throw new Error('latest cache metrics log was not appended');
  }

  const hitsKey = `ace:ctx:hits:${cacheKey}`;
  const metaKey = `ace:ctx:meta:${cacheKey}`;
  if (fakeRedis.state.get(hitsKey) !== '1') {
    throw new Error('redis hit counter was not incremented');
  }
  if (!fakeRedis.state.has(`${metaKey}:hash`)) {
    throw new Error('redis metadata hash was not written');
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        cacheKey,
        logFile: LOG_FILE,
        hitsKey,
        metaKey,
        lines: lines.length,
      },
      null,
      2
    )
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[ace-context-cache-metrics-smoke] failed:', err);
    process.exit(1);
  });
