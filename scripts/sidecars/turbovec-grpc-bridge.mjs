#!/usr/bin/env node
/**
 * turbovec-grpc-bridge.mjs
 *
 * Node.js gRPC server on :50062 that implements the canonical TurboVecService
 * contract (proto/active/turbovec.proto) by composing two existing,
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
import { loadRepoEnv, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

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
const ANN_PROTO_PATH = path.join(ROOT, 'proto', 'active', 'turbovec.proto');
const GPU_PROTO_PATH = path.join(ROOT, 'proto', 'active', 'gpu_bridge.proto');
const LEGACY_PROTO_PATH = path.join(ROOT, 'proto', 'active', 'turbovec_cuda.proto');
const ADDON_PATH     = path.join(ROOT, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');
const IDENTITY_JOIN_ENABLED = process.env.TURBOVEC_IDENTITY_JOIN === '1';
// Production is fail-closed by default: incomplete executor identities do not
// cross the gRPC boundary into fusion. Set TURBOVEC_CANONICAL_ONLY=0 only for
// an explicitly non-promotional compatibility/evaluation run.
const CANONICAL_ONLY = process.env.TURBOVEC_CANONICAL_ONLY !== '0';

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

const protoLoaderOptions = {
  keepCase: false,
  longs:    Number,
  enums:    String,
  defaults: true,
  oneofs:   true,
};
const annDescriptor = grpc.loadPackageDefinition(
  protoLoader.loadSync(ANN_PROTO_PATH, protoLoaderOptions)
);
const gpuDescriptor = grpc.loadPackageDefinition(
  protoLoader.loadSync(GPU_PROTO_PATH, protoLoaderOptions)
);
const legacyDescriptor = grpc.loadPackageDefinition(
  protoLoader.loadSync(LEGACY_PROTO_PATH, protoLoaderOptions)
);
const annSvcDef = annDescriptor.turbovec.TurboVecService.service;
const gpuSvcDef = gpuDescriptor.gpubridge.GpuBridgeService.service;
const legacySvcDef = legacyDescriptor.turbovec.TurboVecCudaService.service;

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

// TurboVec is an executor. When explicitly enabled, this optional join only
// hydrates the missing workspace revision from the canonical Graphify source
// evidence; it never writes or chooses a historical row by timestamp. A
// source is eligible only when the exact source_ref + code_source_revision
// pair maps to one distinct content-addressed workspace_revision.
let identityPool = null;
let identityJoinDisabled = false;

function getIdentityPool() {
  if (!IDENTITY_JOIN_ENABLED || identityJoinDisabled) return null;
  if (identityPool) return identityPool;
  try {
    const pg = sfRequire('pg');
    const env = loadRepoEnv(process.env);
    identityPool = new pg.Pool({
      connectionString: resolveDatabaseUrl(env),
      max: 1,
      statement_timeout: 5000,
      application_name: 'turbovec-read-only-identity-join',
    });
    return identityPool;
  } catch (error) {
    identityJoinDisabled = true;
    console.warn(`[bridge] identity join unavailable: ${error.message}`);
    return null;
  }
}

async function hydrateWorkspaceRevisions(candidates) {
  const pending = candidates.filter((candidate) => {
    const identity = candidate?.identity;
    return identity?.sourceRef && identity?.sourceRevision && !identity?.workspaceRevision;
  });
  const pool = getIdentityPool();
  if (!pool || pending.length === 0) return { candidates, joined: 0, ambiguous: 0 };

  const sourceRefs = [...new Set(pending.map((candidate) => String(candidate.identity.sourceRef)))];
  const sourceRevisions = [...new Set(pending.map((candidate) => String(candidate.identity.sourceRevision)))];
  try {
    const result = await pool.query(`
      SELECT source_ref, code_source_revision,
             array_agg(DISTINCT workspace_revision) AS workspace_revisions
      FROM public.graphify_files
      WHERE source_ref = ANY($1::text[])
        AND code_source_revision = ANY($2::text[])
        AND workspace_revision ~ '^sha256:[0-9a-f]{64}$'
      GROUP BY source_ref, code_source_revision
    `, [sourceRefs, sourceRevisions]);
    const revisions = new Map(result.rows.map((row) => [
      `${String(row.source_ref)}\0${String(row.code_source_revision)}`,
      (Array.isArray(row.workspace_revisions) ? row.workspace_revisions : [])
        .map((value) => String(value).trim())
        .filter(Boolean),
    ]));
    let joined = 0;
    let ambiguous = 0;
    for (const candidate of pending) {
      const identity = candidate.identity;
      const values = revisions.get(`${identity.sourceRef}\0${identity.sourceRevision}`) ?? [];
      if (values.length === 1) {
        identity.workspaceRevision = values[0];
        joined += 1;
      } else if (values.length > 1) {
        ambiguous += 1;
      }
    }
    return { candidates, joined, ambiguous };
  } catch (error) {
    console.warn(`[bridge] identity join query failed: ${error.message}`);
    return { candidates, joined: 0, ambiguous: 0, error: error.message };
  }
}

function hasQualifiedCandidateIdentity(candidate) {
  const identity = candidate?.identity;
  return Boolean(identity
    && identity.packetKey
    && identity.sourceRef
    && identity.contentHash
    && identity.sourceRevision
    && identity.workspaceRevision
    && identity.namespace);
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
  const hydrated = await hydrateWorkspaceRevisions(candidates);
  const returnedCandidates = CANONICAL_ONLY
    ? hydrated.candidates.filter(hasQualifiedCandidateIdentity)
    : hydrated.candidates;
  if (CANONICAL_ONLY && returnedCandidates.length !== hydrated.candidates.length) {
    console.warn(`[bridge] canonical-only filter dropped ${hydrated.candidates.length - returnedCandidates.length} unqualified candidates`);
  }
  const py = await probePython();
  cb(null, {
    candidates: returnedCandidates.map((c) => {
      const rawIdentity = c.identity && typeof c.identity === 'object' ? c.identity : null;
      const identity = rawIdentity && Object.values(rawIdentity).some((value) => value != null && value !== '')
        ? {
            symbolVersionId: String(rawIdentity.symbolVersionId ?? rawIdentity.symbol_version_id ?? ''),
            packetKey: String(rawIdentity.packetKey ?? rawIdentity.packet_key ?? ''),
            sourceRef: String(rawIdentity.sourceRef ?? rawIdentity.source_ref ?? ''),
            contentHash: String(rawIdentity.contentHash ?? rawIdentity.content_hash ?? ''),
            sourceRevision: String(rawIdentity.sourceRevision ?? rawIdentity.source_revision ?? ''),
            workspaceRevision: String(rawIdentity.workspaceRevision ?? rawIdentity.workspace_revision ?? ''),
            namespace: String(rawIdentity.namespace ?? ''),
          }
        : undefined;
      return {
        id:        String(c.id ?? ''),
        score:     Number(c.score ?? c.turbovec_score ?? 0),
        clusterId: Number(c.cluster ?? c.cluster_id ?? 0),
        ...(identity ? { identity } : {}),
      };
    }),
    backend: `${hydrated.joined > 0 ? 'bridge:py+pg-lineage' : 'bridge:py'}${CANONICAL_ONLY ? '+canonical-only' : ''}`,
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

// Canonical split services. ANN provenance is optional derived metadata;
// TurboVec remains an executor, not an identity owner.
server.addService(annSvcDef, {
  health,
  search,
  transform,
  upsert,
});
server.addService(gpuSvcDef, {
  batchCosine,
  encodeLatent,
  assignSom,
});
// Compatibility surface for older clients; do not add new fields or RPCs to
// turbovec_cuda.proto.
server.addService(legacySvcDef, {
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
  console.log(`[bridge] TurboVecService + GpuBridgeService listening on 0.0.0.0:${port}`);
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
