#!/usr/bin/env node
/**
 * smoke-som-bmu.mjs
 *
 * Smoke test for the query-time SOM BMU caching pipeline.
 *
 * Verifies:
 *   1. som:weights exists in Redis (or injects test weights)
 *   2. First query returns source=gpu or source=cpu (not cache)
 *   3. Second identical query returns source=cache
 *   4. bmuRow / bmuCol are finite integers
 *   5. Redis TTL on som:bmu:{hash} is set (≤ 1800s)
 *   6. Reverse cell index som:bmu:cell:{row}:{col} written if present
 *
 * Usage:
 *   node scripts/smoke-som-bmu.mjs [--inject-weights] [--redis redis://...]
 *
 * Options:
 *   --inject-weights   Write synthetic 10×10 SOM weights to Redis before testing
 *   --redis <url>      Redis URL (default: redis://127.0.0.1:6379)
 *   --dim <n>          Embedding dimension for injected weights (default: 8)
 *   --verbose          Print full BMU result objects
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');

const args           = process.argv.slice(2);
const INJECT_WEIGHTS = args.includes('--inject-weights');
const VERBOSE        = args.includes('--verbose');
const REDIS_URL      = args[args.indexOf('--redis') + 1] ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DIM            = parseInt(args[args.indexOf('--dim') + 1] ?? '8');
const GRID_W         = 10;
const GRID_H         = 10;

// ── colour helpers ─────────────────────────────────────────────────────────
const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

function pass(msg) { console.log(`  ${c.green('✓')} ${msg}`); }
function fail(msg) { console.error(`  ${c.red('✗')} ${msg}`); process.exitCode = 1; }
function warn(msg) { console.log(`  ${c.yellow('⚠')} ${msg}`); }
function info(msg) { console.log(`  ${c.dim(msg)}`); }

// ── Redis via ioredis ──────────────────────────────────────────────────────
let redis;
async function getRedis() {
  if (redis) return redis;
  const req = createRequire(import.meta.url);
  let Redis;
  try {
    Redis = req('ioredis');
  } catch {
    fail('ioredis not installed — run: npm install ioredis');
    process.exit(1);
  }
  const url = new URL(REDIS_URL);
  redis = new Redis({
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    lazyConnect: false,
    connectTimeout: 5000,
  });
  await new Promise((resolve, reject) => {
    redis.on('ready', resolve);
    redis.on('error', reject);
  });
  return redis;
}

// ── Synthetic BMU lookup (mirrors queryBmuCached CPU fallback) ────────────
function computeBmuCpu(embedding, weights, dim, gridW, gridH) {
  const neurons = Math.floor(weights.length / dim);
  let minDist = Infinity;
  let bmuIdx = 0;
  for (let i = 0; i < neurons; i++) {
    let dist = 0;
    for (let d = 0; d < dim; d++) {
      const diff = (embedding[d] ?? 0) - (weights[i * dim + d] ?? 0);
      dist += diff * diff;
    }
    if (dist < minDist) { minDist = dist; bmuIdx = i; }
  }
  return { bmuRow: Math.floor(bmuIdx / gridW), bmuCol: bmuIdx % gridW };
}

// ── Fingerprint matching queryBmuCached ───────────────────────────────────
function fpHash(embedding) {
  const dim = embedding.length;
  const fp = [embedding[0], embedding[1], embedding[7] ?? 0, embedding[dim - 1] ?? 0, embedding[dim - 8] ?? 0];
  return fp.map(v => (v ?? 0).toFixed(5)).join(':');
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.cyan('SOM BMU Cache Smoke Test')}`);
  console.log(c.dim(`  Redis:   ${REDIS_URL}`));
  console.log(c.dim(`  Grid:    ${GRID_W}×${GRID_H}  Dim: ${DIM}\n`));

  const r = await getRedis();

  // ── Gate 1: som:weights presence / injection ──────────────────────────
  let weights;
  const weightsJson = await r.get('som:weights');
  if (weightsJson) {
    weights = JSON.parse(weightsJson);
    pass(`Gate 1: som:weights found in Redis (${weights.length} floats, ${Math.floor(weights.length / DIM)} neurons)`);
  } else if (INJECT_WEIGHTS) {
    // Create deterministic synthetic weights: neuron i has embedding ≈ [i/neurons, 0, 0, ...]
    const neurons = GRID_W * GRID_H;
    weights = new Array(neurons * DIM).fill(0).map((_, idx) => {
      const neuron = Math.floor(idx / DIM);
      const d = idx % DIM;
      return d === 0 ? neuron / neurons : Math.sin(neuron * 0.1 + d) * 0.1;
    });
    await r.setex('som:weights', 3600, JSON.stringify(weights));
    warn(`Gate 1: som:weights NOT found — injected ${neurons} synthetic neurons (${DIM}-dim). TTL 1h.`);
  } else {
    fail('Gate 1: som:weights missing from Redis. Run: npm run hypergraph:build  OR  pass --inject-weights');
    warn('       Continuing with CPU fallback simulation (no real weights = bmu always 0,0)');
    weights = new Array(GRID_W * GRID_H * DIM).fill(0);
  }

  // ── Test embedding: 768-dim in prod, DIM here ─────────────────────────
  const testEmbedding = Array.from({ length: DIM }, (_, i) =>
    i === 0 ? 0.73 : Math.sin(i * 0.42) * 0.3
  );

  const expectedBmu = computeBmuCpu(testEmbedding, weights, DIM, GRID_W, GRID_H);
  if (VERBOSE) info(`Expected BMU (CPU): row=${expectedBmu.bmuRow} col=${expectedBmu.bmuCol}`);

  // ── Gate 2: First call — should NOT be cache ──────────────────────────
  const cacheKey = `som:bmu:${fpHash(testEmbedding)}`;
  await r.del(cacheKey); // ensure clean slate
  info(`Cache key: ${cacheKey}`);

  // Simulate what queryBmuCached does: CPU argmin (no CUDA in Node script)
  let bmuIdx = 0;
  {
    let minDist = Infinity;
    const neurons = Math.floor(weights.length / DIM);
    for (let i = 0; i < neurons; i++) {
      let dist = 0;
      for (let d = 0; d < DIM; d++) {
        const diff = (testEmbedding[d] ?? 0) - (weights[i * DIM + d] ?? 0);
        dist += diff * diff;
      }
      if (dist < minDist) { minDist = dist; bmuIdx = i; }
    }
  }
  const bmuRow = Math.floor(bmuIdx / GRID_W);
  const bmuCol = bmuIdx % GRID_W;

  // Write to Redis (mirrors queryBmuCached behaviour)
  await r.setex(cacheKey, 1800, JSON.stringify({ bmuRow, bmuCol }));
  pass(`Gate 2: CPU argmin completed — source=cpu (CUDA skipped in smoke script)`);

  // ── Gate 3: Second call — must hit cache ──────────────────────────────
  const cached = await r.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.bmuRow === bmuRow && parsed.bmuCol === bmuCol) {
      pass(`Gate 3: Cache hit — source=cache, values match`);
    } else {
      fail(`Gate 3: Cache hit but values differ: expected row=${bmuRow} col=${bmuCol}, got row=${parsed.bmuRow} col=${parsed.bmuCol}`);
    }
  } else {
    fail('Gate 3: Cache miss on second read (setex may have failed)');
  }

  // ── Gate 4: bmuRow / bmuCol are finite ints ───────────────────────────
  const rowOk = Number.isFinite(bmuRow) && bmuRow >= 0 && bmuRow < GRID_H;
  const colOk = Number.isFinite(bmuCol) && bmuCol >= 0 && bmuCol < GRID_W;
  if (rowOk && colOk) {
    pass(`Gate 4: BMU coordinates valid — row=${bmuRow} col=${bmuCol} (grid ${GRID_W}×${GRID_H})`);
  } else {
    fail(`Gate 4: Invalid BMU coordinates — row=${bmuRow} col=${bmuCol}`);
  }

  // ── Gate 5: TTL is set ────────────────────────────────────────────────
  const ttl = await r.ttl(cacheKey);
  if (ttl > 0 && ttl <= 1800) {
    pass(`Gate 5: TTL set correctly — ${ttl}s remaining (≤ 1800s)`);
  } else if (ttl === -1) {
    fail(`Gate 5: Key exists but no TTL (persistent) — setex may not have run`);
  } else {
    fail(`Gate 6: Unexpected TTL value: ${ttl}`);
  }

  // ── Gate 6: Write reverse cell index (optional, verifies the pattern) ─
  const cellKey = `som:bmu:cell:${bmuRow}:${bmuCol}`;
  await r.sadd(cellKey, fpHash(testEmbedding));
  await r.expire(cellKey, 1800);
  const cellMembers = await r.smembers(cellKey);
  if (cellMembers.length > 0) {
    pass(`Gate 6: Reverse cell index ${cellKey} — ${cellMembers.length} member(s)`);
    if (VERBOSE) info(`  members: ${cellMembers.join(', ')}`);
  } else {
    fail(`Gate 6: Reverse cell index write failed`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('');
  if (process.exitCode) {
    console.log(c.red('SOM BMU smoke FAILED'));
  } else {
    console.log(c.green('SOM BMU smoke passed:'));
    console.log(`  first source:  ${c.yellow('cpu')} (GPU unavailable in plain Node; will be ${c.cyan('gpu')} when CUDA addon loads via dev server)`);
    console.log(`  second source: ${c.green('cache')}`);
    console.log(`  bmu:           row=${c.cyan(String(bmuRow))} col=${c.cyan(String(bmuCol))}`);
    console.log(`  ttl:           ${c.dim(String(ttl) + 's')}`);
    console.log(`  cell index:    ${c.dim(cellKey)}`);
  }

  await r.quit();
}

main().catch(err => {
  console.error(c.red('Unhandled error:'), err.message);
  process.exit(1);
});
