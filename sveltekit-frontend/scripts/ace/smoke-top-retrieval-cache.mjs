import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.resolve(ROOT, '.cache', 'ace', 'top-retrieval');
const REDIS_CONTAINER = process.env.DEEDS_REDIS_CONTAINER || 'legal-ai-redis';

function buildAceTopRetrievalCacheKey(queryHash, topN = 20) {
  return `ace:retrieval:topn:${queryHash}:${topN}`;
}

function buildAceTopRetrievalQueryHash(query) {
  return createHash('sha256').update(query).digest('hex').slice(0, 24);
}

function sanitizeCacheKey(key) {
  return key.replace(/[:<>"/\\|?*]+/g, '_');
}

function runDocker(args) {
  return spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
}

async function readRedisJson(key) {
  const result = runDocker(['exec', REDIS_CONTAINER, 'redis-cli', 'GET', key]);
  if (result.status !== 0) return null;
  const raw = (result.stdout || '').trim();
  if (!raw || raw === '(nil)') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setRedisJson(key, value) {
  const result = runDocker(['exec', '-i', REDIS_CONTAINER, 'redis-cli', 'SET', key, JSON.stringify(value)]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Failed to set ${key}`);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const query = 'smoke top retrieval cache';
  const queryHash = buildAceTopRetrievalQueryHash(query);
  const cacheKey = buildAceTopRetrievalCacheKey(queryHash, 2);
  const snapshotPath = path.join(CACHE_DIR, `${sanitizeCacheKey(cacheKey)}.json`);
  const entry = {
    cacheKey,
    queryHash,
    topN: 2,
    createdAt: new Date().toISOString(),
    degraded: false,
    results: [
      {
        id: 'result-1',
        score: 0.99,
        sourceRef: 'src/lib/server/cache/ace-top-retrieval-cache.ts',
        title: 'Smoke result one',
        clusterId: 'cluster_smoke',
        featureFamily: 'ace-cache',
        snippet: 'top retrieval cache smoke',
      },
      {
        id: 'result-2',
        score: 0.88,
        sourceRef: 'src/lib/server/cache/ace-context-pack-cache.ts',
        title: 'Smoke result two',
        clusterId: 'cluster_smoke',
        featureFamily: 'ace-cache',
        snippet: 'second result',
      },
    ],
    retrievalTrace: { topN: 2, source: 'top-retrieval-cache' },
  };

  await fs.writeFile(snapshotPath, JSON.stringify(entry, null, 2), 'utf8');
  await setRedisJson(cacheKey, entry);
  const redisReadback = await readRedisJson(cacheKey);
  const snapshotExists = await exists(snapshotPath);

  const report = {
    cacheKey,
    queryHash,
    topN: entry.topN,
    redisOk: Boolean(redisReadback && redisReadback.cacheKey === cacheKey),
    snapshotExists,
    snapshotPath,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.redisOk || !report.snapshotExists) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
