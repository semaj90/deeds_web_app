#!/usr/bin/env node
/**
 * rotorquant-turbovec-sidecar.mjs
 * Phase A: RotorQuant + TurboVec 4-bit ANN prefilter sidecar
 *
 * Exposes a fast ANN pre-filter HTTP service on port 8792.
 * Primary path: spawns turbovec_sidecar.py (Python + turbovec package).
 * Fallback:     JS-native 64d centroid cosine ANN from Redis keys:
 *                 gpu:autoencoder:centroids_64  (hash, field → "f1,f2,…")
 *                 ace:autoencoder:weights       (hash, W1/b1/W2/b2)
 *                 ace:cluster:*                  (hash → JSON cluster cards)
 *
 * HTTP API (all accept/return JSON):
 *   GET  /health         → { ok, backend, candidateIndexSize, ts }
 *   POST /search         → body: { vector: number[], topK?: number }
 *                          resp: { candidates: [{id, score, cluster}], backend }
 *   POST /prefilter      → body: { vector: number[], topClusters?: number }
 *                          resp: { clusterIds: number[], centroidScores: {id:score} }
 *
 * Usage:
 *   node scripts/atlas/rotorquant-turbovec-sidecar.mjs [--port 8792] [--no-python]
 */

import { createServer } from 'node:http';
import { spawn }        from 'node:child_process';
import Redis            from 'ioredis';
import dotenv           from 'dotenv';
import path             from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc             from '@grpc/grpc-js';
import protoLoader      from '@grpc/proto-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

// ── Config ─────────────────────────────────────────────────────────────────────
const PORT         = Number(process.env.TURBOVEC_PORT ?? 8792);
const GRPC_PORT    = Number(process.env.TURBOVEC_GRPC_PORT ?? 50062);
const REDIS_URL    = process.env.REDIS_URL            ?? 'redis://127.0.0.1:6379';
const PYTHON_EXE   = process.env.PYTHON_EXE           ?? 'python';
const PYTHON_SIDE  = new URL('../turbovec-sidecar.py', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const NO_PYTHON    = process.argv.includes('--no-python');
const CENTROIDS_KEY = 'gpu:autoencoder:centroids_64';
const WEIGHTS_KEY   = 'ace:autoencoder:weights';
const CLUSTER_PFX   = 'ace:cluster:';
const TOP_K_DEFAULT = 200;

// Check if already running to prevent EADDRINUSE
try {
  const checkRes = await fetch(`http://127.0.0.1:${PORT}/health`, {
    signal: AbortSignal.timeout(1000)
  });
  if (checkRes.ok) {
    console.log(`[sidecar] TurboVec ANN sidecar is already running on http://127.0.0.1:${PORT}. Don't start another one.`);
    process.exit(0);
  }
} catch (e) {
  // Not running, proceed with starting the sidecar
}

// ── Redis (cold-start safe) ────────────────────────────────────────────────────
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});
let redisReady = false;
try {
  await redis.connect();
  await redis.ping();
  redisReady = true;
  console.log('[sidecar] Redis connected');
} catch {
  console.warn('[sidecar] Redis offline — JS fallback index will be empty');
}

// ── Centroid index (built from Redis at startup) ───────────────────────────────
let centroids   = [];   // [{id: number, vec: Float32Array}]
let clusterMap  = {};   // clusterId → [source_ref, …]
let weights     = null; // {W1, b1, W2, b2} for 768→64 projection
let indexSize   = 0;

// Upserted 768-dim vectors loaded from Qdrant — [{id: string, vec: Float32Array, featureId, communityId, tags}]
let upsertedVecs = [];
const upsertedIds = new Map(); // id → index in upsertedVecs (for dedup)

async function loadIndex() {
  if (!redisReady) return;

  // 1. Load centroid vectors
  const rawCentroids = await redis.hgetall(CENTROIDS_KEY).catch(() => ({}));
  for (const [idStr, csv] of Object.entries(rawCentroids)) {
    const id  = Number(idStr);
    const vec = new Float32Array(csv.split(',').map(Number));
    if (!isNaN(id) && vec.length > 0) centroids.push({ id, vec });
  }
  console.log(`[sidecar] Loaded ${centroids.length} centroids from Redis`);

  // 2. Load cluster membership (ace:cluster:* cards carry top files)
  const clusterKeys = await redis.keys(`${CLUSTER_PFX}*`).catch(() => []);
  for (const k of clusterKeys) {
    const raw = await redis.get(k).catch(() => null);
    if (!raw) continue;
    try {
      const card = JSON.parse(raw);
      const cid  = card.clusterId ?? Number(k.replace(CLUSTER_PFX, ''));
      clusterMap[cid] = card.files ?? [];
    } catch { /* skip */ }
  }
  console.log(`[sidecar] Cluster map: ${Object.keys(clusterMap).length} clusters`);

  // 3. Load autoencoder weights (768→64 projection)
  const w = await redis.hgetall(WEIGHTS_KEY).catch(() => ({}));
  if (w.W1 && w.b1 && w.W2 && w.b2) {
    weights = {
      W1: w.W1.split(',').map(Number),
      b1: w.b1.split(',').map(Number),
      W2: w.W2.split(',').map(Number),
      b2: w.b2.split(',').map(Number),
    };
    console.log('[sidecar] Autoencoder weights loaded');
  }

  indexSize = centroids.length + upsertedVecs.length;
}

await loadIndex();

// ── Pure-JS ANN helpers ────────────────────────────────────────────────────────
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function relu(arr)      { return arr.map(v => Math.max(0, v)); }
function l2norm(arr)    { const n = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)); return arr.map(v => v / (n || 1)); }
function linearLayer(x, W, b, outDim, inDim) {
  const out = new Array(outDim).fill(0);
  for (let i = 0; i < outDim; i++) {
    let s = b[i];
    for (let j = 0; j < inDim; j++) s += x[j] * W[i * inDim + j];
    out[i] = s;
  }
  return out;
}

function projectTo64(vec768) {
  if (!weights) return vec768.slice(0, 64);
  const h  = relu(linearLayer(vec768, weights.W1, weights.b1, 256, 768));
  const h2 = relu(linearLayer(h,      weights.W2, weights.b2, 64,  256));
  return l2norm(h2);
}

function findNearestCentroids(queryVec64, topN = 5) {
  return centroids
    .map(c => ({ id: c.id, score: cosineSim(queryVec64, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ── Python sidecar management ──────────────────────────────────────────────────
let pythonProc   = null;
let pythonOnline = false;
const PYTHON_URL = `http://127.0.0.1:${PORT + 1}`;  // Python binds one port higher

async function probePython() {
  try {
    const r = await fetch(`${PYTHON_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

async function spawnPython() {
  if (NO_PYTHON) { console.log('[sidecar] --no-python: using JS fallback'); return; }

  // Check if already running
  if (await probePython()) { pythonOnline = true; console.log('[sidecar] Python sidecar already running'); return; }

  try {
    pythonProc = spawn(PYTHON_EXE, [PYTHON_SIDE, '--port', String(PORT + 1)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    pythonProc.stdout.on('data', d => process.stdout.write(`[py] ${d}`));
    pythonProc.stderr.on('data', d => process.stderr.write(`[py] ${d}`));
    pythonProc.on('error', () => { pythonOnline = false; });
    pythonProc.on('exit',  () => { pythonOnline = false; });

    // Wait up to 6s for Python to start
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await probePython()) { pythonOnline = true; console.log('[sidecar] Python TurboVec online'); return; }
    }
    console.warn('[sidecar] Python sidecar did not start in 6s — JS fallback active');
  } catch (e) {
    console.warn(`[sidecar] Failed to spawn Python: ${e.message} — JS fallback active`);
  }
}

await spawnPython();

// ── Request handlers ───────────────────────────────────────────────────────────
async function handleSearch(body) {
  const { vector, topK = TOP_K_DEFAULT } = body;
  if (!Array.isArray(vector)) throw new Error('vector must be an array');

  // Try Python path first
  if (pythonOnline) {
    try {
      const r = await fetch(`${PYTHON_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector, k: topK, top_k: topK }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const d = await r.json();
        const candidates = (d.ids ?? []).map((id, index) => ({
          id,
          score: d.scores?.[index] ?? 0,
          cluster: 0
        }));
        return { candidates, backend: 'turbovec-python', indexed: d.indexed };
      }
    } catch { pythonOnline = false; }
  }

  // If Qdrant-loaded 768d vectors are present, score directly against them
  if (upsertedVecs.length > 0) {
    const qv = new Float32Array(vector);
    const scored = upsertedVecs.map(entry => ({
      id: entry.id,
      score: cosineSim(qv, entry.vec),
      clusterId: entry.communityId ?? 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    return {
      candidates: scored.slice(0, topK),
      backend: 'js-upserted-768d',
      indexed: upsertedVecs.length,
    };
  }

  // JS fallback: project to 64d, find nearest clusters, expand to chunk IDs
  const vec64    = projectTo64(vector);
  const nearest  = findNearestCentroids(vec64, Math.ceil(topK / 20));
  const candidates = [];
  const seen = new Set();

  for (const c of nearest) {
    const files = clusterMap[c.id] ?? [];
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      candidates.push({ id: f, score: c.score, cluster: c.id });
    }
    if (candidates.length >= topK) break;
  }

  return { candidates: candidates.slice(0, topK), backend: 'js-centroid-fallback' };
}

async function handlePrefilter(body) {
  const { vector, topClusters = 5 } = body;
  if (!Array.isArray(vector)) throw new Error('vector must be an array');

  const vec64   = projectTo64(vector);
  const nearest = findNearestCentroids(vec64, topClusters);

  const clusterIds     = nearest.map(c => c.id);
  const centroidScores = Object.fromEntries(nearest.map(c => [c.id, parseFloat(c.score.toFixed(4))]));
  return { clusterIds, centroidScores };
}

// ── HTTP server ────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      return res.end(JSON.stringify({
        ok: true,
        backend: pythonOnline ? 'turbovec-python' : 'js-centroid-fallback',
        candidateIndexSize: indexSize,
        clusterCount: Object.keys(clusterMap).length,
        ts: new Date().toISOString(),
      }));
    }

    if (req.method === 'POST' && (req.url === '/search' || req.url === '/prefilter')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const result = req.url === '/search'
        ? await handleSearch(body)
        : await handlePrefilter(body);

      res.writeHead(200);
      return res.end(JSON.stringify(result));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[sidecar] TurboVec ANN sidecar listening on http://127.0.0.1:${PORT}`);
  console.log(`[sidecar] Backend: ${pythonOnline ? 'turbovec-python' : 'js-centroid-fallback'}`);
  console.log(`[sidecar] Index: ${indexSize} centroids, ${Object.keys(clusterMap).length} clusters`);
});

// ── gRPC handlers ─────────────────────────────────────────────────────────────

function healthGrpc(_call, callback) {
  callback(null, {
    ok: true,
    indexed: indexSize,
    dim: 768,
    bits: 4,
    backend: pythonOnline ? 'turbovec-python' : 'js-centroid-fallback',
  });
}

async function searchGrpc(call, callback) {
  try {
    const { queryVector, topK } = call.request;
    const res = await handleSearch({ vector: queryVector, topK });
    const candidates = (res.candidates ?? []).map(c => ({
      id: String(c.id),
      score: c.score,
      clusterId: c.cluster ?? 0,
    }));
    callback(null, { candidates, backend: res.backend, indexed: indexSize });
  } catch (err) {
    callback(err);
  }
}

function batchCosineGrpc(call, callback) {
  try {
    const { queryVector, candidateVectors, candidateCount, dim = 768 } = call.request;
    const scores = [];
    let qNorm = 0;
    for (let i = 0; i < queryVector.length; i++) qNorm += queryVector[i] * queryVector[i];
    qNorm = Math.sqrt(qNorm) || 1;

    for (let n = 0; n < candidateCount; n++) {
      const offset = n * dim;
      let dot = 0, cNorm = 0;
      for (let i = 0; i < dim; i++) {
        const cv = candidateVectors[offset + i] ?? 0;
        dot += queryVector[i] * cv;
        cNorm += cv * cv;
      }
      scores.push(dot / (qNorm * (Math.sqrt(cNorm) || 1)));
    }
    callback(null, { scores, count: scores.length });
  } catch (err) {
    callback(err);
  }
}

function encodeLatentGrpc(call, callback) {
  try {
    const { vectors, count, inDim = 768, outDim = 64 } = call.request;
    const encoded = [];
    for (let n = 0; n < count; n++) {
      const vec = Array.from(vectors.slice(n * inDim, (n + 1) * inDim));
      const projected = projectTo64(vec);
      // Trim or pad to outDim
      for (let i = 0; i < outDim; i++) encoded.push(projected[i] ?? 0);
    }
    callback(null, { encoded, count, outDim });
  } catch (err) {
    callback(err);
  }
}

function assignSomGrpc(call, callback) {
  try {
    const { vectors, count } = call.request;
    const clusterIds = [];
    const bmuScores = [];
    for (let n = 0; n < count; n++) {
      const vec64 = projectTo64(Array.from(vectors.slice(n * 768, (n + 1) * 768)));
      const nearest = findNearestCentroids(vec64, 1);
      clusterIds.push(nearest[0]?.id ?? 0);
      bmuScores.push(nearest[0]?.score ?? 0);
    }
    callback(null, { clusterIds, bmuScores });
  } catch (err) {
    callback(err);
  }
}

function upsertGrpc(call, callback) {
  try {
    const { records } = call.request;
    let inserted = 0;
    let updated  = 0;

    for (const rec of records ?? []) {
      if (!rec.id || !rec.vector?.length) continue;
      const vec = new Float32Array(rec.vector);
      if (upsertedIds.has(rec.id)) {
        const idx = upsertedIds.get(rec.id);
        upsertedVecs[idx] = { id: rec.id, vec, featureId: rec.featureId ?? '', communityId: rec.communityId ?? 0, tags: rec.tags ?? [] };
        updated++;
      } else {
        upsertedIds.set(rec.id, upsertedVecs.length);
        upsertedVecs.push({ id: rec.id, vec, featureId: rec.featureId ?? '', communityId: rec.communityId ?? 0, tags: rec.tags ?? [] });
        inserted++;
      }
    }

    indexSize = centroids.length + upsertedVecs.length;
    callback(null, { indexed: indexSize, inserted, updated, backend: 'js-upserted-768d' });
  } catch (err) {
    callback(err);
  }
}

function transformGrpc(call, callback) {
  try {
    const { vectors } = call.request;
    const numVectors = Math.floor(vectors.length / 768);
    const projected = [];
    for (let i = 0; i < numVectors; i++) {
      const vec768 = Array.from(vectors.slice(i * 768, (i + 1) * 768));
      const vec64 = projectTo64(vec768);
      for (const val of vec64) projected.push(val);
    }
    callback(null, { projectedVectors: projected });
  } catch (err) {
    callback(err);
  }
}

let grpcServer = null;

function startGrpcServer() {
  try {
    const protoRoot = path.resolve(__dirname, '../../../proto/active');

    // Legacy combined proto — keeps existing TurboVecCudaService clients working
    const legacyDef = protoLoader.loadSync(path.join(protoRoot, 'turbovec_cuda.proto'), {
      keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true,
    });
    // Split GPU bridge proto — new boundary
    const gpuDef = protoLoader.loadSync(path.join(protoRoot, 'gpu_bridge.proto'), {
      keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true,
    });

    const legacyDesc   = grpc.loadPackageDefinition(legacyDef);
    const gpuDesc      = grpc.loadPackageDefinition(gpuDef);
    const turbovecProto = legacyDesc.turbovec;
    const gpuProto      = gpuDesc.gpubridge;

    grpcServer = new grpc.Server();

    // TurboVecCudaService — ANN + compat shim (all methods for backward compat)
    grpcServer.addService(turbovecProto.TurboVecCudaService.service, {
      health:       healthGrpc,
      search:       searchGrpc,
      batchCosine:  batchCosineGrpc,
      encodeLatent: encodeLatentGrpc,
      assignSom:    assignSomGrpc,
      transform:    transformGrpc,
      upsert:       upsertGrpc,
    });

    // GpuBridgeService — GPU tensor ops at correct boundary
    grpcServer.addService(gpuProto.GpuBridgeService.service, {
      batchCosine:  batchCosineGrpc,
      encodeLatent: encodeLatentGrpc,
      assignSom:    assignSomGrpc,
    });

    grpcServer.bindAsync(
      `127.0.0.1:${GRPC_PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          console.error(`[sidecar] Failed to bind gRPC server: ${err.message}`);
          return;
        }
        console.log(`[sidecar] TurboVec + GpuBridge gRPC server listening on 127.0.0.1:${boundPort}`);
      }
    );
  } catch (err) {
    console.error(`[sidecar] Failed to initialize gRPC server: ${err.message}`);
  }
}

startGrpcServer();

process.on('SIGINT',  () => { pythonProc?.kill(); server.close(); grpcServer?.forceShutdown(); process.exit(0); });
process.on('SIGTERM', () => { pythonProc?.kill(); server.close(); grpcServer?.forceShutdown(); process.exit(0); });
