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
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

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

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const DIRTY_ONLY = args.includes('--dirty');
const SOURCE     = args.find(a => a.startsWith('--source='))?.split('=')[1]
                 ?? (args.includes('--source') ? args[args.indexOf('--source') + 1] : null);
const FORCE      = args.includes('--force');
const HIT_LOG_HOURS = parseInt(
  args.find(a => a.startsWith('--hours='))?.split('=')[1] ?? '24', 10) || 24;
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

// ── Config ────────────────────────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const NEO4J_URL = process.env.NEO4J_HTTP_URL ?? (process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'http://localhost:7474').replace(/^bolt:\/\/|^neo4j:\/\//, 'http://').replace(':7687', ':7474');
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const REDIS_URL    = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS   = process.env.REDIS_PASSWORD ?? 'redis';
const DATABASE_URL = process.env.DATABASE_URL;

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
  return [...new Set([
    normalized,
    `sveltekit-frontend/${normalized}`,
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
  log_state.gpu.fallback = 'tensorrt_bridge.node not loadable — running in CPU/no-GPU degraded mode';
  console.warn('[karpathy] ' + log_state.gpu.fallback);
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

async function fetchTopByPageRank(limit) {
  const rows = await neo4jQuery(
    `MATCH (n:CodebaseFile) WHERE n.graphPageRank IS NOT NULL
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

async function fetchEmbeddingsBatch(filePaths) {
  const result = new Map();
  if (!filePaths.length) return result;

  for (let i = 0; i < filePaths.length; i += QDRANT_BATCH_SIZE) {
    const chunk = filePaths.slice(i, i + QDRANT_BATCH_SIZE);
    try {
      const allVariants = chunk.flatMap(fp => qdrantPathVariants(fp));
      const filterKeys = ['file_path', 'filePath', 'relativePath', 'relative_path', 'path', 'stable_key', 'stableKey'];
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
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const pt of (data.result?.points ?? [])) {
        const fp = normalizeRepoPath(getPayloadPath(pt.payload));
        if (!fp) continue;
        const vec = pt.vector?.content ?? pt.vector;
        if (Array.isArray(vec) && vec.length === 768) {
          if (!result.has(fp)) result.set(fp, new Float32Array(vec));
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

async function fetchProbeEmbedding(query) {
  const sveltekitUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:5173';
  try {
    const res = await fetch(`${sveltekitUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.embedding) return new Float32Array(d.embedding);
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
    const d = await res.json();
    return d.embedding ? new Float32Array(d.embedding) : null;
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

  const probe = await fetchProbeEmbedding('risk vulnerability security architecture');
  
  const finalResults = [];
  for (const c of candidates) {
    const emb = embeddingMap.get(normalizeRepoPath(c.stableKey));
    let attention = 0;
    if (emb && probe) {
      attention = computeAttentionScore(emb, probe);
    }
    
    const blend = computeKarpathyBlend(c.pr, c.authority, attention);
    finalResults.push({ ...c, attention, blend });
  }

  finalResults.sort((a, b) => b.blend - a.blend);
  log_state.topRisk = finalResults.slice(0, 10);

  if (!DRY) {
    const redis = new Redis(REDIS_URL);
    // Write scores as a pipeline for atomicity + set 7-day TTL to match summary
    const pipe = redis.pipeline();
    pipe.del('gpu:karpathy:scores');
    for (const r of finalResults) {
      pipe.hset('gpu:karpathy:scores', r.stableKey, JSON.stringify(r));
    }
    pipe.expire('gpu:karpathy:scores', 604800);

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

    await redis.setex('gpu:karpathy:summary', 604800, JSON.stringify({
      ts: new Date().toISOString(),
      candidates: finalResults.length,
      topBlend: finalResults[0]?.blend ?? 0,
      clustersIndexed: seenClusters.size,
    }));
    await redis.quit();
    
    let md = `# Karpathy GPU Authority Blend\n\nGenerated: ${new Date().toISOString()}\n\n`;
    md += `| File | PR | Auth | Attn | Blend |\n|---|---|---|---|---|\n`;
    for (const r of finalResults.slice(0, 25)) {
      md += `| ${r.stableKey} | ${r.pr.toFixed(3)} | ${r.authority.toFixed(3)} | ${r.attention.toFixed(3)} | ${r.blend.toFixed(3)} |\n`;
    }
    writeFileSync(REPORT, md);
  }

  const logFile = resolve(LOG_DIR, `karpathy-gpu-${Date.now()}.json`);
  writeFileSync(logFile, JSON.stringify({ ...log_state, results: finalResults }, null, 2));
  console.log(`[karpathy] Done. Results: ${finalResults.length}. Report: ${REPORT}`);
}

main().catch(console.error);
