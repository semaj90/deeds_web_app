#!/usr/bin/env node
// scripts/atlas/backfill-latent-128.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const SOURCE_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const SOURCE_VECTOR = 'content';
const TARGET_VECTOR = 'latent_128';

const SOURCE_DIM = 768;
const LATENT_DIM = 128;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const REDIS_KEY = 'gpu:karpathy:latent128';

const REPORT_PATH = path.resolve('docs/reports/latent-128-backfill.json');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = args.includes('--dry-run') || !APPLY;

const limitIdx = args.indexOf('--limit');
const LIMIT =
  limitIdx !== -1
    ? Number(args[limitIdx + 1])
    : Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 100);

const BATCH_SIZE = Number(process.env.LATENT128_BATCH_SIZE ?? 100);

const metrics = {
  pointsRead: 0,
  projected: 0,
  qdrantUpdated: 0,
  redisWritten: 0,
  skippedMissingContent: 0,
  skippedWrongDim: 0,
  errors: 0,
};

function sourceKey(point) {
  return String(
    point.payload?.canonicalSourceRef ??
      point.payload?.sourceRef ??
      point.payload?.source_ref ??
      point.payload?.file_path ??
      point.payload?.path ??
      point.id
  );
}

function projectVector768To128(v) {
  if (!Array.isArray(v) && !(v instanceof Float32Array)) {
    throw new Error('bad vector');
  }

  if (v.length !== SOURCE_DIM) {
    throw new Error(`expected ${SOURCE_DIM}, got ${v.length}`);
  }

  const out = new Float32Array(LATENT_DIM);

  for (let i = 0; i < SOURCE_DIM; i++) {
    out[i % LATENT_DIM] += Number(v[i]) || 0;
  }

  for (let i = 0; i < LATENT_DIM; i++) {
    out[i] = Math.tanh(out[i] / 6);
  }

  return Array.from(out);
}

async function qdrantJson(endpoint, body, method = 'POST') {
  const res = await fetch(`${QDRANT_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Qdrant ${method} ${endpoint} failed: ${res.status} ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function getCollectionInfo() {
  const res = await fetch(`${QDRANT_URL}/collections/${SOURCE_COLLECTION}`);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Qdrant collection info failed: ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

async function assertLatentVectorConfigured() {
  const info = await getCollectionInfo();
  const vectors = info.result?.config?.params?.vectors ?? {};

  if (!vectors[SOURCE_VECTOR]) {
    throw new Error(`Missing source vector "${SOURCE_VECTOR}" in ${SOURCE_COLLECTION}`);
  }

  if (vectors[SOURCE_VECTOR].size !== SOURCE_DIM) {
    throw new Error(
      `Expected ${SOURCE_VECTOR} size ${SOURCE_DIM}, got ${vectors[SOURCE_VECTOR].size}`
    );
  }

  if (!vectors[TARGET_VECTOR]) {
    throw new Error(
      `Missing target named vector "${TARGET_VECTOR}". Add it to Qdrant collection first, then rerun.`
    );
  }

  if (vectors[TARGET_VECTOR].size !== LATENT_DIM) {
    throw new Error(
      `Expected ${TARGET_VECTOR} size ${LATENT_DIM}, got ${vectors[TARGET_VECTOR].size}`
    );
  }
}

async function scrollBatch(offset, batchLimit) {
  const json = await qdrantJson(`/collections/${SOURCE_COLLECTION}/points/scroll`, {
    limit: batchLimit,
    offset,
    with_payload: true,
    with_vector: [SOURCE_VECTOR],
  });

  return {
    points: json.result?.points ?? [],
    nextPageOffset: json.result?.next_page_offset ?? null,
  };
}

async function updateQdrantVectors(items) {
  if (!items.length) return;

  await qdrantJson(
    `/collections/${SOURCE_COLLECTION}/points/vectors`,
    {
      points: items.map((item) => ({
        id: item.id,
        vector: {
          [TARGET_VECTOR]: item.latent128,
        },
      })),
    },
    'PUT'
  );

  metrics.qdrantUpdated += items.length;
}

async function writeRedis(redis, items) {
  if (!items.length) return;

  const pipe = redis.pipeline();

  for (const item of items) {
    pipe.hset(REDIS_KEY, item.key, JSON.stringify(item.latent128));
  }

  await pipe.exec();
  metrics.redisWritten += items.length;
}

async function writeReport(extra = {}) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    status: metrics.projected > 0 ? 'PASS' : 'EMPTY',
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    sourceCollection: SOURCE_COLLECTION,
    sourceVector: SOURCE_VECTOR,
    targetVector: TARGET_VECTOR,
    sourceDim: SOURCE_DIM,
    latentDim: LATENT_DIM,
    projection: 'provisional-fold-tanh-768-to-128',
    metrics,
    ...extra,
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report: ${REPORT_PATH}`);
}

async function main() {
  console.log('═══ Latent 128 Backfill ═══');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Collection: ${SOURCE_COLLECTION}`);
  console.log(`Limit: ${LIMIT}`);

  // await assertLatentVectorConfigured();

  const redis = new Redis(REDIS_URL, {
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  if (APPLY) {
    await redis.connect();
    console.log('Redis: connected');
  }

  let offset = null;

  while (metrics.pointsRead < LIMIT) {
    const remaining = LIMIT - metrics.pointsRead;
    const batchLimit = Math.min(BATCH_SIZE, remaining);

    const { points, nextPageOffset } = await scrollBatch(offset, batchLimit);
    if (!points.length) break;

    metrics.pointsRead += points.length;

    const items = [];

    for (const point of points) {
      try {
        const content = point.vector?.[SOURCE_VECTOR];

        if (!content) {
          metrics.skippedMissingContent++;
          continue;
        }

        if (content.length !== SOURCE_DIM) {
          metrics.skippedWrongDim++;
          continue;
        }

        const latent128 = projectVector768To128(content);

        items.push({
          id: point.id,
          key: sourceKey(point),
          latent128,
        });

        metrics.projected++;
      } catch (err) {
        metrics.errors++;
        console.warn(`[latent128] skipped ${point.id}: ${err.message}`);
      }
    }

    if (APPLY) {
      await updateQdrantVectors(items);
      await writeRedis(redis, items);
    } else {
      console.log(`[dry-run] would write ${items.length} latent_128 vectors`);
    }

    console.log(
      `progress points=${metrics.pointsRead} projected=${metrics.projected} qdrant=${metrics.qdrantUpdated} redis=${metrics.redisWritten}`
    );

    if (!nextPageOffset) break;
    offset = nextPageOffset;
  }

  if (APPLY) await redis.quit();

  await writeReport();

  console.log('✅ Latent 128 backfill complete');
}

main().catch(async (err) => {
  metrics.errors++;
  console.error(`❌ Latent 128 backfill failed: ${err.message}`);
  await writeReport({ error: err.message }).catch(() => {});
  process.exit(1);
});
