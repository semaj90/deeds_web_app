#!/usr/bin/env node
/**
 * scripts/ae-train.mjs
 *
 * Trains a 768→256→64 autoencoder on embeddings from Qdrant codebase_chunks_768
 * and saves the resulting weights to Redis (ace:autoencoder:weights + ace:autoencoder:meta).
 *
 * Architecture:
 *   Encoder: Linear(768→256, ReLU) → Linear(256→64)
 *   Decoder: Linear(64→256, ReLU) → Linear(256→768)
 *   Loss: MSE reconstruction + L2 weight regularization
 *   Optimizer: SGD with momentum + cosine LR decay
 *
 * Usage:
 *   npm run ae:train                        (30 epochs, batch 64, lr 0.01)
 *   npm run ae:train -- --epochs 60 --lr 0.005 --batch 128
 *   npm run ae:train -- --dry-run           (validate data load, no training/save)
 *   npm run ae:train -- --force             (overwrite existing weights)
 *
 * Weight format (Redis hash ace:autoencoder:weights):
 *   W1: comma-separated Float32 (256×768 = 196608 values, PyTorch row-major)
 *   b1: comma-separated Float32 (256)
 *   W2: comma-separated Float32 (64×256 = 16384 values)
 *   b2: comma-separated Float32 (64)
 * Metadata (Redis hash ace:autoencoder:meta):
 *   trainedAt, epochs, batchSize, lr, bestLoss, vectorCount, durationMs
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────
const QDRANT_URL   = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const REDIS_URL    = process.env.REDIS_URL   ?? 'redis://localhost:6379';
const COLLECTION   = 'codebase_chunks_768';
const CONTENT_DIM  = 768;
const HIDDEN_DIM   = 256;
const ENCODED_DIM  = 64;

const args = process.argv.slice(2);
function parseArg(flag, fallback) {
  const eq  = args.find(a => a.startsWith(`${flag}=`));
  if (eq) return Number(eq.slice(flag.length + 1));
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return Number(args[idx + 1]);
  return fallback;
}

const FLAGS = {
  epochs:  parseArg('--epochs',    30),
  batch:   parseArg('--batch',     64),
  lr:      parseArg('--lr',      0.01),
  l2:      parseArg('--l2',     1e-5),
  limit:   parseArg('--limit',  Infinity),
  dryRun:  args.includes('--dry-run'),
  force:   args.includes('--force'),
  quiet:   args.includes('--quiet'),
};

const log = (...a) => { if (!FLAGS.quiet) console.log(...a); };

// ── Redis ─────────────────────────────────────────────────────────────────────
function makeRedis() {
  const r = new Redis(REDIS_URL, {
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    retryStrategy:        () => null,
  });
  r.on('error', () => {});
  return r;
}

// ── Xavier init (Glorot uniform) ──────────────────────────────────────────────
function xavierUniform(rows, cols) {
  const limit = Math.sqrt(6 / (rows + cols));
  const w = new Float32Array(rows * cols);
  for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * limit;
  return w;
}

function zeros(n) { return new Float32Array(n); }

// ── Forward pass ──────────────────────────────────────────────────────────────
function matMulAdd(x, W, b, n, inDim, outDim, relu) {
  const out = new Float32Array(n * outDim);
  for (let i = 0; i < n; i++) {
    const xOff = i * inDim;
    const yOff = i * outDim;
    for (let h = 0; h < outDim; h++) {
      let act = b[h];
      const wOff = h * inDim;
      for (let d = 0; d < inDim; d++) act += x[xOff + d] * W[wOff + d];
      out[yOff + h] = relu ? Math.max(0, act) : act;
    }
  }
  return out;
}

function reluMask(x) {
  const m = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) m[i] = x[i] > 0 ? 1 : 0;
  return m;
}

// Forward: input batch n×768 → encoded n×64 + intermediates for backprop
function forward(x, n, W) {
  const h1 = matMulAdd(x,  W.W1, W.b1, n, CONTENT_DIM, HIDDEN_DIM, true);  // n×256, ReLU
  const z  = matMulAdd(h1, W.W2, W.b2, n, HIDDEN_DIM,  ENCODED_DIM, false); // n×64
  const h2 = matMulAdd(z,  W.W3, W.b3, n, ENCODED_DIM, HIDDEN_DIM, true);   // n×256, ReLU
  const xr = matMulAdd(h2, W.W4, W.b4, n, HIDDEN_DIM,  CONTENT_DIM, false); // n×768
  return { h1, z, h2, xr };
}

// MSE loss over batch
function mseLoss(xr, x, n) {
  let loss = 0;
  for (let i = 0; i < n * CONTENT_DIM; i++) {
    const d = xr[i] - x[i];
    loss += d * d;
  }
  return loss / (n * CONTENT_DIM);
}

// ── Backward pass (manual backprop) ──────────────────────────────────────────
function backward(x, n, W, cache) {
  const { h1, z, h2, xr } = cache;

  // dL/dxr = 2*(xr - x) / (n*CONTENT_DIM)
  const scale = 2 / (n * CONTENT_DIM);

  // --- Decoder (W4, b4) ---
  const dxr = new Float32Array(n * CONTENT_DIM);
  for (let i = 0; i < dxr.length; i++) dxr[i] = (xr[i] - x[i]) * scale;

  const dW4 = new Float32Array(CONTENT_DIM * HIDDEN_DIM);
  const db4 = new Float32Array(CONTENT_DIM);
  const dh2 = new Float32Array(n * HIDDEN_DIM);

  // dL/dW4[j,k] = Σ_i dxr[i,j] * h2[i,k]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < CONTENT_DIM; j++) {
      const gj = dxr[i * CONTENT_DIM + j];
      db4[j] += gj;
      const wOff = j * HIDDEN_DIM;
      const h2Off = i * HIDDEN_DIM;
      for (let k = 0; k < HIDDEN_DIM; k++) {
        dW4[wOff + k] += gj * h2[h2Off + k];
        dh2[h2Off + k] += gj * W.W4[wOff + k];
      }
    }
  }

  // ReLU gate on h2
  const mask2 = reluMask(h2);
  for (let i = 0; i < dh2.length; i++) dh2[i] *= mask2[i];

  // --- Encoder W3, b3 ---
  const dW3 = new Float32Array(HIDDEN_DIM * ENCODED_DIM);
  const db3 = new Float32Array(HIDDEN_DIM);
  const dz  = new Float32Array(n * ENCODED_DIM);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < HIDDEN_DIM; j++) {
      const gj = dh2[i * HIDDEN_DIM + j];
      db3[j] += gj;
      const wOff = j * ENCODED_DIM;
      const zOff = i * ENCODED_DIM;
      for (let k = 0; k < ENCODED_DIM; k++) {
        dW3[wOff + k] += gj * z[zOff + k];
        dz[zOff + k]  += gj * W.W3[wOff + k];
      }
    }
  }

  // --- Encoder W2, b2 ---
  const dW2 = new Float32Array(ENCODED_DIM * HIDDEN_DIM);
  const db2 = new Float32Array(ENCODED_DIM);
  const dh1 = new Float32Array(n * HIDDEN_DIM);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < ENCODED_DIM; j++) {
      const gj = dz[i * ENCODED_DIM + j];
      db2[j] += gj;
      const wOff = j * HIDDEN_DIM;
      const h1Off = i * HIDDEN_DIM;
      for (let k = 0; k < HIDDEN_DIM; k++) {
        dW2[wOff + k] += gj * h1[h1Off + k];
        dh1[h1Off + k] += gj * W.W2[wOff + k];
      }
    }
  }

  // ReLU gate on h1
  const mask1 = reluMask(h1);
  for (let i = 0; i < dh1.length; i++) dh1[i] *= mask1[i];

  // --- Encoder W1, b1 ---
  const dW1 = new Float32Array(HIDDEN_DIM * CONTENT_DIM);
  const db1 = new Float32Array(HIDDEN_DIM);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < HIDDEN_DIM; j++) {
      const gj = dh1[i * HIDDEN_DIM + j];
      db1[j] += gj;
      const wOff = j * CONTENT_DIM;
      const xOff = i * CONTENT_DIM;
      for (let k = 0; k < CONTENT_DIM; k++) {
        dW1[wOff + k] += gj * x[xOff + k];
      }
    }
  }

  return { dW1, db1, dW2, db2, dW3, db3, dW4, db4 };
}

// ── SGD update with momentum + L2 ────────────────────────────────────────────
function updateParams(W, grads, velocity, lr, l2) {
  const momentum = 0.9;
  const paramNames = ['W1','b1','W2','b2','W3','b3','W4','b4'];
  for (const name of paramNames) {
    const p = W[name];
    const g = grads[`d${name}`];
    const v = velocity[name];
    for (let i = 0; i < p.length; i++) {
      const grad = g[i] + l2 * p[i];  // L2 regularisation
      v[i] = momentum * v[i] - lr * grad;
      p[i] += v[i];
    }
  }
}

// ── Qdrant scroll for embeddings ──────────────────────────────────────────────
async function fetchVectors(limit) {
  const vectors = [];
  let offset = null;

  log(`[qdrant] Fetching content vectors from ${COLLECTION}...`);
  while (vectors.length < limit) {
    const batchSize = Math.min(200, limit - vectors.length);
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: batchSize,
        offset,
        with_payload: false,
        with_vector: ['content'],
      }),
    });
    if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (points.length === 0) break;

    for (const pt of points) {
      const v = pt.vector?.content ?? pt.vector;
      if (Array.isArray(v) && v.length === CONTENT_DIM) {
        vectors.push(new Float32Array(v));
      }
    }

    offset = data.result?.next_page_offset ?? null;
    process.stdout.write(`\r  [qdrant] loaded ${vectors.length}  `);
    if (!offset) break;
  }

  console.log();
  log(`[qdrant] Total vectors loaded: ${vectors.length}`);
  return vectors;
}

// ── Shuffle in-place ──────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Cosine LR schedule ────────────────────────────────────────────────────────
function cosineLr(baseLr, epoch, totalEpochs) {
  return baseLr * 0.5 * (1 + Math.cos(Math.PI * epoch / totalEpochs));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('=== ae:train — 768→256→64 Autoencoder ===');
  log(`[cfg] epochs=${FLAGS.epochs} batch=${FLAGS.batch} lr=${FLAGS.lr} l2=${FLAGS.l2} dryRun=${FLAGS.dryRun}`);

  // Check Redis for existing weights
  const redis = makeRedis();
  try {
    await redis.connect();
    await redis.ping();
    const meta = await redis.hgetall('ace:autoencoder:meta');
    if (meta?.trainedAt && !FLAGS.force) {
      log(`[redis] Existing weights found — trainedAt=${meta.trainedAt} bestLoss=${meta.bestLoss}`);
      log(`  Use --force to overwrite.`);
      process.exit(0);
    }
  } catch (err) {
    console.warn(`[redis] Could not connect: ${err.message}. Will save locally if dry-run skipped.`);
    await redis.disconnect().catch(() => {});
  }

  // Load vectors
  const vectors = await fetchVectors(FLAGS.limit);
  if (vectors.length < 10) {
    console.error(`Not enough vectors to train (got ${vectors.length}, need ≥10)`);
    process.exit(1);
  }

  if (FLAGS.dryRun) {
    log(`[dry-run] ${vectors.length} vectors ready — skipping training.`);
    await redis.disconnect().catch(() => {});
    process.exit(0);
  }

  // Init weights
  const W = {
    W1: xavierUniform(HIDDEN_DIM, CONTENT_DIM),
    b1: zeros(HIDDEN_DIM),
    W2: xavierUniform(ENCODED_DIM, HIDDEN_DIM),
    b2: zeros(ENCODED_DIM),
    W3: xavierUniform(HIDDEN_DIM, ENCODED_DIM),
    b3: zeros(HIDDEN_DIM),
    W4: xavierUniform(CONTENT_DIM, HIDDEN_DIM),
    b4: zeros(CONTENT_DIM),
  };

  const velocity = {
    W1: zeros(W.W1.length), b1: zeros(W.b1.length),
    W2: zeros(W.W2.length), b2: zeros(W.b2.length),
    W3: zeros(W.W3.length), b3: zeros(W.b3.length),
    W4: zeros(W.W4.length), b4: zeros(W.b4.length),
  };

  const indices = Array.from({ length: vectors.length }, (_, i) => i);
  let bestLoss = Infinity;
  const t0 = Date.now();

  log(`[train] Starting — ${vectors.length} vectors, ${FLAGS.epochs} epochs, batch=${FLAGS.batch}`);

  for (let epoch = 0; epoch < FLAGS.epochs; epoch++) {
    shuffle(indices);
    const lr = cosineLr(FLAGS.lr, epoch, FLAGS.epochs);
    let epochLoss = 0;
    let batches = 0;

    for (let bi = 0; bi < indices.length; bi += FLAGS.batch) {
      const batchIdx = indices.slice(bi, bi + FLAGS.batch);
      const n = batchIdx.length;

      // Pack batch into flat Float32Array
      const x = new Float32Array(n * CONTENT_DIM);
      for (let i = 0; i < n; i++) x.set(vectors[batchIdx[i]], i * CONTENT_DIM);

      // Forward
      const cache = forward(x, n, W);
      const loss  = mseLoss(cache.xr, x, n);
      epochLoss += loss;
      batches++;

      // Backward
      const grads = backward(x, n, W, cache);
      updateParams(W, grads, velocity, lr, FLAGS.l2);
    }

    const avgLoss = epochLoss / batches;
    if (avgLoss < bestLoss) bestLoss = avgLoss;

    if (!FLAGS.quiet || (epoch + 1) % 5 === 0) {
      log(`  epoch ${epoch + 1}/${FLAGS.epochs}  loss=${avgLoss.toFixed(6)}  lr=${lr.toFixed(6)}`);
    }
  }

  const durationMs = Date.now() - t0;
  log(`\n[train] Complete — bestLoss=${bestLoss.toFixed(6)} in ${(durationMs / 1000).toFixed(1)}s`);

  // Save to Redis
  // Only save the encoder half (W1,b1,W2,b2) — the backfill script only uses encoder
  try {
    await redis.connect();
    await redis.ping();
    await redis.hset('ace:autoencoder:weights',
      'W1', Array.from(W.W1).join(','),
      'b1', Array.from(W.b1).join(','),
      'W2', Array.from(W.W2).join(','),
      'b2', Array.from(W.b2).join(','),
    );
    await redis.hset('ace:autoencoder:meta',
      'trainedAt',   new Date().toISOString(),
      'epochs',      String(FLAGS.epochs),
      'batchSize',   String(FLAGS.batch),
      'lr',          String(FLAGS.lr),
      'bestLoss',    String(bestLoss),
      'vectorCount', String(vectors.length),
      'durationMs',  String(durationMs),
    );
    log(`[redis] Weights saved — ace:autoencoder:weights + ace:autoencoder:meta`);
  } catch (err) {
    console.error(`[redis] Failed to save weights: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.disconnect().catch(() => {});
  }

  console.log(JSON.stringify({
    status: 'ok',
    bestLoss,
    vectorCount: vectors.length,
    durationMs,
  }));
}

main().catch(err => {
  console.error('[ae:train] Fatal:', err);
  process.exit(1);
});
