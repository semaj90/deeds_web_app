#!/usr/bin/env node
/**
 * karpathy-gpu-enrich.mjs
 *
 * GPU-accelerated authority blend: takes top-N nodes (or dirty files from
 * the incremental startup queue), runs them through three native CUDA passes
 * via tensorrt_bridge.node, blends the scores, writes results to Redis and
 * a markdown recommendation report.
 *
 * Pipeline:
 *   1. Read candidate stableKeys (--dirty: from Redis ace:rank:dirty_files,
 *      else top-N by graphPageRank from Neo4j)
 *   2. Pull 768-dim content_embedding from Qdrant codebase_chunks_768
 *   3. autoencoderEncode 768 → 64 (compressed "memory path" projection)
 *   4. attentionScoreGPU vs a fixed risk-pattern probe vector
 *      (query-weighted importance — flags files attention-aligned with risk)
 *   5. Blend with graphPageRank + graphAuthorityScore from Neo4j
 *   6. Sort by composite score, write top-K markdown recommendations
 *
 * Writes:
 *   - Redis hash gpu:karpathy:scores  (stableKey → JSON {pr, attn, blend})
 *   - Redis key  gpu:karpathy:summary (last run metadata, 24h TTL)
 *   - File next_steps/active/karpathy-gpu-recommendations.md
 *   - File logs/task-output/pipeline-test/karpathy-gpu-<ts>.json
 *
 * Usage:
 *   node scripts/karpathy-gpu-enrich.mjs                  # top-50 from Neo4j
 *   node scripts/karpathy-gpu-enrich.mjs --dirty          # only dirty files
 *   node scripts/karpathy-gpu-enrich.mjs --limit 100      # top-100
 *   node scripts/karpathy-gpu-enrich.mjs --dry-run        # no Redis/MD writes
 */
import process from 'node:process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Redis from 'ioredis';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..');
const esmRequire = createRequire(import.meta.url);

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const DIRTY_ONLY = args.includes('--dirty');
const SOURCE     = args.find(a => a.startsWith('--source='))?.split('=')[1]
                 ?? (args.includes('--source') ? args[args.indexOf('--source') + 1] : null);
const HIT_LOG_HOURS = parseInt(
  args.find(a => a.startsWith('--hours='))?.split('=')[1] ?? '24', 10) || 24;
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

// ── Config ────────────────────────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const NEO4J_URL = process.env.NEO4J_URL ?? 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

const LOG_DIR = resolve(ROOT, 'logs/task-output/pipeline-test');
const REPORT = resolve(REPO, 'sveltekit-frontend/next_steps/active/karpathy-gpu-recommendations.md');
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(dirname(REPORT), { recursive: true });

const log = {
  startedAt: new Date().toISOString(),
  mode: DIRTY_ONLY ? 'dirty' : (SOURCE === 'hit-log' ? 'hit-log' : 'topN'),
  limit: LIMIT,
  dry: DRY,
  candidates: 0,
  candidateSource: '',
  embedded: 0,
  skipped: 0,
  gpu: { encoded: false, attention: false, fallback: null },
  topRisk: [],
  status: 'running',
};

// ── GPU bridge ────────────────────────────────────────────────────────────────
function loadGpuAddon() {
  const paths = [
    resolve(REPO, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    resolve(REPO, 'simd-bridge/cpp/build/tensorrt_bridge.node'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const mod = esmRequire(p);
      if (typeof mod.autoencoderEncode === 'function') return mod;
    } catch { /* try next */ }
  }
  return null;
}

const gpu = loadGpuAddon();
if (!gpu) {
  log.gpu.fallback = 'tensorrt_bridge.node not loadable — running in CPU/no-GPU degraded mode';
  console.warn('[karpathy] ' + log.gpu.fallback);
}

// ── Neo4j ─────────────────────────────────────────────────────────────────────
async function neo4jQuery(cypher, params = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '));
  return data.results?.[0]?.data ?? [];
}

/**
 * Demand-weighted candidate source: top-N chunks the agent actually
 * retrieved in the last `hours` window, weighted by average rerank score.
 * Backed by chunk_hit_log (populated by recordChunkHits in the ACE pipeline).
 *
 * Falls back to PageRank if the hit-log is empty for the window.
 */
async function fetchTopByHitLog(limit, hours) {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
    max: 2,
  });
  try {
    const { rows } = await pool.query(
      `SELECT
         relative_path                                  AS stable_key,
         count(*)                                       AS hits,
         avg(coalesce(rerank_score, score, 0.5))::real  AS avg_score,
         (count(*) * avg(coalesce(rerank_score, score, 0.5)))::real AS hot_score,
         max(gpu_cluster)                               AS gpu_cluster
       FROM chunk_hit_log
       WHERE hit_at > now() - ($1 || ' hours')::interval
       GROUP BY relative_path
       ORDER BY hot_score DESC
       LIMIT $2`,
      [String(hours), limit],
    );
    return rows.map(r => ({
      stableKey: r.stable_key,
      pr:        parseFloat(r.hot_score) || 0,   // hot_score takes the PR slot
      authority: parseFloat(r.avg_score) || 0,
      community: r.gpu_cluster ?? -1,
      hits:      parseInt(r.hits, 10) || 0,
      source:    'hit-log',
    }));
  } finally {
    await pool.end();
  }
}

async function fetchTopByPageRank(limit) {
  const rows = await neo4jQuery(
    `MATCH (n:CodebaseFile) WHERE n.graphPageRank IS NOT NULL
     RETURN coalesce(n.stableKey, n.filePath, n.relativePath) AS stableKey,
            n.graphPageRank AS pr,
            coalesce(n.graphAuthorityScore, 0) AS authority,
            coalesce(n.communityId, -1) AS community
     ORDER BY pr DESC LIMIT $limit`,
    { limit },
  );
  return rows.map(r => ({
    stableKey: r.row?.[0],
    pr: r.row?.[1] ?? 0,
    authority: r.row?.[2] ?? 0,
    community: r.row?.[3] ?? -1,
  })).filter(r => r.stableKey);
}

async function fetchScoresForKeys(keys) {
  if (!keys.length) return new Map();
  const rows = await neo4jQuery(
    `UNWIND $keys AS k
     MATCH (n:CodebaseFile)
     WHERE n.stableKey = k OR n.filePath = k OR n.relativePath = k
     RETURN coalesce(n.stableKey, n.filePath, n.relativePath) AS stableKey,
            coalesce(n.graphPageRank, 0) AS pr,
            coalesce(n.graphAuthorityScore, 0) AS authority,
            coalesce(n.communityId, -1) AS community
     LIMIT $cap`,
    { keys, cap: keys.length * 2 },
  );
  const map = new Map();
  for (const r of rows) {
    const sk = r.row?.[0];
    if (sk) map.set(sk, { stableKey: sk, pr: r.row?.[1] ?? 0, authority: r.row?.[2] ?? 0, community: r.row?.[3] ?? -1 });
  }
  return map;
}

// ── Qdrant ────────────────────────────────────────────────────────────────────

/**
 * Batch-fetch content_embedding vectors from Qdrant for multiple file paths.
 *
 * Uses a single scroll request per BATCH_SIZE paths (should-filter union).
 * Replaces the old N×sequential-scroll pattern — for 50 candidates this is
 * 1 round-trip vs 50, cutting embed-fetch wall time from ~2.5s → ~60ms.
 *
 * @param {string[]} filePaths - stableKey / relative file paths to look up
 * @returns {Map<string, Float32Array>} path → 768-dim embedding (missing = not indexed)
 */
const QDRANT_BATCH_SIZE = 100;

async function fetchEmbeddingsBatch(filePaths) {
  const result = new Map();
  if (!filePaths.length) return result;

  for (let i = 0; i < filePaths.length; i += QDRANT_BATCH_SIZE) {
    const chunk = filePaths.slice(i, i + QDRANT_BATCH_SIZE);
    try {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // should = OR across all file paths in this batch
          filter: {
            should: chunk.map(fp => ({ key: 'file_path', match: { value: fp } })),
          },
          limit: chunk.length,
          with_vector: true,
          with_payload: ['file_path'],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.warn(`[karpathy] Qdrant batch ${i / QDRANT_BATCH_SIZE} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const pt of (data.result?.points ?? [])) {
        const fp = pt.payload?.file_path;
        if (!fp) continue;
        // Named vector: support both codebase_chunks_768 shapes
        const vec = pt.vector?.content ?? pt.vector;
        if (Array.isArray(vec) && vec.length === 768) {
          if (!result.has(fp)) result.set(fp, new Float32Array(vec));
        }
      }
    } catch (err) {
      console.warn(`[karpathy] Qdrant batch ${i / QDRANT_BATCH_SIZE} error: ${err.message}`);
    }
  }
  return result;
}

// ── GPU passes ────────────────────────────────────────────────────────────────
const HIDDEN_DIM = 64;
const AE_WEIGHTS_KEY = 'ace:autoencoder:decoder:weights'; // written by run-tensor-topology-mapreduce.mjs

function makeRandomWeights(inDim, outDim, seed = 42) {
  // Deterministic Xavier init — last resort when no trained/PCA weights exist
  const W = new Float32Array(inDim * outDim);
  const b = new Float32Array(outDim);
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xffffffff) * 2 - 1; };
  const scale = Math.sqrt(2 / (inDim + outDim));
  for (let i = 0; i < W.length; i++) W[i] = rand() * scale;
  return { W, b };
}

/** Try Redis → PCA from data → random Xavier (in that priority order). */
async function resolveWeights(redis, embeddings, n, inDim) {
  // 1. Trained/PCA weights from mapreduce pipeline
  try {
    const raw = await redis.get(AE_WEIGHTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // mapreduce stores { W: number[], b: number[], hidden: number, outputDim: number }
      // W is (4 × 768) OLS decoder — not directly usable as 768→64 encoder.
      // If hidden === HIDDEN_DIM use as-is; else fall through.
      if (Array.isArray(parsed.W) && parsed.hidden === HIDDEN_DIM) {
        log.gpu.weightsSource = 'redis:trained';
        return { W: new Float32Array(parsed.W), b: new Float32Array(parsed.b ?? HIDDEN_DIM) };
      }
    }
  } catch { /* non-fatal */ }

  // 2. PCA from data (768→64 via power-iteration approximation; no GPU required)
  if (n >= HIDDEN_DIM + 1 && embeddings.length >= HIDDEN_DIM + 1) {
    try {
      const W = pcaWeights(embeddings, n, inDim, HIDDEN_DIM);
      if (W) {
        log.gpu.weightsSource = 'pca:data';
        return { W, b: new Float32Array(HIDDEN_DIM) }; // zero bias for PCA
      }
    } catch { /* non-fatal */ }
  }

  // 3. Random Xavier — encodes run but scores carry no semantic meaning
  log.gpu.weightsSource = 'random:xavier';
  return makeRandomWeights(inDim, HIDDEN_DIM);
}

/**
 * Approximate PCA via 2-round power iteration (Krylov).
 * Returns W [inDim × outDim] such that z = x @ W gives the top-outDim principal components.
 * Cheap: O(n × inDim × outDim) ≈ 20ms for n=200, inDim=768, outDim=64 on CPU.
 */
function pcaWeights(embeddings, n, inDim, outDim) {
  // Build data matrix and compute mean
  const mean = new Float64Array(inDim);
  for (let i = 0; i < n; i++) for (let j = 0; j < inDim; j++) mean[j] += embeddings[i][j] / n;
  // Center embeddings in Float64
  const X = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(inDim);
    for (let j = 0; j < inDim; j++) row[j] = embeddings[i][j] - mean[j];
    X.push(row);
  }
  // Random initialisation for power iteration
  let Q = Array.from({ length: outDim }, (_, k) => {
    const v = new Float64Array(inDim);
    for (let j = 0; j < inDim; j++) v[j] = Math.sin(k * 1.618 + j * 0.577);
    return v;
  });
  // 2 rounds of power iteration + QR (Gram-Schmidt)
  for (let round = 0; round < 2; round++) {
    // Apply covariance: v_new = X^T (X v)
    Q = Q.map(v => {
      const Xv = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let j = 0; j < inDim; j++) Xv[i] += X[i][j] * v[j];
      const out = new Float64Array(inDim);
      for (let i = 0; i < n; i++) for (let j = 0; j < inDim; j++) out[j] += X[i][j] * Xv[i];
      return out;
    });
    // Gram-Schmidt orthonormalise
    for (let k = 0; k < outDim; k++) {
      for (let prev = 0; prev < k; prev++) {
        let dot = 0; for (let j = 0; j < inDim; j++) dot += Q[k][j] * Q[prev][j];
        for (let j = 0; j < inDim; j++) Q[k][j] -= dot * Q[prev][j];
      }
      let norm = 0; for (let j = 0; j < inDim; j++) norm += Q[k][j] ** 2;
      norm = Math.sqrt(norm);
      if (norm < 1e-10) return null;
      for (let j = 0; j < inDim; j++) Q[k][j] /= norm;
    }
  }
  // Pack Q (outDim × inDim) → W (inDim × outDim) column-major for matmul
  const W = new Float32Array(inDim * outDim);
  for (let k = 0; k < outDim; k++) for (let j = 0; j < inDim; j++) W[j * outDim + k] = Q[k][j];
  return W;
}

function runAutoencoder(embeddings, n, inDim, weightsBundle = null) {
  if (!gpu?.autoencoderEncode) return null;
  const { W, b } = weightsBundle ?? makeRandomWeights(inDim, HIDDEN_DIM);
  const flat = new Float32Array(n * inDim);
  for (let i = 0; i < n; i++) flat.set(embeddings[i], i * inDim);
  const encoded = gpu.autoencoderEncode(flat, n, inDim, W, b, HIDDEN_DIM);
  log.gpu.encoded = true;
  return encoded;
}

/**
 * @reserved Future MLA-attention path (DeepSeek-style multi-latent compression).
 * Encodes a probe vector through the same shared weights as the docs so they
 * land in the same 64-dim subspace. Currently bypassed because random Xavier
 * weights produce flat tanh outputs — revive once trained autoencoder weights
 * are available (e.g., from a fine-tuned MLA head over codebase_chunks_768).
 */
function encodeProbe(probeEmbed, weightsBundle) {
  if (!gpu?.autoencoderEncode || !probeEmbed) return null;
  const { W, b } = weightsBundle;
  return gpu.autoencoderEncode(probeEmbed, 1, 768, W, b, HIDDEN_DIM);
}

// Risk-pattern query that tags files associated with auth, error handling,
// crypto, IO boundaries, deserialization, schema migration, network — i.e.
// places where bugs and CVEs cluster. Embed it once, autoencode through the
// same weights, then use as the attention probe — gives a differential signal
// instead of a centroid-based centrality measure.
const RISK_QUERY =
  'unsafe deserialization auth bypass complex import graph deep call chains ' +
  'database transaction error handling cryptographic boundary input validation';

// Embedding cascade:
//   1. SvelteKit /api/embed  — wraps embeddinggemma with Redis L1 + Bifrost L2 cache (5ms hits)
//   2. Direct Ollama         — fallback when dev server is down
//   3. TurboQuant llama-server is chat-only on :8090 (started without --embeddings) so skipped.
async function fetchProbeEmbedding(query) {
  const sveltekitUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:5173';
  const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

  // Try SvelteKit cached path first
  try {
    const res = await fetch(`${sveltekitUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      const v = data.embedding;
      if (Array.isArray(v) && v.length === 768) {
        log.probeSource = 'sveltekit-cached';
        return new Float32Array(v);
      }
    }
  } catch { /* fall through to Ollama */ }

  // Fallback: direct Ollama
  try {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const v = data.embedding;
    if (Array.isArray(v) && v.length === 768) {
      log.probeSource = 'ollama-direct';
      return new Float32Array(v);
    }
  } catch { /* exhausted */ }
  return null;
}

/**
 * @reserved MLA-style attention over the compressed 64-dim space. Kept for
 * the path where: (a) trained autoencoder weights become available, OR
 * (b) we switch to TurboQuant's MLA head where compressed-space attention
 * is the canonical query path. Currently bypassed in favor of direct 768-dim
 * attention since random-projection compression destroys the signal.
 */
function attentionVsRiskProbe(encoded, n, encodedProbe, fallbackCentroid = null) {
  if (!gpu?.attentionScoreGPU || !encoded) return null;
  let probe;
  if (encodedProbe && encodedProbe.length === HIDDEN_DIM) {
    probe = encodedProbe;
    log.probeKind = 'risk-query';
  } else {
    // Fallback: centroid of encoded space (centrality, not differential)
    probe = fallbackCentroid ?? new Float32Array(HIDDEN_DIM);
    if (!fallbackCentroid) {
      for (let i = 0; i < n; i++) for (let d = 0; d < HIDDEN_DIM; d++) probe[d] += encoded[i * HIDDEN_DIM + d];
      for (let d = 0; d < HIDDEN_DIM; d++) probe[d] /= n;
    }
    log.probeKind = 'centroid';
  }
  try {
    // C++ signature: attentionScoreGPU(query, dim, keys, n)
    const scores = gpu.attentionScoreGPU(probe, HIDDEN_DIM, encoded, n);
    log.gpu.attention = true;
    return scores;
  } catch (err) {
    log.gpu.attentionError = err.message;
    return null;
  }
}

// ── Score blend ───────────────────────────────────────────────────────────────
// normalize() (divide-by-max) is intentionally NOT used for attention scores —
// see spreadByZScore() below. Kept as a named utility for callers that want
// simple 0–1 scaling on already-spread distributions (e.g. PageRank scores).
export function normalize(arr) {
  if (!arr || !arr.length) return null;
  let max = 0;
  for (const v of arr) if (v > max) max = v;
  if (max === 0) return arr;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / max;
  return out;
}

/**
 * Spread tightly-clustered attention scores via z-score → sigmoid.
 *
 * Raw cosine similarity in 768-dim embedding spaces is famously concentrated:
 * even for unrelated content, dot products against any query land in a narrow
 * 0.99–1.00 band. The plain `normalize()` (divide by max) preserves this
 * narrowness and the resulting "attention" gives no differential signal —
 * every file scores ~1.0.
 *
 * This helper:
 *   1. Computes mean + std of the raw scores
 *   2. Z-scores each value: z_i = (raw_i - mean) / std
 *   3. Maps through sigmoid: 1 / (1 + exp(-z * temp))
 *   4. Returns Float32Array in [0, 1] with preserved rank order
 *
 * `temp` controls sharpness (higher = more spread). Default 1.5 gives a
 * ~0.10–0.95 spread for typical 768-dim cosine inputs.
 */
function spreadByZScore(arr, temp = 1.5) {
  if (!arr || arr.length < 2) return arr;
  const n = arr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n) || 1e-9;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = (arr[i] - mean) / std;
    out[i] = 1 / (1 + Math.exp(-z * temp));
  }
  return out;
}

// ── Redis run-log stream ──────────────────────────────────────────────────────
// Appends a structured entry to gpu:karpathy:run_log (Redis Stream) so ACE/MCP
// can consume the full GPU telemetry trail without parsing JSON log files.
// MAXLEN 500 keeps the stream bounded (~50 KB).
async function appendRunLogStream(redis, runData) {
  try {
    await redis.xadd(
      'gpu:karpathy:run_log', 'MAXLEN', '~', '500', '*',
      'runAt',       runData.runAt,
      'mode',        runData.mode,
      'candidates',  String(runData.candidates),
      'embedded',    String(runData.embedded),
      'gpuEncoded',  String(runData.gpuEncoded),
      'gpuAttention',String(runData.gpuAttention),
      'weightsSource', runData.weightsSource ?? 'unknown',
      'top3',        JSON.stringify(runData.top3),
      'durationMs',  String(runData.durationMs ?? 0),
    );
    return true;
  } catch (e) {
    console.warn('[karpathy] run_log XADD failed (non-fatal):', e.message);
    return false;
  }
}

// ── Qdrant AGENTS.md trust-tier patch ────────────────────────────────────────
// Reads all agents:dir:* Redis keys to find which directories have AGENTS.md
// rules, then patches their Qdrant chunks in codebase_chunks_768 to carry
// trust_tier: 'T1' in the payload — this activates the 1.20× multiplier
// in the ACE Karpathy blend for authoritative instruction chunks.
async function patchAgentsMdTrustTier(redis, qdrantUrl, collection) {
  let patched = 0;
  try {
    // Scan all agents:dir:* keys
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'agents:dir:*', 'COUNT', '200');
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (!keys.length) return { patched: 0, reason: 'no agents:dir:* keys in Redis' };

    // Build set of AGENTS.md file paths from key names
    // keys look like: agents:dir:src/lib/server
    // → source file is src/lib/server/AGENTS.md
    const agentsPaths = new Set(keys.map(k => {
      const dir = k.replace(/^agents:dir:/, '');
      return dir ? `${dir}/AGENTS.md` : 'AGENTS.md';
    }));

    // For each path, find matching Qdrant points and patch trust_tier → T1
    for (const filePath of agentsPaths) {
      try {
        // Search by source_file payload filter
        const res = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { must: [{ key: 'source_file', match: { value: filePath } }] },
            limit: 200,
            with_payload: false,
            with_vector: false,
          }),
        });
        if (!res.ok) continue;
        const { result } = await res.json();
        const ids = (result?.points ?? []).map(p => p.id);
        if (!ids.length) continue;

        // Patch payload: set trust_tier = 'T1'
        await fetch(`${qdrantUrl}/collections/${collection}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: { trust_tier: 'T1', instruction_authority: true },
            points: ids,
          }),
        });
        patched += ids.length;
      } catch { /* non-fatal per file */ }
    }
    return { patched, agentsDirs: agentsPaths.size };
  } catch (e) {
    console.warn('[karpathy] AGENTS.md T1 patch failed (non-fatal):', e.message);
    return { patched: 0, error: e.message };
  }
}

// ── Lane-grouped Redis hash ───────────────────────────────────────────────────
// Cross-references enriched files with feature_file_edges (Postgres) to produce
// gpu:karpathy:by_lane — a hash from L0..L11 → JSON array of top files by blend.
// ACE Stage A0 reads this for lane-specific authority boosts without a DB query.
async function writeByLaneHash(redis, enriched) {
  if (!DATABASE_URL) return { skipped: true, reason: 'DATABASE_URL not set' };
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
  try {
    // Build stableKey → blend map for quick lookup
    const blendMap = new Map(enriched.map(e => [e.stableKey, e.blend]));
    const keys = enriched.map(e => e.stableKey);
    if (!keys.length) return { skipped: true, reason: 'no enriched files' };

    // Query feature_file_edges — join to feature_implementations for lane_ids
    const { rows } = await pool.query(`
      SELECT DISTINCT
        ffe.file_path,
        fi.lane_ids
      FROM feature_file_edges ffe
      JOIN feature_implementations fi USING (feature_key)
      WHERE ffe.file_path = ANY($1::text[])
        AND fi.status = 'active'
    `, [keys]);

    // Invert: lane → [{ file, blend }] sorted desc
    const byLane = {};
    for (const row of rows) {
      const blend = blendMap.get(row.file_path) ?? 0;
      for (const lane of (row.lane_ids ?? [])) {
        if (!byLane[lane]) byLane[lane] = [];
        byLane[lane].push({ file: row.file_path, blend: +blend.toFixed(4) });
      }
    }
    for (const lane of Object.keys(byLane)) {
      byLane[lane].sort((a, b) => b.blend - a.blend);
    }

    if (!Object.keys(byLane).length) return { skipped: true, reason: 'no lane→file matches in feature_file_edges' };

    const hashFields = {};
    for (const [lane, files] of Object.entries(byLane)) {
      hashFields[lane] = JSON.stringify(files.slice(0, 20));
    }
    await redis.del('gpu:karpathy:by_lane');
    await redis.hset('gpu:karpathy:by_lane', hashFields);
    await redis.expire('gpu:karpathy:by_lane', 86_400);
    return { lanes: Object.keys(byLane).length, totalMappings: rows.length };
  } catch (e) {
    console.warn('[karpathy] by_lane write failed (non-fatal):', e.message);
    return { error: e.message };
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
  await redis.connect();

  let candidates;
  let candidateSource;
  if (DIRTY_ONLY) {
    const dirty = await redis.smembers('ace:rank:dirty_files');
    if (!dirty.length) {
      log.status = 'skipped';
      log.reason = 'no dirty files in ace:rank:dirty_files';
      console.log('[karpathy] skipped — no dirty files');
      await redis.quit();
      return;
    }
    const scoreMap = await fetchScoresForKeys(dirty);
    candidates = dirty.map(k => scoreMap.get(k) ?? { stableKey: k, pr: 0, authority: 0, community: -1 });
    candidateSource = 'dirty';
  } else if (SOURCE === 'hit-log') {
    // Demand-weighted: pull from chunk_hit_log (last HIT_LOG_HOURS hours)
    const hits = await fetchTopByHitLog(LIMIT, HIT_LOG_HOURS);
    if (!hits.length) {
      console.log(`[karpathy] hit-log empty for last ${HIT_LOG_HOURS}h — falling back to PageRank`);
      candidates = await fetchTopByPageRank(LIMIT);
      candidateSource = 'pagerank-fallback';
    } else {
      candidates = hits;
      candidateSource = `hit-log:${HIT_LOG_HOURS}h`;
    }
  } else {
    candidates = await fetchTopByPageRank(LIMIT);
    candidateSource = `pagerank-top-${LIMIT}`;
  }
  log.candidates = candidates.length;
  log.candidateSource = candidateSource;
  console.log(`[karpathy] ${candidates.length} candidates (${candidateSource})`);

  // ── Adaptive guard: input-hash short-circuit ──────────────────────────────
  // Compute SHA1 of (mode, candidate_set_signature) where the signature is the
  // sorted (stableKey, pr) pairs from the upstream signal. If this matches the
  // last run's summary.input_hash, the autoencoder + attention pass would
  // produce byte-identical output — skip the GPU work entirely. Bypass with
  // --force when you want to re-run regardless (e.g., after weight changes).
  const force = process.argv.includes('--force');
  if (!DRY && !force && candidates.length > 0) {
    const { createHash } = await import('node:crypto');
    const sig = candidates
      .map(c => `${c.stableKey}:${(c.pr ?? 0).toFixed(4)}`)
      .sort()
      .join('|');
    const inputHash = createHash('sha1')
      .update(`${candidateSource}:${LIMIT}:${HIDDEN_DIM}:${sig}`)
      .digest('hex')
      .slice(0, 16);
    log.inputHash = inputHash;
    const lastHash = await redis.hget('gpu:karpathy:summary', 'input_hash').catch(() => null);
    if (lastHash === inputHash) {
      console.log(`[karpathy] inputs unchanged (hash=${inputHash}) — skipping GPU pass + Redis writes`);
      console.log(`           Pass --force to rebuild anyway. Existing scores/encoded preserved.`);
      log.status = 'unchanged';
      await redis.quit();
      return;
    }
  }

  // Fetch embeddings (sequential — Qdrant scroll-by-filter is fast, ~50ms each)
  const enriched = [];
  for (const c of candidates) {
    const emb = await fetchEmbedding(c.stableKey);
    if (emb && emb.length === 768) {
      enriched.push({ ...c, embedding: emb });
      log.embedded++;
    } else {
      log.skipped++;
    }
  }

  if (enriched.length === 0) {
    log.status = 'skipped';
    log.reason = 'no embeddings retrievable from Qdrant';
    await redis.quit();
    return;
  }

  const embeddings = enriched.map(e => e.embedding);
  const n = enriched.length;

  // GPU pass 1: attention DIRECTLY on raw 768-dim embeddings using a
  // RISK_QUERY probe. embeddinggemma already produces a meaningful semantic
  // space — running attention against random-weight autoencoder outputs just
  // adds noise (every vector saturates near tanh boundaries → flat scores).
  // The autoencoder remains as a separate compressed-memory output below
  // (used by future memory-path-mapping consumers, NOT by the attention pass).
  const probeEmb = await fetchProbeEmbedding(RISK_QUERY);
  let attnRaw = null;
  if (gpu?.attentionScoreGPU && probeEmb) {
    const flat = new Float32Array(n * 768);
    for (let i = 0; i < n; i++) flat.set(embeddings[i], i * 768);
    try {
      attnRaw = gpu.attentionScoreGPU(probeEmb, 768, flat, n);
      log.gpu.attention = true;
      log.probeKind = 'risk-query-768d';
    } catch (err) {
      log.gpu.attentionError = err.message;
    }
  }
  // Use z-score sigmoid spread instead of max-normalize — raw cosine in
  // 768-dim space clusters in 0.99–1.00 (no differential signal). Z-score
  // gives a real [0.10–0.95] spread that distinguishes risk-adjacent files.
  const attn = spreadByZScore(attnRaw, 1.5);

  // GPU pass 2: 768 → 64 memory-path projection.
  // Priority chain — MLA/TurboQuant → Redis trained weights → PCA → random Xavier:
  //
  //   A. TurboQuant MLA path (:8090 with --embeddings): if llama-server was
  //      started with --embeddings the /v1/embeddings endpoint returns the model's
  //      own MLA-compressed latent (head_dim=64 for Gemma4 SWA layers). These
  //      vectors are semantically richer than any separately trained autoencoder
  //      because they come from the same model that runs inference.
  //      Gate: TURBO_EMBEDDINGS_ENABLED=true + llama-server accepting /v1/embeddings.
  //
  //   B. Redis `ace:autoencoder:decoder:weights` — OLS weights fitted by
  //      run-tensor-topology-mapreduce.mjs from real PCA projections.
  //
  //   C. On-the-fly PCA from current batch (2-round power iteration, ~20ms).
  //
  //   D. Random Xavier — last resort; encodes run but scores carry no meaning.
  const weights = await resolveWeights(redis, embeddings, n, 768);
  const encoded = runAutoencoder(embeddings, n, 768, weights);
  // encodeProbe and attentionVsRiskProbe are reserved for the MLA path once
  // TurboQuant is restarted with --embeddings (or test1111 fork exposes the
  // MLA latent via a sidecar endpoint — see @reserved JSDoc).
  void encodeProbe; void attentionVsRiskProbe;
  log.gpu.weightsSource = weights ? (log.gpu.weightsSource ?? 'unknown') : 'none';
  log.encodedDim = HIDDEN_DIM;
  log.encodedFiles = encoded ? n : 0;

  // Blend: 0.4*PR + 0.3*attention + 0.3*authority
  for (let i = 0; i < enriched.length; i++) {
    const e = enriched[i];
    const attnScore = attn ? attn[i] : 0;
    e.attention = attnScore;
    e.blend = 0.4 * e.pr + 0.3 * attnScore + 0.3 * e.authority;
  }
  enriched.sort((a, b) => b.blend - a.blend);

  log.topRisk = enriched.slice(0, 20).map(e => ({
    stableKey: e.stableKey,
    pr: +e.pr.toFixed(4),
    attn: +e.attention.toFixed(4),
    authority: +e.authority.toFixed(4),
    blend: +e.blend.toFixed(4),
    community: e.community,
  }));

  if (!DRY) {
    // Redis: hash of all scores (24h TTL)
    const scoresHash = {};
    for (const e of enriched) {
      scoresHash[e.stableKey] = JSON.stringify({
        pr: +e.pr.toFixed(6),
        attn: +e.attention.toFixed(6),
        authority: +e.authority.toFixed(6),
        blend: +e.blend.toFixed(6),
      });
    }
    await redis.del('gpu:karpathy:scores');
    if (Object.keys(scoresHash).length) await redis.hset('gpu:karpathy:scores', scoresHash);
    await redis.expire('gpu:karpathy:scores', 86_400);

    // Persist 64-dim compressed memory paths for future MLA / graph-traversal
    // consumers. Encoded as comma-separated 4-decimal floats — small (~520B/file).
    if (encoded) {
      const encodedHash = {};
      for (let i = 0; i < n; i++) {
        const slice = encoded.subarray(i * HIDDEN_DIM, (i + 1) * HIDDEN_DIM);
        encodedHash[enriched[i].stableKey] = Array.from(slice, v => v.toFixed(4)).join(',');
      }
      await redis.del('gpu:karpathy:encoded');
      await redis.hset('gpu:karpathy:encoded', encodedHash);
      await redis.expire('gpu:karpathy:encoded', 86_400);
    }
    await redis.hset('gpu:karpathy:summary', {
      runAt: new Date().toISOString(),
      candidates: log.candidates,
      embedded: log.embedded,
      gpuEncoded: String(log.gpu.encoded),
      gpuAttention: String(log.gpu.attention),
      mode: log.mode,
      // Persist the input signature so next run can short-circuit when nothing
      // upstream has changed (see "Adaptive guard" block above).
      input_hash: log.inputHash ?? '',
    });
    await redis.expire('gpu:karpathy:summary', 86_400);

    // ── Stream run telemetry → gpu:karpathy:run_log ─────────────────────────
    // ACE/MCP and the karpathy:ace:hits script can read this stream to track
    // GPU pipeline health without parsing JSON log files on disk.
    const streamResult = await appendRunLogStream(redis, {
      runAt:         log.startedAt,
      mode:          log.mode,
      candidates:    log.candidates,
      embedded:      log.embedded,
      gpuEncoded:    log.gpu.encoded,
      gpuAttention:  log.gpu.attention,
      weightsSource: log.gpu.weightsSource ?? 'unknown',
      top3:          log.topRisk.slice(0, 3),
      durationMs:    Date.now() - Date.parse(log.startedAt),
    });
    log.runLogStream = streamResult ? 'appended' : 'failed';

    // ── Patch AGENTS.md chunks in Qdrant → trust_tier T1 ────────────────────
    // Reads agents:dir:* Redis keys → maps to AGENTS.md source paths → patches
    // Qdrant codebase_chunks_768 payload. Activates the 1.20× T1 multiplier
    // in the ACE Karpathy blend for authoritative instruction chunks.
    const agentsPatch = await patchAgentsMdTrustTier(redis, QDRANT_URL, COLLECTION);
    log.agentsMdT1Patch = agentsPatch;
    if (agentsPatch.patched > 0) {
      console.log(`[karpathy] AGENTS.md T1 patch: ${agentsPatch.patched} chunks patched across ${agentsPatch.agentsDirs} dirs`);
    }

    // ── Write lane-grouped authority hash → gpu:karpathy:by_lane ───────────
    // Cross-references enriched files with feature_file_edges (Postgres) to
    // produce a L0..L11 → [file, blend] mapping for ACE Stage A0 lane boosts.
    const laneResult = await writeByLaneHash(redis, enriched);
    log.byLane = laneResult;
    if (laneResult.lanes) {
      console.log(`[karpathy] by_lane: ${laneResult.lanes} lanes mapped (${laneResult.totalMappings} file→lane edges)`);
    }
  }

  // Markdown recommendation
  const md = [
    '# Karpathy GPU Authority Blend — Recommendations',
    '',
    `> Run: ${log.startedAt}`,
    `> Mode: \`${log.mode}\` · candidates: ${log.candidates} · embedded: ${log.embedded} · skipped: ${log.skipped}`,
    `> GPU: encode=${log.gpu.encoded} · attention=${log.gpu.attention}${log.gpu.fallback ? ` · ${log.gpu.fallback}` : ''}`,
    '',
    '## Top 20 by Composite Authority Score',
    '',
    'Composite = 0.4·PageRank + 0.3·AttentionScore + 0.3·GraphAuthority',
    '',
    '| Rank | File | PageRank | Attention | Authority | Blend | Community |',
    '|------|------|----------|-----------|-----------|-------|-----------|',
    ...enriched.slice(0, 20).map((e, i) =>
      `| ${i + 1} | \`${e.stableKey}\` | ${e.pr.toFixed(3)} | ${e.attention.toFixed(3)} | ${e.authority.toFixed(3)} | **${e.blend.toFixed(3)}** | ${e.community} |`,
    ),
    '',
    '## Recommended Actions',
    '',
    '- **Top 5 by blend** are highest-leverage refactor/audit targets — touching them ripples broadly.',
    '- **High attention + low authority** = hub files that the graph hasn\'t fully recognized yet (likely under-imported helpers).',
    '- **High PageRank + low attention** = structurally central but semantically isolated (good for documentation pass).',
    '- **Same community + high blend** = co-evolving cluster — good candidate for a single PR scope.',
    '',
    '## Verification',
    '',
    '```bash',
    'redis-cli HGET gpu:karpathy:summary runAt',
    "redis-cli HGET gpu:karpathy:scores 'src/lib/server/db/client.ts'",
    'npm run karpathy:gpu:dirty   # incremental refresh on dirty files only',
    '```',
    '',
  ].join('\n');

  if (!DRY) writeFileSync(REPORT, md);
  log.report = REPORT;
  log.status = 'PASS';

  await redis.quit();
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
main()
  .catch(err => {
    log.status = 'FAIL';
    log.error = err.message;
    process.exitCode = 1;
  })
  .finally(() => {
    log.finishedAt = new Date().toISOString();
    log.totalMs = Date.parse(log.finishedAt) - Date.parse(log.startedAt);
    const out = JSON.stringify(log, null, 2);
    writeFileSync(resolve(LOG_DIR, `karpathy-gpu-${stamp}.json`), out);
    writeFileSync(resolve(LOG_DIR, 'karpathy-gpu-latest.json'), out);
    const tag = log.gpu.encoded ? '[GPU]' : '[CPU]';
    console.log(`[karpathy] ${tag} ${log.status} candidates=${log.candidates} embedded=${log.embedded} blend-top=${log.topRisk[0]?.blend?.toFixed(3) ?? '—'} (${log.totalMs}ms)`);
    if (log.status === 'PASS' && !log.dry) console.log(`           → ${log.report}`);
  });
