#!/usr/bin/env node
/**
 * karpathy-gpu-enrich.mjs
 *
 * GPU-accelerated authority blend: takes top-N nodes (or dirty files from
 * the incremental startup queue), runs them through three native CUDA passes
 * via tensorrt_bridge.node, blends the scores, writes results to Redis and
 * a markdown recommendation report.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// ── Canonical source-ref helper ──────────────────────────────────────────────
const _canonicalHelperPath = resolve(dirname(fileURLToPath(import.meta.url)), '../lib/canonical-source-ref.mjs');
const { normalizeSourceRef: _canonNorm, sourceRefVariants: _canonVariants } =
  await import(pathToFileURL(_canonicalHelperPath).href);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../sveltekit-frontend');
const REPO = resolve(ROOT, '..');
const esmRequire = createRequire(import.meta.url);

function computeKarpathyBlend(pr, authority, attention) {
  return (pr * 0.4) + (authority * 0.3) + (attention * 0.3);
}

function cosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length !== v2.length || v1.length === 0) return 0;
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

function computeAttentionScore(vector, queryVector) {
  const cosine = cosineSimilarity(vector, queryVector);
  return Math.max(0, Math.min(1, (cosine + 1) / 2));
}

function computeAttentionScoresGpu(queryVector, corpusVectors, dim) {
  if (!gpu || typeof gpu.attentionScoreGPU_fp16 !== 'function') return null;
  if (!(queryVector instanceof Float32Array) || !(corpusVectors instanceof Float32Array)) return null;
  if (dim <= 0 || corpusVectors.length % dim !== 0) return null;
  const n = corpusVectors.length / dim;
  try {
    const scores = gpu.attentionScoreGPU_fp16(queryVector, dim, corpusVectors, n);
    if (scores && typeof scores.length === 'number') {
      return Array.from(scores);
    }
  } catch (err) {
    console.warn(`[karpathy] GPU attention fallback: ${err.message}`);
  }
  return null;
}

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
// FP16 is the default when the GPU addon supports it; --fp32 forces CPU path
const FORCE_FP32 = args.includes('--fp32');
const ENABLE_FP16 = !FORCE_FP32; // auto-enabled; was --fp16 flag (H4)
const COMPARE_FP32 = args.includes('--compare-fp32');
const DIRTY_ONLY = args.includes('--dirty');
const SOURCE     = args.find(a => a.startsWith('--source='))?.split('=')[1]
                 ?? (args.includes('--source') ? args[args.indexOf('--source') + 1] : null);
const FORCE      = args.includes('--force');
const HIT_LOG_HOURS = parseInt(
  args.find(a => a.startsWith('--hours='))?.split('=')[1] ?? '24', 10) || 24;
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 200;

// ── Config ────────────────────────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const NEO4J_URL = process.env.NEO4J_HTTP_URL ?? (process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'http://localhost:7474').replace(/^bolt:\/\/|^neo4j:\/\//, 'http://').replace(':7687', ':7474');
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const REDIS_URL    = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS   = process.env.REDIS_PASSWORD ?? 'redis';
const DATABASE_URL = process.env.DATABASE_URL;
const KARPATHY_TTL = Number(process.env.KARPATHY_REDIS_TTL ?? 7 * 24 * 3600); // 7d default

// ── Shared Path Helpers ───────────────────────────────────────────────────────

/** 
 * Idempotent normalization of repo paths.
 * Strips absolute path prefixes and workspaces case-insensitively.
 */
function normalizeRepoPath(value) {
  if (!value || typeof value !== 'string') return null;
  let path = value.trim();
  path = path.replaceAll('\\', '/');
  path = path.replace(/^file:/, '');
  path = path.replace(/^stable:/, '');
  path = path.replace(/^\.\/+/, '');
  
  // Strip absolute path prefixes case-insensitively
  const lower = path.toLowerCase();
  const deedsPattern = 'deeds-web-app/';
  const sveltePattern = 'sveltekit-frontend/';
  
  const deedsIdx = lower.lastIndexOf(deedsPattern);
  if (deedsIdx !== -1) {
    path = path.slice(deedsIdx + deedsPattern.length);
  }
  const svelteIdx = path.toLowerCase().lastIndexOf(sveltePattern);
  if (svelteIdx !== -1) {
    path = path.slice(svelteIdx + sveltePattern.length);
  }

  // Remove repo/workspace prefixes only if present at the start.
  path = path.replace(/^deeds-web-app\//, '');
  path = path.replace(/^sveltekit-frontend\//, '');
  // Remove duplicate slashes.
  path = path.replace(/\/+/g, '/');
  return path || null;
}

function getPayloadPath(payload = {}) {
  return (
    payload.file_path ??
    payload.filePath ??
    payload.relativePath ??
    payload.relative_path ??
    payload.path ??
    payload.source_path ??
    payload.source ??
    payload.file ??
    payload.filepath ??
    payload.stable_key ??
    payload.stableKey ??
    null
  );
}

function getNeo4jPath(record = {}) {
  return (
    record.file_path ??
    record.filePath ??
    record.relativePath ??
    record.relative_path ??
    record.path ??
    record.stable_key ??
    record.stableKey ??
    record.id ??
    null
  );
}

function qdrantPathVariants(path) {
  const normalized = normalizeRepoPath(path);
  if (!normalized) return [];
  // Use canonical helper variants + legacy repo-prefixed forms for completeness.
  const canonicalVariants = _canonVariants(normalized);
  return [...new Set([
    ...canonicalVariants,
    `deeds-web-app/${normalized}`,
    `deeds-web-app/sveltekit-frontend/${normalized}`,
  ])];
}

const LOG_DIR = resolve(ROOT, 'logs/task-output/pipeline-test');
const REPORT = resolve(REPO, 'sveltekit-frontend/next_steps/active/karpathy-gpu-recommendations.md');
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(dirname(REPORT), { recursive: true });

const log_state = {
  startedAt: new Date().toISOString(),
  mode: DIRTY_ONLY ? 'dirty' : (SOURCE === 'hit-log' ? 'hit-log' : 'topN'),
  limit: LIMIT,
  dry: DRY,
  fp16: ENABLE_FP16 ? 'auto' : 'disabled(--fp32)',
  compareFp32: COMPARE_FP32,
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
  const envPaths = [
    process.env.TENSORRT_BRIDGE_NODE,
  ].filter((value) => typeof value === 'string' && value.length > 0);
  const paths = [
    resolve(REPO, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    resolve(REPO, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    resolve(REPO, 'simd-bridge/cpp/build/tensorrt_bridge.node'),
  ];
  for (const p of [...envPaths, ...paths]) {
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
  log_state.gpu.fallback = 'tensorrt_bridge.node not loadable — running in CPU/no-GPU degraded mode';
  console.warn('[karpathy] ' + log_state.gpu.fallback);
} else {
  // CUDA pre-flight — log GPU lane so pipeline logs are self-documenting
  const cudaLevel = typeof gpu.checkCudaAvailable === 'function' ? gpu.checkCudaAvailable() : -1;
  const gpuLane = cudaLevel === 2 ? 'CUDA+cuDNN' : cudaLevel === 1 ? 'CUDA' : cudaLevel === 0 ? 'no-GPU' : 'unknown';
  const fp16Ready = typeof gpu.attentionScoreGPU_fp16 === 'function';
  console.log(`[karpathy] GPU lane: ${gpuLane} | fp16-attention: ${fp16Ready} | fp16-mode: ${ENABLE_FP16 ? 'auto' : 'disabled(--fp32)'}`);
  log_state.gpu.cudaLevel = cudaLevel;
  log_state.gpu.fp16Ready = fp16Ready;
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
  if (!res.ok) throw new Error(`Neo4j ${res.status}`);
  const d = await res.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.results[0]?.data ?? [];
}

// Path prefixes that are noise — backup archives, venvs, generated reports.
// These inflate PageRank (many cross-references inside backup dirs) but add
// no signal to the authority blend.
const NOISE_PATH_PREFIXES = [
  'scripts/api-cleanup/',
  'scripts/tests/backup',
  '.venv/',
  'node_modules/',
  'deeds_labs/',
  'scratch/',
  'logs/',
  'reports/backup',
];

function isNoisePath(filePath) {
  if (!filePath) return true;
  const norm = normalizeRepoPath(filePath) ?? filePath;
  return NOISE_PATH_PREFIXES.some(p => norm.startsWith(p) || norm.includes('/' + p));
}

async function fetchTopByPageRank(limit) {
  const rows = await neo4jQuery(
    `MATCH (n:CodebaseFile) WHERE n.graphPageRank IS NOT NULL
       AND n.filePath IS NOT NULL
       AND NOT n.filePath CONTAINS 'api-cleanup'
       AND NOT n.filePath CONTAINS '.venv'
       AND NOT n.filePath CONTAINS 'node_modules'
       AND NOT n.filePath CONTAINS 'deeds_labs'
       AND NOT n.filePath CONTAINS '/backup'
       AND NOT n.filePath CONTAINS 'scratch/'
     RETURN coalesce(n.stableKey, n.filePath, n.relativePath) AS stableKey,
            n.graphPageRank AS pr,
            coalesce(n.graphAuthorityScore, 0) AS authority,
            coalesce(n.communityId, -1) AS community,
            n.filePath AS filePath,
            n.id AS neo4jId
     ORDER BY pr DESC LIMIT $limit`,
    { limit: limit * 2 }, // Fetch more for dedupe
  );
  
  const results = rows.map(r => ({
    stableKey: r.row?.[0],
    pr: r.row?.[1] ?? 0,
    authority: r.row?.[2] ?? 0,
    community: r.row?.[3] ?? -1,
    filePath: r.row?.[4],
    neo4jId: r.row?.[5],
  })).filter(r => r.stableKey);

  // Deduplication: Max files per directory and max per community (cluster)
  const dirCounts = new Map();
  const communityCounts = new Map();
  const deduped = [];

  const MAX_FILES_PER_DIR = 15;
  const MAX_PER_COMMUNITY = 30;

  for (const item of results) {
    if (isNoisePath(item.stableKey)) continue; // JS-side guard for anything Cypher missed
    const dir = dirname(normalizeRepoPath(item.stableKey) || '');
    const dirCount = dirCounts.get(dir) || 0;
    const commCount = communityCounts.get(item.community) || 0;

    if (dirCount < MAX_FILES_PER_DIR && commCount < MAX_PER_COMMUNITY) {
      dirCounts.set(dir, dirCount + 1);
      communityCounts.set(item.community, commCount + 1);
      deduped.push(item);
    }
    if (deduped.length >= limit) break;
  }

  return deduped;
}

// ── Qdrant ────────────────────────────────────────────────────────────────────

const QDRANT_BATCH_SIZE = 25;

// Phase B: path→cluster reverse index built during Qdrant scroll
const _pathToCluster = new Map(); // stableKey → clusterKey

// matched_by map: canonical path → which Qdrant payload field matched
const _matchedByField = new Map();

async function fetchEmbeddingsBatch(filePaths) {
  const result = new Map();
  if (!filePaths.length) return result;

  for (let i = 0; i < filePaths.length; i += QDRANT_BATCH_SIZE) {
    const chunk = filePaths.slice(i, i + QDRANT_BATCH_SIZE);
    try {
      const allVariants = chunk.flatMap(fp => qdrantPathVariants(fp));
      const filterKeys = ['file_path', 'filePath', 'relativePath', 'relative_path', 'path', 'stable_key', 'stableKey', 'sourceRef'];
      const should = filterKeys.map(k => ({
        key: k,
        match: { any: allVariants }
      }));

      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: { should },
          limit: chunk.length * 10,
          with_vector: true,
          with_payload: true,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) continue;
      const raw = await res.text();
      const data = (gpu && typeof gpu.simdJsonParse === 'function')
        ? JSON.parse(gpu.simdJsonParse(raw))
        : JSON.parse(raw);
      for (const pt of (data.result?.points ?? [])) {
        const rawFp = getPayloadPath(pt.payload);
        const fp = normalizeRepoPath(rawFp);
        if (!fp) continue;
        const vec = pt.vector?.content ?? pt.vector;
        if (Array.isArray(vec) && vec.length === 768) {
          if (!result.has(fp)) {
            result.set(fp, new Float32Array(vec));
            // Record which payload field was the match source
            const matchedField = filterKeys.find(k => pt.payload?.[k] != null) ?? 'unknown';
            _matchedByField.set(fp, matchedField);
          }
        }
        // Phase B: capture cluster_key from payload for reverse index
        const ck = pt.payload?.cluster_key ?? pt.payload?.clusterId ?? pt.payload?.cluster_id;
        if (ck && !_pathToCluster.has(fp)) _pathToCluster.set(fp, String(ck));
      }
    } catch (err) {
      console.warn(`[karpathy] Qdrant batch error: ${err.message}`);
    }
  }
  return result;
}

// ── Probe ────────────────────────────────────────────────────────────────────

const PROBE_CACHE_KEY = 'ace:probe:embed:karpathy';

async function fetchProbeEmbedding(query, redisClient) {
  // Check Redis cache first — avoids Ollama call on every karpathy run (24h TTL)
  if (redisClient) {
    try {
      const cached = await redisClient.get(PROBE_CACHE_KEY);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length > 0) {
          console.log(`[karpathy] Probe embedding: Redis cache hit (${arr.length}-dim)`);
          return new Float32Array(arr);
        }
      }
    } catch { /* ignore redis errors */ }
  }

  const sveltekitUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:5173';
  try {
    const res = await fetch(`${sveltekitUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const raw = await res.text();
      const d = (gpu && typeof gpu.simdJsonParse === 'function')
        ? JSON.parse(gpu.simdJsonParse(raw))
        : JSON.parse(raw);
      if (d.embedding) {
        if (redisClient) {
          redisClient.set(PROBE_CACHE_KEY, JSON.stringify(Array.from(d.embedding)), 'EX', 86400).catch(() => {});
        }
        return new Float32Array(d.embedding);
      }
    }
  } catch (err) {
    console.warn(`[karpathy] SvelteKit probe failed, attempting direct Ollama fallback: ${err.message}`);
  }

  // Direct Ollama fallback
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const embedModel = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
    console.log(`[karpathy] Querying Ollama fallback: ${ollamaUrl}/api/embeddings with model ${embedModel}`);
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embedModel, prompt: query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Ollama response error: ${res.status}`);
    const raw = await res.text();
    const d = (gpu && typeof gpu.simdJsonParse === 'function')
      ? JSON.parse(gpu.simdJsonParse(raw))
      : JSON.parse(raw);
    if (d.embedding) {
      if (redisClient) {
        redisClient.set(PROBE_CACHE_KEY, JSON.stringify(Array.from(d.embedding)), 'EX', 86400).catch(() => {});
      }
      return new Float32Array(d.embedding);
    }
    return null;
  } catch (err) {
    console.warn(`[karpathy] Ollama fallback probe error: ${err.message}`);
    return null;
  }
}

// ── Math ─────────────────────────────────────────────────────────────────────

/**
 * Computes PCA projection weights using Power Iteration with Deflation.
 * Centered embeddings are projected to outDim principal components.
 * O(N * inDim * outDim) time complexity, highly stable and fast.
 */
function pcaWeights(embeddings, n, inDim, outDim) {
  if (n === 0 || !embeddings || embeddings.length === 0) {
    return new Float32Array(inDim * outDim).fill(0.01);
  }

  const embs = Array.from(embeddings);
  const N = embs.length;

  // 1. Compute the mean vector
  const mean = new Float32Array(inDim);
  for (let i = 0; i < N; i++) {
    const vec = embs[i];
    for (let d = 0; d < inDim; d++) {
      mean[d] += vec[d];
    }
  }
  for (let d = 0; d < inDim; d++) {
    mean[d] /= N;
  }

  // 2. Center the dataset
  const centered = [];
  for (let i = 0; i < N; i++) {
    const vec = embs[i];
    const cVec = new Float32Array(inDim);
    for (let d = 0; d < inDim; d++) {
      cVec[d] = vec[d] - mean[d];
    }
    centered.push(cVec);
  }

  // 3. Power Iteration with Deflation to find outDim principal components
  const W = new Float32Array(inDim * outDim);

  for (let j = 0; j < outDim; j++) {
    // Initialize a random unit vector for the j-th principal component
    let v = new Float32Array(inDim);
    let norm = 0;
    for (let d = 0; d < inDim; d++) {
      v[d] = Math.random() * 2 - 1;
      norm += v[d] * v[d];
    }
    norm = Math.sqrt(norm) || 1e-12;
    for (let d = 0; d < inDim; d++) {
      v[d] /= norm;
    }

    // Power iterations (15 steps is extremely accurate)
    const maxIters = 15;
    for (let iter = 0; iter < maxIters; iter++) {
      // Compute u = C * v = (1 / N) * X^T * (X * v)
      const y = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let dot = 0;
        const cVec = centered[i];
        for (let d = 0; d < inDim; d++) {
          dot += cVec[d] * v[d];
        }
        y[i] = dot;
      }

      const u = new Float32Array(inDim);
      for (let i = 0; i < N; i++) {
        const cVec = centered[i];
        const val = y[i];
        for (let d = 0; d < inDim; d++) {
          u[d] += cVec[d] * val;
        }
      }

      let uNorm = 0;
      for (let d = 0; d < inDim; d++) {
        uNorm += u[d] * u[d];
      }
      uNorm = Math.sqrt(uNorm) || 1e-12;
      for (let d = 0; d < inDim; d++) {
        v[d] = u[d] / uNorm;
      }
    }

    // Deflate the dataset
    for (let i = 0; i < N; i++) {
      let dot = 0;
      const cVec = centered[i];
      for (let d = 0; d < inDim; d++) {
        dot += cVec[d] * v[d];
      }
      for (let d = 0; d < inDim; d++) {
        cVec[d] -= dot * v[d];
      }
    }

    // Store in flat row-major matrix: j-th principal component at row j
    for (let d = 0; d < inDim; d++) {
      W[j * inDim + d] = v[d];
    }
  }

  return W;
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

// ── Logic ─────────────────────────────────────────────────────────────────────

async function main() {
  // Self-test
  const variants = [
    'src/lib/server/db/connections.ts',
    'sveltekit-frontend/src/lib/server/db/connections.ts',
    './src/lib/server/db/connections.ts',
    'src\\lib\\server\\db\\connections.ts',
    'file:src/lib/server/db/connections.ts',
    'stable:src/lib/server/db/connections.ts',
  ];
  for (const v of variants) {
    const norm = normalizeRepoPath(v);
    if (norm !== 'src/lib/server/db/connections.ts') {
      throw new Error(`Self-test failed for ${v}: expected src/lib/server/db/connections.ts, got ${norm}`);
    }
  }
  console.log('[karpathy] ✓ Path resolution self-test passed');

  let candidates = [];
  candidates = await fetchTopByPageRank(LIMIT);
  log_state.candidates = candidates.length;
  if (!candidates.length) return;

  console.log(`[karpathy] ${candidates.length} candidates (pagerank-top-${LIMIT})`);

  // Path Audit
  console.log('[path-audit:neo4j-top-pagerank-before-qdrant] sample=10');
  for (const c of candidates.slice(0, 10)) {
    console.log('[path-audit:item]', {
      raw: c.stableKey,
      normalized: normalizeRepoPath(c.stableKey),
      variants: qdrantPathVariants(c.stableKey)
    });
  }

  const embeddingMap = await fetchEmbeddingsBatch(candidates.map(c => c.stableKey));
  console.log(`[karpathy] Qdrant batch: ${embeddingMap.size} hits`);

  if (embeddingMap.size === 0) {
    console.warn('[karpathy] No embeddings found in Qdrant.');
  }

  // Write miss report — files that had no Qdrant embedding hit.
  const MISS_REPORT = resolve(REPO, 'memory/exports/karpathy-qdrant-misses.jsonl');
  mkdirSync(dirname(MISS_REPORT), { recursive: true });
  const missLines = [];
  for (const c of candidates) {
    const normKey = normalizeRepoPath(c.stableKey);
    if (!normKey || embeddingMap.has(normKey)) continue;
    missLines.push(JSON.stringify({
      ts: new Date().toISOString(),
      stableKey: c.stableKey,
      normKey,
      variants: qdrantPathVariants(c.stableKey),
      pr: c.pr,
    }));
  }
  if (missLines.length > 0) {
    writeFileSync(MISS_REPORT, missLines.join('\n') + '\n');
    console.log(`[karpathy] Miss report: ${missLines.length} misses → ${MISS_REPORT}`);
  }

  // Log matched_by field distribution
  const matchedByDist = {};
  for (const field of _matchedByField.values()) {
    matchedByDist[field] = (matchedByDist[field] ?? 0) + 1;
  }
  if (Object.keys(matchedByDist).length > 0) {
    console.log('[karpathy] Qdrant matched_by field distribution:', matchedByDist);
  }

  // Shared Redis client for probe cache + later score writes
  let _earlyRedis = null;
  if (!DRY) {
    try {
      _earlyRedis = new Redis(REDIS_URL, {
        password: REDIS_PASS || undefined,
        lazyConnect: true, maxRetriesPerRequest: 1,
        enableOfflineQueue: false, retryStrategy: () => null,
      });
      _earlyRedis.on('error', () => {});
      await _earlyRedis.connect().catch(() => {});
    } catch { _earlyRedis = null; }
  }

  const probe = await fetchProbeEmbedding('risk vulnerability security architecture', _earlyRedis);

  const attentionCorpus = new Float32Array(candidates.length * (probe?.length ?? 0));
  const attentionDim = probe?.length ?? 0;
  const candidateVectorByIndex = candidates.map(c => {
    const emb = embeddingMap.get(normalizeRepoPath(c.stableKey));
    return emb && attentionDim > 0 ? emb : null;
  });
  let cpuAttentionScores = null;
  let gpuAttentionScores = null;
  if (probe && attentionDim > 0) {
    for (let i = 0; i < candidateVectorByIndex.length; i++) {
      const vec = candidateVectorByIndex[i];
      if (vec) attentionCorpus.set(vec, i * attentionDim);
    }
    if (COMPARE_FP32) {
      cpuAttentionScores = candidateVectorByIndex.map((vec) => (
        vec ? computeAttentionScore(vec, probe) : 0
      ));
    }
    if (ENABLE_FP16 && gpu && typeof gpu.attentionScoreGPU_fp16 === 'function') {
      gpuAttentionScores = computeAttentionScoresGpu(probe, attentionCorpus, attentionDim);
      if (!gpuAttentionScores) {
        // addon present but call failed — already warned inside computeAttentionScoresGpu
        console.warn('[karpathy] FP16 attention unavailable, using CPU scores');
      }
    }
  }
  const runAttentionPeak = gpuAttentionScores && gpuAttentionScores.length
    ? Math.max(...gpuAttentionScores)
    : 0;
  const runAttentionMean = gpuAttentionScores && gpuAttentionScores.length
    ? gpuAttentionScores.reduce((sum, value) => sum + value, 0) / gpuAttentionScores.length
    : 0;

  // Min-max normalize pr and authority across this candidate batch so neither
  // raw scale dominates the blend. PageRank ~0-7, authority ~0-12749 — without
  // normalization the authority term swamps the 0.4·PR + 0.3·attention terms.
  const prValues = candidates.map(c => c.pr);
  const authValues = candidates.map(c => c.authority);
  const prMin = Math.min(...prValues);
  const prMax = Math.max(...prValues);
  const authMin = Math.min(...authValues);
  const authMax = Math.max(...authValues);
  const prRange = prMax - prMin || 1;
  const authRange = authMax - authMin || 1;

  const finalResults = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const emb = embeddingMap.get(normalizeRepoPath(c.stableKey));
    let attention = 0;
    const attentionCpu = cpuAttentionScores?.[i] ?? (probe && emb ? computeAttentionScore(emb, probe) : 0);
    const attentionGpu = gpuAttentionScores?.[i] ?? null;
    if (probe && emb) {
      if (attentionGpu !== null && typeof attentionGpu === 'number') {
        attention = attentionGpu;
      } else {
        attention = attentionCpu;
      }
    }

    const prNorm = (c.pr - prMin) / prRange;
    const authNorm = (c.authority - authMin) / authRange;
    const blend = computeKarpathyBlend(prNorm, authNorm, attention);
    finalResults.push({
      ...c,
      stableKey: _canonNorm(c.stableKey) ?? normalizeRepoPath(c.stableKey) ?? c.stableKey,
      attention,
      attentionCpu,
      attentionGpu,
      attentionDelta: attentionGpu !== null ? attentionGpu - attentionCpu : 0,
      attentionPeak: runAttentionPeak,
      attentionMean: runAttentionMean,
      blend,
      matched_by: _matchedByField.get(normalizeRepoPath(c.stableKey)) ?? null,
    });
  }

  finalResults.sort((a, b) => b.blend - a.blend);
  log_state.topRisk = finalResults.slice(0, 10);

  // ── H6: Autoencoder 768→64 encode pass ──────────────────────────────────────
  // Compress each file's 768-dim embedding to 64-dim via the trained autoencoder
  // weights stored at ace:autoencoder:weights in Redis. The 64-dim vectors are
  // written to gpu:karpathy:encoded for engram L1 KV cache consumers.
  // Architecture: 768 → tanh(W1·x + b1) [256-dim] → tanh(W2·h + b2) [64-dim]
  const encodedMap = new Map(); // stableKey → Float32Array(64)
  if (!DRY) {
    try {
      const weightRedis = new Redis(REDIS_URL, { password: REDIS_PASS || undefined });
      const [wData, mData] = await Promise.all([
        weightRedis.hgetall('ace:autoencoder:weights'),
        weightRedis.hgetall('ace:autoencoder:meta'),
      ]);
      await weightRedis.quit();

      if (wData?.W1 && wData?.b1 && wData?.W2 && wData?.b2) {
        const parseW = csv => new Float32Array(csv.split(',').map(Number));
        const W1 = parseW(wData.W1); // [256 × 768]
        const b1 = parseW(wData.b1); // [256]
        const W2 = parseW(wData.W2); // [64 × 256]
        const b2 = parseW(wData.b2); // [64]

        // CPU linear encode: tanh(X @ W^T + b)
        function cpuLinearTanh(X, n, inDim, W, b, outDim) {
          const out = new Float32Array(n * outDim);
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < outDim; j++) {
              let v = b[j];
              for (let k = 0; k < inDim; k++) v += X[i * inDim + k] * W[j * inDim + k];
              out[i * outDim + j] = Math.tanh(v);
            }
          }
          return out;
        }

        // GPU encode via addon if available (autoencoderEncode)
        const gpuEncode = (gpu && typeof gpu.autoencoderEncode === 'function')
          ? (X, n, inDim, W, b, outDim) => {
              try { return gpu.autoencoderEncode(X, n, inDim, W, b, outDim); }
              catch { return cpuLinearTanh(X, n, inDim, W, b, outDim); }
            }
          : cpuLinearTanh;

        const filesWithEmbeddings = finalResults.filter(r => embeddingMap.has(normalizeRepoPath(r.stableKey)));
        if (filesWithEmbeddings.length > 0) {
          const N = filesWithEmbeddings.length;
          const flat768 = new Float32Array(N * 768);
          for (let i = 0; i < N; i++) {
            const vec = embeddingMap.get(normalizeRepoPath(filesWithEmbeddings[i].stableKey));
            if (vec) flat768.set(vec, i * 768);
          }
          const hidden = gpuEncode(flat768, N, 768, W1, b1, 256);
          const encoded = gpuEncode(hidden, N, 256, W2, b2, 64);
          for (let i = 0; i < N; i++) {
            encodedMap.set(filesWithEmbeddings[i].stableKey, encoded.slice(i * 64, (i + 1) * 64));
          }
          console.log(`[karpathy] H6: encoded ${encodedMap.size} files to 64-dim (trainedAt=${mData?.trainedAt ?? 'unknown'})`);
        }
      } else {
        console.warn('[karpathy] H6: ace:autoencoder:weights missing — skipping 64-dim encode');
      }
    } catch (err) {
      console.warn(`[karpathy] H6: autoencoder encode failed: ${err.message}`);
    }
  }

  if (!DRY) {
    const redis = _earlyRedis ?? new Redis(REDIS_URL, { password: REDIS_PASS || undefined });
    // Write scores as a pipeline for atomicity + set 7-day TTL to match summary
    const pipe = redis.pipeline();
    pipe.del('gpu:karpathy:scores');
    for (const r of finalResults) {
      pipe.hset('gpu:karpathy:scores', r.stableKey, JSON.stringify(r));
    }
    pipe.expire('gpu:karpathy:scores', KARPATHY_TTL);

    // Phase B: write path→cluster reverse index + cluster member sorted sets
    const clusterPipe = redis.pipeline();
    clusterPipe.del('ace:cluster:members:__index'); // sentinel reset
    for (const r of finalResults) {
      const ck = _pathToCluster.get(r.stableKey);
      if (ck) {
        clusterPipe.setex(`ace:path:cluster:${r.stableKey}`, 604800, ck);
        clusterPipe.zadd(`ace:cluster:members:${ck}`, r.blend, r.stableKey);
      }
    }
    // Set TTL on all cluster member sets
    const seenClusters = new Set([..._pathToCluster.values()]);
    for (const ck of seenClusters) {
      clusterPipe.expire(`ace:cluster:members:${ck}`, 604800);
    }
    await pipe.exec();
    await clusterPipe.exec();

    // H6: write 64-dim encoded vectors to gpu:karpathy:encoded (7-day TTL)
    if (encodedMap.size > 0) {
      const encodedPipe = redis.pipeline();
      encodedPipe.del('gpu:karpathy:encoded');
      for (const [key, vec] of encodedMap) {
        encodedPipe.hset('gpu:karpathy:encoded', key, Array.from(vec).join(','));
      }
      encodedPipe.expire('gpu:karpathy:encoded', KARPATHY_TTL);
      await encodedPipe.exec();
    }

    await redis.setex('gpu:karpathy:summary', 604800, JSON.stringify({
      ts: new Date().toISOString(),
      candidates: finalResults.length,
      topBlend: finalResults[0]?.blend ?? 0,
      attentionPeak: runAttentionPeak,
      attentionMean: runAttentionMean,
      clustersIndexed: seenClusters.size,
      encoded64: encodedMap.size,
    }));
    await redis.quit();
    
    let md = `# Karpathy GPU Authority Blend\n\nGenerated: ${new Date().toISOString()}\n\n`;
    md += `- FP16 mode: ${ENABLE_FP16 ? 'auto (default)' : 'disabled (--fp32)'}\n`;
    md += `- FP32 compare: ${COMPARE_FP32}\n`;
    md += `- GPU addon loaded: ${Boolean(gpu)}\n`;
    md += `- GPU attention used: ${Boolean(gpuAttentionScores && gpuAttentionScores.length)}\n\n`;
    md += `| File | PR | Auth | Attn | CPU | GPU | Δ | Peak | Mean | Blend |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of finalResults.slice(0, 25)) {
      const cpu = Number.isFinite(r.attentionCpu) ? r.attentionCpu.toFixed(3) : '0.000';
      const gpuVal = r.attentionGpu === null ? 'n/a' : r.attentionGpu.toFixed(3);
      const delta = Number.isFinite(r.attentionDelta) ? r.attentionDelta.toFixed(3) : '0.000';
      md += `| ${r.stableKey} | ${r.pr.toFixed(3)} | ${r.authority.toFixed(3)} | ${r.attention.toFixed(3)} | ${cpu} | ${gpuVal} | ${delta} | ${r.attentionPeak?.toFixed?.(3) ?? '0.000'} | ${r.attentionMean?.toFixed?.(3) ?? '0.000'} | ${r.blend.toFixed(3)} |\n`;
    }
    writeFileSync(REPORT, md);
  }

  const logFile = resolve(LOG_DIR, `karpathy-gpu-${Date.now()}.json`);
  writeFileSync(logFile, JSON.stringify({ ...log_state, results: finalResults }, null, 2));
  console.log(`[karpathy] Done. Results: ${finalResults.length}. Report: ${REPORT}`);
}

main().catch(console.error);
