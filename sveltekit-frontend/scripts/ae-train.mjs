#!/usr/bin/env node
/**
 * scripts/ae-train.mjs
 *
 * Trains a 768→256→64 encoder on embeddings from Qdrant codebase_chunks_768
 * and saves the encoder weights to Redis (ace:autoencoder:weights + ace:autoencoder:meta).
 *
 * Architecture (encoder-only with tied-weight reconstruction for training):
 *   Encoder:     Linear(768→256, ReLU) → Linear(256→64)        [W1/b1, W2/b2]
 *   Reconstruction: Linear(64→256, ReLU) → Linear(256→768)     [W2^T, W1^T — tied, no extra params]
 *   Loss: MSE(x, reconstruct(encode(x))) + L2 on W1/W2
 *   Optimizer: SGD with momentum + cosine LR decay
 *
 * Saves only W1,b1,W2,b2 to Redis — matches autoencoder-backfill-qdrant.mjs expectations.
 *
 * Usage:
 *   npm run ae:train:js                        (30 epochs, batch 64, lr 0.01)
 *   npm run ae:train:js -- --epochs 60 --lr 0.005 --batch 128
 *   npm run ae:train:js -- --dry-run           (validate data load, no training/save)
 *   npm run ae:train:js -- --force             (overwrite existing weights)
 *
 * Weight format (Redis hash ace:autoencoder:weights):
 *   W1: comma-separated Float32 (256×768 = 196608 values, row-major)
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
const QDRANT_URL  = process.env.QDRANT_URL ?? 'http://localhost:6333';
const REDIS_URL   = process.env.REDIS_URL  ?? 'redis://localhost:6379';
const COLLECTION  = 'codebase_chunks_768';
const CONTENT_DIM = 768;
const HIDDEN_DIM  = 256;
const ENCODED_DIM = 64;

const args = process.argv.slice(2);
function parseArg(flag, fallback) {
  const eq  = args.find(a => a.startsWith(`${flag}=`));
  if (eq) return Number(eq.slice(flag.length + 1));
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return Number(args[idx + 1]);
  return fallback;
}

const FLAGS = {
  epochs: parseArg('--epochs',   30),
  batch:  parseArg('--batch',    64),
  lr:     parseArg('--lr',     0.01),
  l2:     parseArg('--l2',    1e-5),
  limit:  parseArg('--limit', Infinity),
  dryRun: args.includes('--dry-run'),
  force:  args.includes('--force'),
  quiet:  args.includes('--quiet'),
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

// ── Linear layer: y = ReLU?(x @ W^T + b) ─────────────────────────────────────
// W shape: (outDim × inDim) row-major — PyTorch convention
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

// Transposed multiply: y = ReLU?(x @ W + c)  [W is (inDim × outDim), applied as W^T]
// Used for tied-weight decoder: W2^T: (ENCODED→HIDDEN), W1^T: (HIDDEN→CONTENT)
function matMulAddTranspose(x, W, c, n, wRows, wCols, relu) {
  // W shape: (wRows × wCols); transpose multiply treats it as (wCols × wRows)
  // inDim = wRows, outDim = wCols
  const out = new Float32Array(n * wCols);
  for (let i = 0; i < n; i++) {
    const xOff = i * wRows;
    const yOff = i * wCols;
    for (let h = 0; h < wCols; h++) {
      let act = c ? c[h] : 0;
      for (let d = 0; d < wRows; d++) act += x[xOff + d] * W[d * wCols + h];
      out[yOff + h] = relu ? Math.max(0, act) : act;
    }
  }
  return out;
}

// ── Forward pass: encode → tied-weight decode → return all intermediates ──────
function forward(x, n, W) {
  // Encoder
  const h1 = matMulAdd(x,  W.W1, W.b1, n, CONTENT_DIM, HIDDEN_DIM,  true);  // n×256, ReLU
  const z  = matMulAdd(h1, W.W2, W.b2, n, HIDDEN_DIM,  ENCODED_DIM, false); // n×64

  // Tied-weight decoder: W2^T then W1^T (no new parameters)
  const dh = matMulAddTranspose(z,  W.W2, null, n, ENCODED_DIM, HIDDEN_DIM,  true);  // n×256, ReLU
  const xr = matMulAddTranspose(dh, W.W1, null, n, HIDDEN_DIM,  CONTENT_DIM, false); // n×768

  return { h1, z, dh, xr };
}

// MSE loss
function mseLoss(xr, x, n) {
  let loss = 0;
  for (let i = 0; i < n * CONTENT_DIM; i++) {
    const d = xr[i] - x[i];
    loss += d * d;
  }
  return loss / (n * CONTENT_DIM);
}

// ── Backward pass ─────────────────────────────────────────────────────────────
// Gradients flow back through tied decoder (W2^T, W1^T) into W1 and W2.
// Both the forward path AND the transposed path contribute grads to the same W1/W2.
function backward(x, n, W, cache) {
  const { h1, z, dh, xr } = cache;
  const scale = 2 / (n * CONTENT_DIM);

  // dL/dxr
  const dxr = new Float32Array(n * CONTENT_DIM);
  for (let i = 0; i < dxr.length; i++) dxr[i] = (xr[i] - x[i]) * scale;

  // ── Backward through W1^T (decoder second layer: dh → xr) ────────────────
  // xr[i,j] = sum_k dh[i,k] * W1[k,j]  (transpose product, W1 is outDim×inDim = 256×768)
  // dL/dW1[k,j] += dxr[i,j] * dh[i,k]  (same as forward path but transposed role)
  // dL/ddh[i,k]  = sum_j dxr[i,j] * W1[k,j]
  const dW1_dec = new Float32Array(HIDDEN_DIM * CONTENT_DIM);
  const ddh     = new Float32Array(n * HIDDEN_DIM);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < CONTENT_DIM; j++) {
      const gj = dxr[i * CONTENT_DIM + j];
      for (let k = 0; k < HIDDEN_DIM; k++) {
        dW1_dec[k * CONTENT_DIM + j] += gj * dh[i * HIDDEN_DIM + k];
        ddh[i * HIDDEN_DIM + k]      += gj * W.W1[k * CONTENT_DIM + j];
      }
    }
  }

  // ReLU gate on dh
  for (let i = 0; i < ddh.length; i++) if (dh[i] <= 0) ddh[i] = 0;

  // ── Backward through W2^T (decoder first layer: z → dh) ──────────────────
  // dh[i,k] = sum_m z[i,m] * W2[m,k]  (W2 is 64×256, transpose gives 256×64)
  // dL/dW2[m,k] += ddh[i,k] * z[i,m]
  // dL/dz[i,m]   = sum_k ddh[i,k] * W2[m,k]
  const dW2_dec = new Float32Array(ENCODED_DIM * HIDDEN_DIM);
  const dz      = new Float32Array(n * ENCODED_DIM);

  for (let i = 0; i < n; i++) {
    for (let k = 0; k < HIDDEN_DIM; k++) {
      const gk = ddh[i * HIDDEN_DIM + k];
      for (let m = 0; m < ENCODED_DIM; m++) {
        dW2_dec[m * HIDDEN_DIM + k] += gk * z[i * ENCODED_DIM + m];
        dz[i * ENCODED_DIM + m]     += gk * W.W2[m * HIDDEN_DIM + k];
      }
    }
  }

  // ── Backward through encoder W2 (h1 → z) ─────────────────────────────────
  const dW2_enc = new Float32Array(ENCODED_DIM * HIDDEN_DIM);
  const db2     = new Float32Array(ENCODED_DIM);
  const dh1     = new Float32Array(n * HIDDEN_DIM);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < ENCODED_DIM; j++) {
      const gj = dz[i * ENCODED_DIM + j];
      db2[j] += gj;
      const wOff  = j * HIDDEN_DIM;
      const h1Off = i * HIDDEN_DIM;
      for (let k = 0; k < HIDDEN_DIM; k++) {
        dW2_enc[wOff + k]    += gj * h1[h1Off + k];
        dh1[h1Off + k]       += gj * W.W2[wOff + k];
      }
    }
  }

  // ReLU gate on h1
  for (let i = 0; i < h1.length; i++) if (h1[i] <= 0) dh1[i] = 0;

  // ── Backward through encoder W1 (x → h1) ─────────────────────────────────
  const dW1_enc = new Float32Array(HIDDEN_DIM * CONTENT_DIM);
  const db1     = new Float32Array(HIDDEN_DIM);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < HIDDEN_DIM; j++) {
      const gj = dh1[i * HIDDEN_DIM + j];
      db1[j] += gj;
      const wOff = j * CONTENT_DIM;
      const xOff = i * CONTENT_DIM;
      for (let k = 0; k < CONTENT_DIM; k++) {
        dW1_enc[wOff + k] += gj * x[xOff + k];
      }
    }
  }

  // Accumulate tied grads: W1 and W2 each get grad from both encoder and decoder paths
  const dW1 = new Float32Array(HIDDEN_DIM * CONTENT_DIM);
  const dW2 = new Float32Array(ENCODED_DIM * HIDDEN_DIM);
  for (let i = 0; i < dW1.length; i++) dW1[i] = dW1_enc[i] + dW1_dec[i];
  for (let i = 0; i < dW2.length; i++) dW2[i] = dW2_enc[i] + dW2_dec[i];

  return { dW1, db1, dW2, db2 };
}

// ── SGD update with momentum + L2 ─────────────────────────────────────────────
function updateParams(W, grads, velocity, lr, l2) {
  const momentum = 0.9;
  for (const name of ['W1', 'b1', 'W2', 'b2']) {
    const p = W[name];
    const g = grads[`d${name}`];
    const v = velocity[name];
    for (let i = 0; i < p.length; i++) {
      const grad = g[i] + l2 * p[i];
      v[i] = momentum * v[i] - lr * grad;
      p[i] += v[i];
    }
  }
}

// ── Qdrant scroll ─────────────────────────────────────────────────────────────
async function fetchVectors(limit) {
  const vectors = [];
  let offset = null;

  log(`[qdrant] Fetching content vectors from ${COLLECTION}...`);
  while (vectors.length < limit) {
    const batchSize = Math.min(200, limit - vectors.length);
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: batchSize, offset, with_payload: false, with_vector: ['content'] }),
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
  log(`[qdrant] Total vectors: ${vectors.length}`);
  return vectors;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function cosineLr(baseLr, epoch, total) {
  return baseLr * 0.5 * (1 + Math.cos(Math.PI * epoch / total));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('=== ae:train:js — 768→256→64 encoder (tied-weight reconstruction) ===');
  log(`[cfg] epochs=${FLAGS.epochs} batch=${FLAGS.batch} lr=${FLAGS.lr} l2=${FLAGS.l2} dryRun=${FLAGS.dryRun}`);

  const redis = makeRedis();
  try {
    await redis.connect();
    await redis.ping();
    const meta = await redis.hgetall('ace:autoencoder:meta');
    if (meta?.trainedAt && !FLAGS.force) {
      log(`[redis] Existing weights found — trainedAt=${meta.trainedAt} bestLoss=${meta.bestLoss}`);
      log('  Use --force to overwrite.');
      await redis.disconnect().catch(() => {});
      process.exit(0);
    }
  } catch (err) {
    console.warn(`[redis] Connect failed: ${err.message}`);
  }

  const vectors = await fetchVectors(FLAGS.limit);
  if (vectors.length < 10) {
    console.error(`Not enough vectors (got ${vectors.length}, need ≥10)`);
    process.exit(1);
  }

  if (FLAGS.dryRun) {
    log(`[dry-run] ${vectors.length} vectors ready — skipping training.`);
    await redis.disconnect().catch(() => {});
    process.exit(0);
  }

  // Encoder weights only — W3/W4 do NOT exist; decoder uses W2^T and W1^T
  const W = {
    W1: xavierUniform(HIDDEN_DIM, CONTENT_DIM),
    b1: zeros(HIDDEN_DIM),
    W2: xavierUniform(ENCODED_DIM, HIDDEN_DIM),
    b2: zeros(ENCODED_DIM),
  };

  const velocity = {
    W1: zeros(W.W1.length), b1: zeros(W.b1.length),
    W2: zeros(W.W2.length), b2: zeros(W.b2.length),
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

      const x = new Float32Array(n * CONTENT_DIM);
      for (let i = 0; i < n; i++) x.set(vectors[batchIdx[i]], i * CONTENT_DIM);

      const cache = forward(x, n, W);
      const loss  = mseLoss(cache.xr, x, n);
      epochLoss += loss;
      batches++;

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

  // Save encoder weights (W1/b1/W2/b2) to Redis
  try {
    await redis.connect().catch(() => {});
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
    log('[redis] Weights saved — ace:autoencoder:weights (W1/b1/W2/b2) + ace:autoencoder:meta');
  } catch (err) {
    console.error(`[redis] Failed to save weights: ${err.message}`);
    process.exit(1);
  } finally {
    try {
      redis.disconnect();
    } catch (e) {}
  }

  console.log(JSON.stringify({ status: 'ok', bestLoss, vectorCount: vectors.length, durationMs }));
}

main().catch(err => {
  console.error('[ae:train:js] Fatal:', err);
  process.exit(1);
});
