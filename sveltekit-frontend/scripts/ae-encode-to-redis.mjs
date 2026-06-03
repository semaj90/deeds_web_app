#!/usr/bin/env node
/**
 * ae-encode-to-redis.mjs
 *
 * Reads trained autoencoder weights from Redis (ace:autoencoder:weights),
 * scrolls all points in codebase_chunks_768, runs the encoder half
 * (768d → ReLU(256d) → linear(64d) → L2-norm), and writes:
 *
 *   gpu:karpathy:encoded   HASH  file_path → "d0,d1,...,d63" (64-dim CSV)
 *
 * This populates the key that rg-cluster-pivot.ts uses for centroid comparison.
 * Run AFTER ae:train (weights must be in Redis) and ae:backfill (optional).
 *
 * Usage:
 *   node scripts/ae-encode-to-redis.mjs
 *   node scripts/ae-encode-to-redis.mjs --dry-run
 *   node scripts/ae-encode-to-redis.mjs --force       (overwrite existing keys)
 *   node scripts/ae-encode-to-redis.mjs --limit 5000  (cap points processed)
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://localhost:6379';
const REDIS_PASS  = process.env.REDIS_PASSWORD ?? 'redis';
const COLLECTION  = 'codebase_chunks_768';
const CONTENT_DIM = 768;
const HIDDEN_DIM  = 256;
const ENCODED_DIM = 64;
const REDIS_KEY    = 'gpu:karpathy:encoded';
const WEIGHTS_KEY  = 'ace:autoencoder:weights';
const META_KEY     = 'ace:autoencoder:meta';
const BATCH_SIZE   = 500;
const TTL_SECS     = 86400; // 24h, matches karpathy:gpu convention

const FLAGS = {
  dryRun: process.argv.includes('--dry-run'),
  force:  process.argv.includes('--force'),
  limit:  Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 100_000),
};

function log(...a) { console.log('[ae:redis]', ...a); }

// ── Weight loading ────────────────────────────────────────────────────────────

function parseWeightCSV(csv) {
  return new Float32Array(csv.split(',').map(Number));
}

async function loadMeta(redis) {
  const metaType = await redis.type(META_KEY);
  if (metaType === 'hash')   return redis.hgetall(META_KEY);
  if (metaType === 'string') { const s = await redis.get(META_KEY); return s ? JSON.parse(s) : {}; }
  return {};
}

async function loadWeights(redis) {
  const [rawW, metaObj] = await Promise.all([
    redis.hgetall(WEIGHTS_KEY),
    loadMeta(redis),
  ]);

  if (!rawW?.W1) throw new Error('ace:autoencoder:weights not found — run ae:train first');

  const W1 = parseWeightCSV(rawW.W1);
  const b1 = parseWeightCSV(rawW.b1);
  const W2 = parseWeightCSV(rawW.W2);
  const b2 = parseWeightCSV(rawW.b2);

  // PyTorch (out × in): W1 is (DIM_HIDDEN × DIM_IN) = (256 × 768), W2 is (DIM_LATENT × DIM_HIDDEN) = (64 × 256)
  const expectedW1 = HIDDEN_DIM * CONTENT_DIM;   // 256 * 768 = 196608
  const expectedW2 = ENCODED_DIM * HIDDEN_DIM;   // 64  * 256 = 16384
  if (W1.length !== expectedW1) throw new Error(`W1 shape mismatch: got ${W1.length}, expected ${expectedW1} (${HIDDEN_DIM}×${CONTENT_DIM})`);
  if (W2.length !== expectedW2) throw new Error(`W2 shape mismatch: got ${W2.length}, expected ${expectedW2} (${ENCODED_DIM}×${HIDDEN_DIM})`);

  const bestLoss = metaObj.bestLoss ?? rawW.bestLoss ?? 0;
  if (Number(bestLoss) === 0) {
    log('WARNING: bestLoss=0 — weights may be untrained. Run ae:train first.');
  }

  return { W1, b1, W2, b2, trainedAt: metaObj.trainedAt ?? 'unknown', bestLoss };
}

// ── CPU encode: matches PyTorch train-autoencoder.py architecture ─────────────
// Layer 1: Linear(768→256) + ReLU
// Layer 2: Linear(256→64) + no activation (linear)
// Output:  L2-normalize per row → cosine distance works in 64-dim

// W is stored as (outputDim × inputDim) row-major — PyTorch nn.Linear convention.
// Python train-autoencoder.py saves param.data.flatten() which is (out × in) order.
// Access: W[h * inputDim + d] where h=output neuron, d=input neuron.
function linearLayer(data, n, inputDim, W, b, outputDim, relu) {
  const out = new Float32Array(n * outputDim);
  for (let i = 0; i < n; i++) {
    const xOff = i * inputDim;
    const yOff = i * outputDim;
    for (let h = 0; h < outputDim; h++) {
      let act = b[h];
      const wOff = h * inputDim;
      for (let d = 0; d < inputDim; d++) act += data[xOff + d] * W[wOff + d];
      out[yOff + h] = relu ? Math.max(0, act) : act;
    }
  }
  return out;
}

function l2NormalizeRows(data, n, dim) {
  for (let i = 0; i < n; i++) {
    const off = i * dim;
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += data[off + d] * data[off + d];
    norm = Math.sqrt(norm) || 1e-12;
    for (let d = 0; d < dim; d++) data[off + d] /= norm;
  }
  return data;
}

function encode768to64(matrix, n, weights) {
  const h = linearLayer(matrix, n, CONTENT_DIM, weights.W1, weights.b1, HIDDEN_DIM, /* relu */ true);
  const z = linearLayer(h, n, HIDDEN_DIM, weights.W2, weights.b2, ENCODED_DIM, /* relu */ false);
  return l2NormalizeRows(z, n, ENCODED_DIM);
}

// ── Qdrant scroll ─────────────────────────────────────────────────────────────

async function* scrollQdrant() {
  let offset = null;
  while (true) {
    const body = {
      limit: BATCH_SIZE,
      with_payload: ['file_path'],
      with_vector: ['content'],
    };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant scroll ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (points.length === 0) break;
    yield points;
    offset = data.result?.next_page_offset ?? null;
    if (!offset) break;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== ae-encode-to-redis (768→64 → ${REDIS_KEY}) ===`);
  log(`dryRun=${FLAGS.dryRun} force=${FLAGS.force} limit=${FLAGS.limit}`);

  const redis = new Redis(REDIS_URL, {
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  await redis.connect();
  await redis.ping();

  // Load weights
  const weights = await loadWeights(redis);
  log(`weights: trainedAt=${weights.trainedAt} bestLoss=${weights.bestLoss}`);

  // Check existing entries
  const existingCount = await redis.hlen(REDIS_KEY);
  log(`existing ${REDIS_KEY} entries: ${existingCount}`);
  if (existingCount > 0 && !FLAGS.force) {
    log(`${existingCount} entries already exist — use --force to re-encode all`);
  }

  let scanned = 0;
  let encoded = 0;
  let skipped = 0;
  let missing = 0;
  const t0 = Date.now();

  for await (const points of scrollQdrant()) {
    if (scanned >= FLAGS.limit) break;

    const toEncode = [];
    for (const pt of points) {
      if (scanned >= FLAGS.limit) break;
      scanned++;

      const fp = pt.payload?.file_path;
      if (!fp) { missing++; continue; }

      // Skip already-encoded unless --force
      if (!FLAGS.force && existingCount > 0) {
        // Batch check handled below — just optimistically encode all
      }

      const vec = pt.vector?.content ?? (Array.isArray(pt.vector) ? pt.vector : null);
      if (!vec || vec.length !== CONTENT_DIM) { missing++; continue; }

      toEncode.push({ id: String(pt.id), vec });
    }

    if (toEncode.length === 0) continue;

    // Pack flat matrix
    const matrix = new Float32Array(toEncode.length * CONTENT_DIM);
    toEncode.forEach(({ vec }, i) => matrix.set(vec, i * CONTENT_DIM));

    // Encode
    const latent = encode768to64(matrix, toEncode.length, weights);

    // Write to Redis
    if (!FLAGS.dryRun) {
      const pipeline = redis.pipeline();
      for (let i = 0; i < toEncode.length; i++) {
        const csv = Array.from(latent.subarray(i * ENCODED_DIM, (i + 1) * ENCODED_DIM))
          .map(v => v.toFixed(4))
          .join(',');
        pipeline.hset(REDIS_KEY, toEncode[i].id, csv);
      }
      await pipeline.exec();
    }

    encoded += toEncode.length;

    if (encoded % 5000 === 0 || encoded === toEncode.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      log(`  encoded ${encoded} / scanned ${scanned} (${elapsed}s)`);
    }
  }

  // Set TTL on the hash
  if (!FLAGS.dryRun && encoded > 0) {
    await redis.expire(REDIS_KEY, TTL_SECS);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`Done. encoded=${encoded} skipped=${skipped} missing=${missing} elapsed=${elapsed}s`);
  log(`${REDIS_KEY} now has ${await redis.hlen(REDIS_KEY)} entries`);

  await redis.quit();
}

main().catch(e => { console.error(e); process.exit(1); });