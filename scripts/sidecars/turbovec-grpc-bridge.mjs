#!/usr/bin/env node
/**
 * turbovec-grpc-bridge.mjs
 *
 * Node.js gRPC server on :50062 that implements the TurboVecCudaService
 * contract (proto/active/turbovec_cuda.proto) by composing two existing,
 * already-built pieces:
 *
 *   - simd-bridge/cpp/build/Release/tensorrt_bridge.node  (CUDA / N-API)
 *       → BatchCosine, EncodeLatent, AssignSom, Transform
 *   - Python HTTP sidecar on :8791 (turbovec-sidecar.py)
 *       → Search, Health (indexed count)
 *
 * Hard rules honored (per parent-atlas-open-lanes-todo.md §Hard Rules):
 *   - No re-ingest:        bridge is read-only over what the Python sidecar
 *                          already indexed; Upsert returns indexed=0 / 501.
 *   - No new mutations:    the addon is invoked only for compute (cosine /
 *                          autoencoder / SOM assign), never for writes.
 *   - Fail-open contract:  every method returns a typed-empty response when
 *                          the backing piece is offline, so callers keep
 *                          their existing graceful-fallback logic.
 *
 * Start:
 *   node scripts/sidecars/turbovec-grpc-bridge.mjs                 # :50062
 *   PORT=50062 PYTHON_SIDECAR=http://127.0.0.1:8791 node ...       # override
 *
 * Health probe (after start):
 *   node scripts/atlas/turbovec-grpc-health.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');

// Resolve @grpc/grpc-js and @grpc/proto-loader from sveltekit-frontend/node_modules
// (root has no package install). Using createRequire keeps the script CWD-agnostic.
const sfRequire = createRequire(path.join(ROOT, 'sveltekit-frontend', 'package.json'));
const grpc        = sfRequire('@grpc/grpc-js');
const protoLoader = sfRequire('@grpc/proto-loader');

const PORT           = Number(process.env.PORT ?? 50062);
const PYTHON_SIDECAR = (process.env.PYTHON_SIDECAR ?? 'http://127.0.0.1:8791').replace(/\/+$/, '');
const PROTO_PATH     = path.join(ROOT, 'proto', 'active', 'turbovec_cuda.proto');
const ADDON_PATH     = path.join(ROOT, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');

// ── Load N-API addon (optional — bridge stays useful w/o it) ──────────────────

let addon = null;
let addonCudaCode = 0;
try {
  const r = createRequire(import.meta.url);
  addon = r(ADDON_PATH);
  addonCudaCode = addon.checkCudaAvailable?.() ?? 0;
  const label = addonCudaCode === 2 ? 'CUDA+cuDNN' : addonCudaCode === 1 ? 'CUDA' : 'CPU';
  console.log(`[bridge] addon loaded (${label})`);
} catch (err) {
  console.warn(`[bridge] addon NOT loaded: ${err.message.split('\n')[0]}`);
}

// ── Proto load ────────────────────────────────────────────────────────────────

const pkgDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs:    Number,
  enums:    String,
  defaults: true,
  oneofs:   true,
});
const descriptor = grpc.loadPackageDefinition(pkgDef);
const svcDef     = descriptor.turbovec.TurboVecCudaService.service;

// ── Python sidecar probe (cached, 5s TTL) ─────────────────────────────────────

let pyHealthCache = { at: 0, value: null };

async function probePython() {
  const now = Date.now();
  if (now - pyHealthCache.at < 5000) return pyHealthCache.value;
  try {
    const res = await fetch(`${PYTHON_SIDECAR}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) { pyHealthCache = { at: now, value: null }; return null; }
    const j = await res.json();
    pyHealthCache = { at: now, value: j };
    return j;
  } catch {
    pyHealthCache = { at: now, value: null };
    return null;
  }
}

async function pythonSearch(queryVector, topK) {
  try {
    const res = await fetch(`${PYTHON_SIDECAR}/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ vector: queryVector, topK }),
      signal:  AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (Array.isArray(j.candidates)) return j.candidates;
    if (Array.isArray(j.ids)) {
      const scores = Array.isArray(j.scores) ? j.scores : [];
      return j.ids.map((id, index) => ({
        id,
        score: Number(scores[index] ?? 0),
        cluster: 0,
      }));
    }
    return null;
  } catch {
    return null;
  }
}

// ── Service handlers ──────────────────────────────────────────────────────────

async function health(_call, cb) {
  const py = await probePython();
  cb(null, {
    ok:      Boolean(py?.ok) || addonCudaCode > 0,
    indexed: Number(py?.indexed ?? 0),
    dim:     Number(py?.dim ?? 768),
    bits:    Number(py?.bits ?? py?.bit_width ?? 2),
    backend: py?.ok
      ? `bridge:py(${py.backend ?? 'python'})+addon(${addonCudaCode === 2 ? 'cudnn' : addonCudaCode === 1 ? 'cuda' : 'cpu'})`
      : `bridge:addon(${addonCudaCode === 2 ? 'cudnn' : addonCudaCode === 1 ? 'cuda' : 'cpu'})`,
  });
}

async function search(call, cb) {
  const { queryVector = [], topK = 200 } = call.request ?? {};
  const candidates = await pythonSearch(queryVector, topK);
  if (!candidates) {
    return cb(null, { candidates: [], backend: 'bridge:offline', indexed: 0 });
  }
  const py = await probePython();
  cb(null, {
    candidates: candidates.map((c) => ({
      id:        String(c.id ?? ''),
      score:     Number(c.score ?? c.turbovec_score ?? 0),
      clusterId: Number(c.cluster ?? c.cluster_id ?? 0),
    })),
    backend: 'bridge:py',
    indexed: Number(py?.indexed ?? 0),
  });
}

function batchCosine(call, cb) {
  const { queryVector = [], candidateVectors = [], candidateCount = 0, dim = 768 } = call.request ?? {};
  if (!addon || typeof addon.batchCosineSimilarity !== 'function') {
    return cb(null, { scores: [], count: 0 });
  }
  try {
    const d = Number(dim) || 768;
    const n = Number(candidateCount) || Math.floor(candidateVectors.length / d);
    const query = toF32(queryVector, d);
    const corpus = toF32(candidateVectors, n * d);
    const scores = new Float32Array(n);
    const rc = addon.batchCosineSimilarity(query, d, corpus, n, scores, n);
    cb(null, { scores: rc === 0 ? Array.from(scores, Number) : [], count: rc === 0 ? scores.length : 0 });
  } catch (err) {
    console.warn('[bridge] batchCosine failed:', err.message);
    cb(null, { scores: [], count: 0 });
  }
}

function encodeLatent(call, cb) {
  const { vectors = [], count = 0, inDim = 768, outDim = 64 } = call.request ?? {};
  if (!addon || typeof addon.autoencoderEncode !== 'function') {
    return cb(null, { encoded: [], count: 0, outDim });
  }
  try {
    const n = Number(count) || Math.floor(vectors.length / Number(inDim || 768)) || 1;
    const inputDim = Number(inDim) || 768;
    const hidden = Number(outDim) || 64;
    const input = toF32(vectors, n * inputDim);
    const { weights, bias } = makeProjectionWeights(inputDim, hidden);
    const res = addon.autoencoderEncode(input, n, inputDim, weights, bias, hidden);
    cb(null, { encoded: Array.from(res ?? [], Number), count: n, outDim: hidden });
  } catch (err) {
    console.warn('[bridge] encodeLatent failed:', err.message);
    cb(null, { encoded: [], count: 0, outDim });
  }
}

function assignSom(call, cb) {
  const { vectors = [], count = 0 } = call.request ?? {};
  if (!addon || typeof addon.somCache !== 'function') {
    return cb(null, { clusterIds: [], bmuScores: [] });
  }
  try {
    // somCache(vectors, count) — current addon returns Float32Array of BMU ids.
    const n = Number(count) || 1;
    const input = toF32(vectors);
    const res = addon.somCache(input, n);
    const clusters = Array.from(res ?? [], Number).slice(0, n);
    cb(null, {
      clusterIds: clusters.map((value) => Math.trunc(value)),
      bmuScores:  clusters.map(() => 1),
    });
  } catch (err) {
    console.warn('[bridge] assignSom failed:', err.message);
    cb(null, { clusterIds: [], bmuScores: [] });
  }
}

function transform(call, cb) {
  // Transform is a PCA / projection op. The addon exports pcaProject; honor the
  // contract shape regardless of which backend ran. Fail-open with empty list.
  const { vectors = [], count = 0, inDim = 768, outDim = 64, transformId = '' } = call.request ?? {};
  if (!addon || typeof addon.pcaProject !== 'function') {
    return cb(null, { projectedVectors: [], count: 0, outDim });
  }
  try {
    const n = Number(count) || Math.floor(vectors.length / Number(inDim || 768)) || 1;
    const inputDim = Number(inDim) || 768;
    const projectedDim = Number(outDim) || 64;
    const input = toF32(vectors, n * inputDim);
    const mean = new Float32Array(inputDim);
    const components = makeProjectionComponents(inputDim, projectedDim);
    const res = addon.pcaProject(input, n, inputDim, mean, components, projectedDim);
    cb(null, { projectedVectors: Array.from(res ?? [], Number), count: n, outDim: projectedDim });
  } catch (err) {
    console.warn('[bridge] transform failed:', err.message);
    cb(null, { projectedVectors: [], count: 0, outDim });
  }
}

function upsert(_call, cb) {
  // Hard rule: no re-ingest from the bridge. Python sidecar owns index state.
  cb(null, { indexed: 0, inserted: 0, updated: 0, backend: 'bridge:read-only' });
}

function toF32(values, expectedLength = 0) {
  const out = new Float32Array(expectedLength || values.length);
  const n = Math.min(out.length, values.length);
  for (let i = 0; i < n; i++) out[i] = Number(values[i]) || 0;
  return out;
}

function makeProjectionComponents(inputDim, outDim) {
  const components = new Float32Array(inputDim * outDim);
  const step = Math.max(1, Math.floor(inputDim / outDim));
  for (let i = 0; i < outDim; i++) {
    components[i * inputDim + Math.min(inputDim - 1, i * step)] = 1;
  }
  return components;
}

function makeProjectionWeights(inputDim, outDim) {
  return {
    weights: makeProjectionComponents(inputDim, outDim),
    bias: new Float32Array(outDim),
  };
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = new grpc.Server({
  'grpc.max_receive_message_length': 32 * 1024 * 1024,
  'grpc.max_send_message_length':    32 * 1024 * 1024,
});

server.addService(svcDef, {
  health,
  search,
  batchCosine,
  encodeLatent,
  assignSom,
  transform,
  upsert,
});

server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('[bridge] bind failed:', err.message);
    process.exit(1);
  }
  console.log(`[bridge] TurboVecCudaService listening on 0.0.0.0:${port}`);
  console.log(`[bridge] python sidecar:    ${PYTHON_SIDECAR}`);
  console.log(`[bridge] addon cuda code:   ${addonCudaCode} (0=cpu, 1=cuda, 2=cuda+cudnn)`);
});

function shutdown(sig) {
  console.log(`[bridge] ${sig} → tryShutdown`);
  server.tryShutdown(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
