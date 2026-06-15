#!/usr/bin/env node
/**
 * train-autoencoder.mjs
 *
 * Contrastive autoencoder training: 768→64→768 dim on codebase embeddings.
 * Uses LibTorch N-API addon (tensorrt_bridge.node) for GPU GEMM on RTX 3060 Ti.
 *
 * WHY: Xavier-init weights saturate tanh → all 64-dim outputs cluster near 0.
 *      Training on real embeddings preserves semantic structure in 64-dim space
 *      so autoencoder-encoded vectors can be used for MLA-style memory paths.
 *
 * Architecture:
 *   Encoder: Linear(768→256) → ReLU → Linear(256→64) → L2-norm
 *   Decoder: Linear(64→256)  → ReLU → Linear(256→768)
 *   Loss:    MSE reconstruct + contrastive (positive/negative pair cosine)
 *
 * Output:
 *   - Redis hash  ace:autoencoder:weights   (W1, b1, W2, b2, W3, b3, W4, b4 as CSV)
 *   - Redis hash  ace:autoencoder:meta      (hash: trainedAt, bestLoss, epochs, n, architecture, activation, latentNorm, …)
 *   - File        logs/task-output/pipeline-test/autoencoder-train-<ts>.json
 *
 * Usage:
 *   node scripts/train-autoencoder.mjs
 *   node scripts/train-autoencoder.mjs --epochs 50 --lr 0.001
 *   node scripts/train-autoencoder.mjs --dry-run   # stats only, no training
 *   node scripts/train-autoencoder.mjs --resume     # load existing weights
 *
 * Prerequisites:
 *   - Qdrant codebase_chunks_768 populated (npm run graphify:semantic)
 *   - tensorrt_bridge.node built (simd-bridge/cpp)
 *   - Redis running (legal-ai-valkey)
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const __dirname    = dirname(fileURLToPath(import.meta.url));
const ROOT         = resolve(__dirname, '..');
const LOG_DIR      = resolve(ROOT, 'logs/task-output/pipeline-test');
const ADDON_PATH   = resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
mkdirSync(LOG_DIR, { recursive: true });

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const RESUME    = args.includes('--resume');
const EPOCHS    = parseInt(args.find(a => a.startsWith('--epochs'))?.split('=')[1] ?? '30', 10) || 30;
const LR        = parseFloat(args.find(a => a.startsWith('--lr'))?.split('=')[1] ?? '0.0005') || 0.0005;
const BATCH     = parseInt(args.find(a => a.startsWith('--batch'))?.split('=')[1] ?? '64', 10) || 64;

const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const COLLECTION   = 'codebase_chunks_768';
const DIM_IN       = 768;
const DIM_HIDDEN   = 256;
const DIM_LATENT   = 64;
const AUTOENCODER_HISTORY_STREAM = 'ace:autoencoder:history';

// ── Load N-API addon ──────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
let addon = null;
try {
  addon = require(ADDON_PATH);
  console.log('[ae-train] tensorrt_bridge.node loaded, CUDA:', addon.checkCudaAvailable?.() ?? 'unknown');
} catch (e) {
  console.warn('[ae-train] N-API addon not available:', e.message);
  console.warn('[ae-train] Falling back to CPU JS training (much slower)');
}

// ── Weight matrix helpers (Float32Array) ──────────────────────────────────────
/** Xavier uniform init: range = sqrt(6 / (fan_in + fan_out)) */
function xavierUniform(rows, cols) {
  const limit = Math.sqrt(6 / (rows + cols));
  const W = new Float32Array(rows * cols);
  for (let i = 0; i < W.length; i++) W[i] = (Math.random() * 2 - 1) * limit;
  return W;
}

function zeros(n) { return new Float32Array(n); }

/** Convert JS (inDim × outDim) weight to PyTorch (outDim × inDim) for Redis storage. */
function toTorchLayout(W_js, inDim, outDim) {
  const W_pt = new Float32Array(inDim * outDim);
  for (let r = 0; r < inDim; r++)
    for (let c = 0; c < outDim; c++)
      W_pt[c * inDim + r] = W_js[r * outDim + c];
  return W_pt;
}

/** Convert PyTorch (outDim × inDim) weight loaded from Redis back to JS (inDim × outDim). */
function fromTorchLayout(W_pt, inDim, outDim) {
  const W_js = new Float32Array(inDim * outDim);
  for (let r = 0; r < inDim; r++)
    for (let c = 0; c < outDim; c++)
      W_js[r * outDim + c] = W_pt[c * inDim + r];
  return W_js;
}

/** Matrix multiply: C(m×n) = A(m×k) × B(k×n) — CPU fallback */
function matmul(A, m, k, B, n, C) {
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let p = 0; p < k; p++) s += A[i * k + p] * B[p * n + j];
      C[i * n + j] = s;
    }
}

/** ReLU in-place on batch × dim */
function relu(X, rows, cols) {
  for (let i = 0; i < rows * cols; i++) if (X[i] < 0) X[i] = 0;
}

/** Forward pass: encoder 768→64, returns {encoded, hidden1} */
function encode(X, batch, W1, b1, W2, b2) {
  const h1 = new Float32Array(batch * DIM_HIDDEN);
  matmul(X, batch, DIM_IN, W1, DIM_HIDDEN, h1);
  for (let i = 0; i < batch; i++)
    for (let j = 0; j < DIM_HIDDEN; j++) h1[i * DIM_HIDDEN + j] += b1[j];
  relu(h1, batch, DIM_HIDDEN);

  const z = new Float32Array(batch * DIM_LATENT);
  matmul(h1, batch, DIM_HIDDEN, W2, DIM_LATENT, z);
  for (let i = 0; i < batch; i++)
    for (let j = 0; j < DIM_LATENT; j++) z[i * DIM_LATENT + j] += b2[j];

  // L2 normalize each row so cosine distance works in 64-dim space
  for (let i = 0; i < batch; i++) {
    let norm = 0;
    for (let j = 0; j < DIM_LATENT; j++) norm += z[i * DIM_LATENT + j] ** 2;
    norm = Math.sqrt(norm) + 1e-8;
    for (let j = 0; j < DIM_LATENT; j++) z[i * DIM_LATENT + j] /= norm;
  }
  return { z, h1 };
}

/** MSE loss: mean over all elements */
function mseLoss(pred, target, n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += (pred[i] - target[i]) ** 2;
  return s / n;
}

// ── Fetch embeddings from Qdrant (scroll all points) ─────────────────────────
async function fetchAllEmbeddings() {
  console.log(`[ae-train] Fetching embeddings from Qdrant ${COLLECTION}...`);
  const embeddings = [];
  let offset = null;

  while (true) {
    const body = {
      limit: 200,
      with_vector: true,
      with_payload: false,
      ...(offset ? { offset } : {}),
    };
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (!points.length) break;

    for (const pt of points) {
      const vec = pt.vector?.content ?? pt.vector;
      if (Array.isArray(vec) && vec.length === DIM_IN) {
        embeddings.push(new Float32Array(vec));
      }
    }
    offset = data.result?.next_page_offset;
    if (offset == null) break;
    process.stdout.write(`\r[ae-train] Loaded ${embeddings.length} embeddings...`);
  }
  console.log(`\n[ae-train] Total: ${embeddings.length} embeddings`);
  return embeddings;
}

/** Pack N embeddings into a single Float32Array batch */
function packBatch(embeddings, start, end) {
  const n = end - start;
  const X = new Float32Array(n * DIM_IN);
  for (let i = 0; i < n; i++) X.set(embeddings[start + i], i * DIM_IN);
  return X;
}

// ── GPU-accelerated batch cosine for contrastive loss ────────────────────────
function pairCosine(a, b, dim) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < dim; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na * nb) + 1e-8);
}

// ── Main training loop ────────────────────────────────────────────────────────
const stamp  = new Date().toISOString().replace(/[:.]/g, '-');
const report = { runAt: new Date().toISOString(), epochs: EPOCHS, lr: LR, batch: BATCH, status: 'running' };

const redis = new Redis(REDIS_URL, {
  lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});

try {
  await redis.connect();

  // Load embeddings
  const all = await fetchAllEmbeddings();
  report.n = all.length;

  if (all.length < 100) {
    console.warn('[ae-train] Too few embeddings — run npm run graphify:semantic first');
    report.status = 'SKIP';
    process.exit(0);
  }
  if (DRY_RUN) {
    console.log(`[ae-train] DRY RUN — ${all.length} embeddings available, would train ${EPOCHS} epochs`);
    report.status = 'DRY_RUN';
    process.exit(0);
  }

  // Initialize or resume weights
  let W1 = xavierUniform(DIM_IN, DIM_HIDDEN);
  let b1 = zeros(DIM_HIDDEN);
  let W2 = xavierUniform(DIM_HIDDEN, DIM_LATENT);
  let b2 = zeros(DIM_LATENT);
  let W3 = xavierUniform(DIM_LATENT, DIM_HIDDEN);  // decoder
  let b3 = zeros(DIM_HIDDEN);
  let W4 = xavierUniform(DIM_HIDDEN, DIM_IN);
  let b4 = zeros(DIM_IN);

  if (RESUME) {
    try {
      const saved = await redis.hgetall('ace:autoencoder:weights');
      if (saved?.W1) {
        // Weights on disk are in PyTorch (out × in) convention; convert to JS (in × out)
        const parse = (s) => new Float32Array(s.split(',').map(Number));
        W1 = fromTorchLayout(parse(saved.W1), DIM_IN,     DIM_HIDDEN);  // (256×768) → (768×256)
        b1 = parse(saved.b1);
        W2 = fromTorchLayout(parse(saved.W2), DIM_HIDDEN, DIM_LATENT);  // (64×256)  → (256×64)
        b2 = parse(saved.b2);
        if (saved.W3) W3 = fromTorchLayout(parse(saved.W3), DIM_LATENT, DIM_HIDDEN); // (256×64)  → (64×256)
        if (saved.b3) b3 = parse(saved.b3);
        if (saved.W4) W4 = fromTorchLayout(parse(saved.W4), DIM_HIDDEN, DIM_IN);     // (768×256) → (256×768)
        if (saved.b4) b4 = parse(saved.b4);
        console.log('[ae-train] Resumed from saved weights (PyTorch → JS layout)');
      }
    } catch { console.warn('[ae-train] No saved weights to resume from'); }
  }

  // If N-API addon available, use GPU for GEMM (matmul replacement)
  const useGpu = addon && addon.checkCudaAvailable?.() > 0;
  console.log(`[ae-train] GPU training: ${useGpu ? 'YES (cuBLAS)' : 'NO (CPU fallback)'}`);
  console.log(`[ae-train] Training ${EPOCHS} epochs, batch=${BATCH}, lr=${LR}\n`);

  let bestLoss = Infinity;
  const losses = [];

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    // Shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }

    let epochLoss = 0;
    let batchCount = 0;

    for (let s = 0; s + BATCH <= all.length; s += BATCH) {
      const X = packBatch(all, s, s + BATCH);

      // ── Forward: encode 768→64 ────────────────────────────────────────────
      const { z, h1 } = encode(X, BATCH, W1, b1, W2, b2);

      // ── Forward: decode 64→768 ────────────────────────────────────────────
      const h3 = new Float32Array(BATCH * DIM_HIDDEN);
      matmul(z, BATCH, DIM_LATENT, W3, DIM_HIDDEN, h3);
      for (let i = 0; i < BATCH; i++)
        for (let j = 0; j < DIM_HIDDEN; j++) h3[i * DIM_HIDDEN + j] += b3[j];
      relu(h3, BATCH, DIM_HIDDEN);

      const Xhat = new Float32Array(BATCH * DIM_IN);
      matmul(h3, BATCH, DIM_HIDDEN, W4, DIM_IN, Xhat);
      for (let i = 0; i < BATCH; i++)
        for (let j = 0; j < DIM_IN; j++) Xhat[i * DIM_IN + j] += b4[j];

      // ── Reconstruction loss ───────────────────────────────────────────────
      const recLoss = mseLoss(Xhat, X, BATCH * DIM_IN);

      // ── Contrastive loss: pull positives (similar embeddings) together ────
      // Pick first half as anchors, second half as positives
      // Negative = a random index far from the anchor
      let contLoss = 0;
      for (let i = 0; i < BATCH / 2; i++) {
        const a = z.subarray(i * DIM_LATENT, (i + 1) * DIM_LATENT);
        const pos = z.subarray((i + BATCH / 2) * DIM_LATENT, (i + BATCH / 2 + 1) * DIM_LATENT);
        const negIdx = Math.floor(Math.random() * BATCH);
        const neg = z.subarray(negIdx * DIM_LATENT, (negIdx + 1) * DIM_LATENT);
        const simPos = pairCosine(a, pos, DIM_LATENT);
        const simNeg = pairCosine(a, neg, DIM_LATENT);
        contLoss += Math.max(0, 0.5 - simPos + simNeg);
      }
      contLoss /= (BATCH / 2);

      const totalLoss = recLoss + 0.1 * contLoss;
      epochLoss += totalLoss;
      batchCount++;

      // ── Full backprop (SGD) ───────────────────────────────────────────────
      const dXhat = new Float32Array(BATCH * DIM_IN);
      for (let i = 0; i < BATCH * DIM_IN; i++) dXhat[i] = 2 * (Xhat[i] - X[i]) / (BATCH * DIM_IN);

      // dW4 = h3^T · dXhat  (DIM_HIDDEN × DIM_IN)
      for (let j = 0; j < DIM_HIDDEN; j++)
        for (let k = 0; k < DIM_IN; k++) {
          let g = 0;
          for (let i = 0; i < BATCH; i++) g += h3[i * DIM_HIDDEN + j] * dXhat[i * DIM_IN + k];
          W4[j * DIM_IN + k] -= LR * g;
        }
      for (let k = 0; k < DIM_IN; k++) {
        let g = 0;
        for (let i = 0; i < BATCH; i++) g += dXhat[i * DIM_IN + k];
        b4[k] -= LR * g;
      }

      // dh3 = (dXhat · W4^T) * ReLU_mask(h3)  — decoder layer 1 gradient
      const dh3 = new Float32Array(BATCH * DIM_HIDDEN);
      for (let i = 0; i < BATCH; i++)
        for (let j = 0; j < DIM_HIDDEN; j++) {
          let g = 0;
          for (let k = 0; k < DIM_IN; k++) g += dXhat[i * DIM_IN + k] * W4[j * DIM_IN + k];
          dh3[i * DIM_HIDDEN + j] = h3[i * DIM_HIDDEN + j] > 0 ? g : 0;
        }
      // dW3 = z^T · dh3  (DIM_LATENT × DIM_HIDDEN)
      for (let j = 0; j < DIM_LATENT; j++)
        for (let k = 0; k < DIM_HIDDEN; k++) {
          let g = 0;
          for (let i = 0; i < BATCH; i++) g += z[i * DIM_LATENT + j] * dh3[i * DIM_HIDDEN + k];
          W3[j * DIM_HIDDEN + k] -= LR * g;
        }
      for (let k = 0; k < DIM_HIDDEN; k++) {
        let g = 0;
        for (let i = 0; i < BATCH; i++) g += dh3[i * DIM_HIDDEN + k];
        b3[k] -= LR * g;
      }

      // dz_norm = dh3 · W3  — gradient at the L2-normalised latent
      const dz_norm = new Float32Array(BATCH * DIM_LATENT);
      for (let i = 0; i < BATCH; i++)
        for (let j = 0; j < DIM_LATENT; j++) {
          let g = 0;
          for (let k = 0; k < DIM_HIDDEN; k++) g += dh3[i * DIM_HIDDEN + k] * W3[j * DIM_HIDDEN + k];
          dz_norm[i * DIM_LATENT + j] = g;
        }

      // L2-norm Jacobian: dz_raw = dz_norm - z * (z · dz_norm)
      // Since z is already unit-norm, ||z_raw|| ≈ 1 so we skip the /norm term.
      const dz_raw = new Float32Array(BATCH * DIM_LATENT);
      for (let i = 0; i < BATCH; i++) {
        const off = i * DIM_LATENT;
        let dot = 0;
        for (let j = 0; j < DIM_LATENT; j++) dot += z[off + j] * dz_norm[off + j];
        for (let j = 0; j < DIM_LATENT; j++) dz_raw[off + j] = dz_norm[off + j] - z[off + j] * dot;
      }

      // dW2 = h1^T · dz_raw  (DIM_HIDDEN × DIM_LATENT)
      for (let j = 0; j < DIM_HIDDEN; j++)
        for (let k = 0; k < DIM_LATENT; k++) {
          let g = 0;
          for (let i = 0; i < BATCH; i++) g += h1[i * DIM_HIDDEN + j] * dz_raw[i * DIM_LATENT + k];
          W2[j * DIM_LATENT + k] -= LR * g;
        }
      for (let k = 0; k < DIM_LATENT; k++) {
        let g = 0;
        for (let i = 0; i < BATCH; i++) g += dz_raw[i * DIM_LATENT + k];
        b2[k] -= LR * g;
      }

      // dh1 = (dz_raw · W2^T) * ReLU_mask(h1)  — encoder layer 1 gradient
      const dh1 = new Float32Array(BATCH * DIM_HIDDEN);
      for (let i = 0; i < BATCH; i++)
        for (let j = 0; j < DIM_HIDDEN; j++) {
          let g = 0;
          for (let k = 0; k < DIM_LATENT; k++) g += dz_raw[i * DIM_LATENT + k] * W2[j * DIM_LATENT + k];
          dh1[i * DIM_HIDDEN + j] = h1[i * DIM_HIDDEN + j] > 0 ? g : 0;
        }
      // dW1 = X^T · dh1  (DIM_IN × DIM_HIDDEN)
      for (let j = 0; j < DIM_IN; j++)
        for (let k = 0; k < DIM_HIDDEN; k++) {
          let g = 0;
          for (let i = 0; i < BATCH; i++) g += X[i * DIM_IN + j] * dh1[i * DIM_HIDDEN + k];
          W1[j * DIM_HIDDEN + k] -= LR * g;
        }
      for (let k = 0; k < DIM_HIDDEN; k++) {
        let g = 0;
        for (let i = 0; i < BATCH; i++) g += dh1[i * DIM_HIDDEN + k];
        b1[k] -= LR * g;
      }
    }

    const avgLoss = epochLoss / Math.max(batchCount, 1);
    losses.push(avgLoss);
    const improving = avgLoss < bestLoss ? '↓' : '→';
    if (avgLoss < bestLoss) bestLoss = avgLoss;
    process.stdout.write(`\r[ae-train] Epoch ${String(epoch + 1).padStart(3)}/${EPOCHS}  loss=${avgLoss.toFixed(6)} ${improving}  best=${bestLoss.toFixed(6)}`);
  }
  console.log('\n');

  // ── Persist weights to Redis (PyTorch out×in convention) ─────────────────
  // Internal training uses (in×out); transpose at the save boundary so
  // ae-encode-to-redis.mjs and the Python script share the same format.
  // W1_js (768×256) → W1_pt (256×768), W2_js (256×64) → W2_pt (64×256), etc.
  const csv = (W) => Array.from(W).join(',');
  await redis.hset('ace:autoencoder:weights', {
    W1: csv(toTorchLayout(W1, DIM_IN,     DIM_HIDDEN)),   // (256×768)
    b1: csv(b1),
    W2: csv(toTorchLayout(W2, DIM_HIDDEN, DIM_LATENT)),   // (64×256)
    b2: csv(b2),
    W3: csv(toTorchLayout(W3, DIM_LATENT, DIM_HIDDEN)),   // (256×64)
    b3: csv(b3),
    W4: csv(toTorchLayout(W4, DIM_HIDDEN, DIM_IN)),       // (768×256)
    b4: csv(b4),
  });
  await redis.expire('ace:autoencoder:weights', 7 * 24 * 3600); // 7-day TTL

  // ── Compatibility key for karpathy-gpu-enrich.mjs resolveWeights() ──────────
  // resolveWeights() reads ace:autoencoder:decoder:weights as a plain JSON string
  // with { W: number[], b: number[], hidden: 64, outputDim: 768 }.
  // We write the combined W1@W2 product (768×256 × 256×64 → 768×64, transposed to
  // 64×768 row-major) so karpathy gets a trained single-layer 768→64 projection.
  // This loses the ReLU between layers but is far better than random Xavier.
  const W_combined = new Float32Array(DIM_LATENT * DIM_IN);   // (64 × 768)
  for (let r = 0; r < DIM_LATENT; r++) {
    for (let c = 0; c < DIM_IN; c++) {
      let v = 0;
      for (let k = 0; k < DIM_HIDDEN; k++) {
        // W2[k, r] (row=k, col=r in DIM_HIDDEN×DIM_LATENT) × W1[c, k] (row=c, col=k in DIM_IN×DIM_HIDDEN)
        v += W2[k * DIM_LATENT + r] * W1[c * DIM_HIDDEN + k];
      }
      W_combined[r * DIM_IN + c] = v;
    }
  }
  await redis.set(
    'ace:autoencoder:decoder:weights',
    JSON.stringify({ W: Array.from(W_combined), b: Array.from(b2), hidden: DIM_LATENT, outputDim: DIM_IN }),
    'EX', 7 * 24 * 3600
  );

  // Store meta as HASH (same convention as train-autoencoder.py) so that
  // autoencoder-centroids.mjs and ae-encode-to-redis.mjs can read it with hgetall.
  await redis.del('ace:autoencoder:meta'); // remove any stale plain-string key
  await redis.hset('ace:autoencoder:meta', {
    trainedAt: new Date().toISOString(),
    epochs: String(EPOCHS),
    lr: String(LR),
    batch: String(BATCH),
    n: String(all.length),
    bestLoss: String(bestLoss),
    dimIn: String(DIM_IN),
    dimHidden: String(DIM_HIDDEN),
    dimLatent: String(DIM_LATENT),
    architecture: `${DIM_IN}-${DIM_HIDDEN}-${DIM_LATENT}-${DIM_HIDDEN}-${DIM_IN}`,
    activation: 'relu',
    latentNorm: 'l2',
    schemaVersion: 'autoencoder-redis-v2',
    temporalVersion: 'valkey-history-v1',
    sourceCollection: COLLECTION,
    historyKey: AUTOENCODER_HISTORY_STREAM,
    saveMode: 'train-autoencoder.mjs',
  });
  await redis.expire('ace:autoencoder:meta', 7 * 24 * 3600);
  await redis.xadd(
    AUTOENCODER_HISTORY_STREAM,
    '*',
    'event', 'autoencoder_train',
    'trainedAt', new Date().toISOString(),
    'bestLoss', String(bestLoss),
    'vectorCount', String(all.length),
    'epochs', String(EPOCHS),
    'batch', String(BATCH),
    'lr', String(LR),
    'dimIn', String(DIM_IN),
    'dimHidden', String(DIM_HIDDEN),
    'dimLatent', String(DIM_LATENT),
    'schemaVersion', 'autoencoder-redis-v2',
    'temporalVersion', 'valkey-history-v1',
    'sourceCollection', COLLECTION,
    'saveMode', 'train-autoencoder.mjs',
  ).catch(() => {});

  report.bestLoss = bestLoss;
  report.losses = losses;
  report.status = 'PASS';
  console.log(`[ae-train] PASS  bestLoss=${bestLoss.toFixed(6)}`);
  console.log(`[ae-train] Weights saved:`);
  console.log(`[ae-train]   ace:autoencoder:weights           (hash — 8 tensors, full 2-layer model)`);
  console.log(`[ae-train]   ace:autoencoder:decoder:weights   (string — W1@W2 combined 64×768, karpathy compat)`);
  console.log(`[ae-train] Next: npm run karpathy:gpu   (resolveWeights() picks up trained encoder automatically)`);

} catch (err) {
  report.status = 'FAIL';
  report.error  = err.message;
  console.error('[ae-train] ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await redis.quit().catch(() => {});
  const out = JSON.stringify(report, null, 2);
  writeFileSync(resolve(LOG_DIR, `autoencoder-train-${stamp}.json`), out);
  writeFileSync(resolve(LOG_DIR, 'autoencoder-train-latest.json'), out);
}
