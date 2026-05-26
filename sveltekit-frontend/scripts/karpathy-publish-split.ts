#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import dotenv from 'dotenv';

import { buildKarpathyPublishSplit } from '../src/lib/server/ace/karpathy-publish-split.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const HYPERGRAPH_PATH = resolve(ROOT, 'docs/graph/hypergraph-clusters.json');
const EXPORT_DIR = resolve(ROOT, 'memory/exports');
const MANIFEST_PATH = resolve(EXPORT_DIR, 'karpathy-publish-split.json');
const SCROLL_PATH = resolve(EXPORT_DIR, 'karpathy-publish-split.jsonl');
const HOTSET_KEY = 'ace:cluster:hot';
const HOTMETA_KEY = 'ace:cluster:tags:__meta';
const TTL_SECONDS = 24 * 60 * 60;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseNumberArg(args, '--limit', 16);
const MIN_HOTNESS = parseNumberArg(args, '--min-hotness', 0);

function parseNumberArg(argv, flag, fallback) {
  const eq = argv.find((value) => value.startsWith(`${flag}=`));
  if (eq) return Number(eq.slice(flag.length + 1));
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) return Number(argv[index + 1]);
  return fallback;
}

function makeRedis() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  return redis;
}

function ensureExportsDir() {
  mkdirSync(EXPORT_DIR, { recursive: true });
}

function readClusters() {
  if (!readFileSync || !HYPERGRAPH_PATH) return [];
  const raw = readFileSync(HYPERGRAPH_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeRedis(redis, manifest) {
  const pipeline = redis.pipeline();

  pipeline.del(HOTSET_KEY);
  pipeline.del(HOTMETA_KEY);

  for (const row of manifest.redis.hotSet) {
    pipeline.zadd(HOTSET_KEY, row.hotness, row.clusterKey);
  }

  pipeline.set(HOTMETA_KEY, JSON.stringify(manifest.redis.meta), 'EX', TTL_SECONDS);

  for (const [clusterKey, payload] of Object.entries(manifest.redis.clusterHashes)) {
    pipeline.del(`ace:cluster:tags:${clusterKey}`);
    pipeline.hset(`ace:cluster:tags:${clusterKey}`, payload);
    pipeline.expire(`ace:cluster:tags:${clusterKey}`, TTL_SECONDS);
  }

  await pipeline.exec();
}

async function main() {
  if (!HYPERGRAPH_PATH) {
    throw new Error('hypergraph cluster source path is not configured');
  }

  const clusters = readClusters();
  if (!clusters.length) {
    throw new Error(`No cluster records found at ${HYPERGRAPH_PATH}`);
  }

  const manifest = buildKarpathyPublishSplit(clusters, {
    limit: Number.isFinite(LIMIT) ? LIMIT : 16,
    minRawHotness: Number.isFinite(MIN_HOTNESS) ? MIN_HOTNESS : 0,
  });

  ensureExportsDir();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeFileSync(
    SCROLL_PATH,
    manifest.scrollRows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  );

  console.log(`[karpathy:publish-split] source=${clusters.length} selected=${manifest.selectedCount}`);
  console.log(`[karpathy:publish-split] wrote ${MANIFEST_PATH}`);
  console.log(`[karpathy:publish-split] wrote ${SCROLL_PATH}`);

  if (DRY_RUN) {
    console.log('[karpathy:publish-split] dry-run only — Redis writes skipped');
    return;
  }

  const redis = makeRedis();
  try {
    await redis.connect();
    await redis.ping();
    await writeRedis(redis, manifest);
    console.log(`[karpathy:publish-split] wrote ${manifest.redis.hotSet.length} hot clusters to Redis`);
  } finally {
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error('[karpathy:publish-split] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});

