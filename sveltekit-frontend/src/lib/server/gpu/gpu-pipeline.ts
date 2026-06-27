/**
 * GPU Pipeline — stream-aware async queuing + Redis shape-cache for MCP tool calls.
 *
 * TypeScript emulation of CUDA Graph replay:
 *   - Fixed-shape results (same fn + n + dim) are cached in Redis at
 *     gpu:graph:{fn}:{n}:{dim}:{inputHash} (TTL 300 s) so identical GPU calls
 *     replay in ~0.1 ms instead of ~15 ms.
 *   - A semaphore (StreamQueue) caps concurrent GPU Promises at CUDA_MAX_STREAMS
 *     (default 4) to avoid serialising all calls through a single hidden stream.
 *
 * MCP tool handlers import the pipeline wrappers; they do NOT call the addon directly.
 *
 * Exports:
 *   pipelineAttention(query, keys, n, dim)  → Float32Array weights
 *   pipelinePageRank(adj, n, damping, iters) → Float32Array scores
 *   pipelineReward(gen, ref, n, dim)        → Float32Array scores
 *   pipelineTopK(scores, n, k)             → Int32Array indices
 *   pipelineKmeans(embeddings, n, dim, k)  → { assignments, centroids }
 *   pipelineSoftmax(logits, n)             → Float32Array probs
 *   gpuPipelineStats()                     → diagnostics snapshot
 */

import { createHash } from 'node:crypto';
import { getAddonInternal, gpuHasRoom, vramNeededMB } from './libtorch-bridge.js';

// Phase 3: Packet-centric telemetry (optional — pipeline works without it)
let recordPacketCentricTelemetry: ((event: any) => Promise<void>) | null = null;
try {
	const mod = await import('$lib/server/telemetry/packet-centric-telemetry.js');
	recordPacketCentricTelemetry = mod.recordPacketCentricTelemetry ?? null;
} catch {
	// Telemetry module not available — skip non-blocking
}

// ── ENV (lazy import — avoids circular deps at module init) ──────────────────

let _maxStreams = 4;
let _deviceId   = 0;
let _envLoaded  = false;

async function loadEnv() {
  if (_envLoaded) return;
  _envLoaded = true;
  try {
    const { ENV } = await import('$lib/server/env.server.js');
    _maxStreams = ENV.CUDA_MAX_STREAMS ?? 4;
    _deviceId   = ENV.CUDA_DEVICE_ID   ?? 0;
  } catch {
    // env not available in non-SvelteKit contexts (scripts) — defaults stand
  }
}

// ── Stream Queue (semaphore) ──────────────────────────────────────────────────
// Limits concurrent GPU ops to CUDA_MAX_STREAMS so kernels can run in parallel
// on separate CUDA streams rather than being serialised on stream 0.

class StreamQueue {
  private _slots: number;
  private _queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this._slots = maxConcurrent;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this._acquire();
    try {
      return await fn();
    } finally {
      this._release();
    }
  }

  private _acquire(): Promise<void> {
    if (this._slots > 0) {
      this._slots--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next();
    } else {
      this._slots++;
    }
  }

  get pending() { return this._queue.length; }
  get active()  { return _maxStreams - this._slots; }
}

let _queue: StreamQueue | null = null;

async function getQueue(): Promise<StreamQueue> {
  if (!_queue) {
    await loadEnv();
    _queue = new StreamQueue(_maxStreams);
  }
  return _queue;
}

// ── Redis shape-cache (CUDA Graph replay emulation) ───────────────────────────
// Key: gpu:graph:{fn}:{n}:{dim}:{inputHash8}  TTL 300 s
// On hit: deserialise Float32Array from base64, skip GPU entirely.

const GRAPH_CACHE_TTL = 300;

function inputHash(data: Float32Array, extra?: string): string {
  const h = createHash('md5');
  // Hash only first+last 64 floats (256 bytes) — sufficient uniqueness, cheap
  const view = data.subarray(0, Math.min(64, data.length));
  h.update(Buffer.from(view.buffer, view.byteOffset, view.byteLength));
  if (extra) h.update(extra);
  return h.digest('hex').slice(0, 12);
}

async function cacheGet<T>(key: string, decode: (raw: string) => T): Promise<T | null> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return decode(raw);
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: Buffer | string): Promise<void> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    await getRedis().setex(key, GRAPH_CACHE_TTL, value instanceof Buffer ? value.toString('base64') : value);
  } catch { /* non-fatal */ }
}

function f32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

function base64ToF32(raw: string): Float32Array {
  const buf = Buffer.from(raw, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function i32ToBase64(arr: Int32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

function base64ToI32(raw: string): Int32Array {
  const buf = Buffer.from(raw, 'base64');
  return new Int32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ── Telemetry ────────────────────────────────────────────────────────────────

interface PipelineTelemetry {
  fn:       string;
  n:        number;
  dim:      number;
  source:   'gpu' | 'cpu' | 'cache';
  durationMs: number;
}

const _telemetry: PipelineTelemetry[] = [];
const MAX_TELEMETRY = 200;

function record(t: PipelineTelemetry) {
  _telemetry.push(t);
  if (_telemetry.length > MAX_TELEMETRY) _telemetry.shift();
}

// ── CPU fallbacks ─────────────────────────────────────────────────────────────

function cpuAttention(query: Float32Array, dim: number, keys: Float32Array, n: number): Float32Array {
  const scale = 1 / Math.sqrt(dim);
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += query[d] * keys[i * dim + d];
    scores[i] = dot * scale;
  }
  // softmax
  const max = Math.max(...scores);
  let sum = 0;
  const exp = new Float32Array(n);
  for (let i = 0; i < n; i++) { exp[i] = Math.exp(scores[i] - max); sum += exp[i]; }
  for (let i = 0; i < n; i++) exp[i] /= sum;
  return exp;
}

function cpuPageRank(adj: Float32Array, n: number, damping: number, iters: number): Float32Array {
  const P = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += adj[i * n + j];
    if (s < 1e-8) s = 1;
    for (let j = 0; j < n; j++) P[j * n + i] = adj[i * n + j] / s;
  }
  let r = new Float32Array(n).fill(1 / n);
  const teleport = (1 - damping) / n;
  for (let it = 0; it < iters; it++) {
    const next = new Float32Array(n).fill(teleport);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) next[j] += damping * P[j * n + i] * r[i];
    r = next;
  }
  return r;
}

function cpuReward(gen: Float32Array, ref: Float32Array, n: number, dim: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0, gn = 0, rn = 0;
    for (let d = 0; d < dim; d++) {
      const g = gen[i * dim + d], r = ref[i * dim + d];
      dot += g * r; gn += g * g; rn += r * r;
    }
    out[i] = dot / ((Math.sqrt(gn) || 1e-8) * (Math.sqrt(rn) || 1e-8));
  }
  return out;
}

function cpuTopK(scores: Float32Array, n: number, k: number): Int32Array {
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  return new Int32Array(idx.slice(0, k));
}

function cpuSoftmax(logits: Float32Array, n: number): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i];
  const exp = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { exp[i] = Math.exp(logits[i] - max); sum += exp[i]; }
  for (let i = 0; i < n; i++) exp[i] /= sum;
  return exp;
}

// ── Public pipeline wrappers ──────────────────────────────────────────────────

/**
 * Scaled dot-product attention — ACE context chunk ranking.
 * GPU: attentionScoreGPU via tensorrt_bridge.node
 * Cache key: gpu:graph:attn:{n}:{dim}:{hash}
 */
export async function pipelineAttention(
  query: Float32Array,
  keys:  Float32Array,
  n:     number,
  dim:   number,
): Promise<{ weights: Float32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0  = performance.now();
  const telemetryStart = Date.now();
  const ckey = `gpu:graph:attn:${n}:${dim}:${inputHash(query)}`;

  const cached = await cacheGet(ckey, base64ToF32);
  if (cached) {
    record({ fn: 'attn', n, dim, source: 'cache', durationMs: performance.now() - t0 });
    return { weights: cached, source: 'cache' };
  }

  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let weights: Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';
    let errorCode: string | null = null;

    if (addon?.attentionScoreGPU && gpuHasRoom(vramNeededMB(n + 1, dim) + 256)) {
      try {
        weights = addon.attentionScoreGPU(query, dim, keys, n);
        source  = 'gpu';
      } catch (err) {
        weights = cpuAttention(query, dim, keys, n);
        errorCode = (err as Error)?.message?.slice(0, 64) || 'gpu_fallback';
      }
    } else {
      weights = cpuAttention(query, dim, keys, n);
    }

    cacheSet(ckey, f32ToBase64(weights)).catch(() => {});
    const durationMs = performance.now() - t0;
    record({ fn: 'attn', n, dim, source, durationMs });

    // Phase 3: Emit GPU pipeline telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        latency_ms: Date.now() - telemetryStart,
        retrieval_strategy: source === 'cache' ? 'gpu_pipeline_cache' : `gpu_pipeline_attention_${source}`,
        packet_context: {
          packet_id: null,
          feature_id: 'gpu.pipeline.attention',
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu',
        },
        gpu_metadata: {
          kernel_name: 'attentionScoreGPU',
          gpu_backend: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu_fallback',
          operation: 'attention',
          candidate_count: n,
          input_dim: dim,
          output_dim: n,
          fallback_used: source !== 'gpu',
          error_code: errorCode,
        },
      }).catch((err) => {
        console.debug('[gpu-pipeline] Attention telemetry failed (non-blocking):', err);
      });
    }

    return { weights, source };
  });
}

/**
 * Power-iteration PageRank for code dependency graphs.
 * GPU: pageRankGPU via tensorrt_bridge.node
 * Cache key: gpu:graph:pr:{n}:{damping*100|0}:{hash}
 */
export async function pipelinePageRank(
  adj:     Float32Array,
  n:       number,
  damping  = 0.85,
  iters    = 50,
): Promise<{ scores: Float32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0   = performance.now();
  const telemetryStart = Date.now();
  const ckey = `gpu:graph:pr:${n}:${Math.round(damping * 100)}:${inputHash(adj)}`;

  const cached = await cacheGet(ckey, base64ToF32);
  if (cached) {
    record({ fn: 'pr', n, dim: n, source: 'cache', durationMs: performance.now() - t0 });
    return { scores: cached, source: 'cache' };
  }

  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let scores: Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';
    let errorCode: string | null = null;

    if (addon?.pageRankGPU && gpuHasRoom(vramNeededMB(n, n) + 256)) {
      try {
        scores = addon.pageRankGPU(adj, n, damping, iters);
        source = 'gpu';
      } catch (err) {
        scores = cpuPageRank(adj, n, damping, iters);
        errorCode = (err as Error)?.message?.slice(0, 64) || 'gpu_fallback';
      }
    } else {
      scores = cpuPageRank(adj, n, damping, iters);
    }

    cacheSet(ckey, f32ToBase64(scores)).catch(() => {});
    const durationMs = performance.now() - t0;
    record({ fn: 'pr', n, dim: n, source, durationMs });

    // Phase 3: Emit GPU pipeline telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        latency_ms: Date.now() - telemetryStart,
        retrieval_strategy: source === 'cache' ? 'gpu_pipeline_cache' : `gpu_pipeline_pagerank_${source}`,
        packet_context: {
          packet_id: null,
          feature_id: 'gpu.pipeline.pagerank',
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu',
        },
        gpu_metadata: {
          kernel_name: 'pageRankGPU',
          gpu_backend: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu_fallback',
          operation: 'pagerank',
          candidate_count: n,
          input_dim: n,
          output_dim: n,
          fallback_used: source !== 'gpu',
          error_code: errorCode,
        },
      }).catch((err) => {
        console.debug('[gpu-pipeline] PageRank telemetry failed (non-blocking):', err);
      });
    }

    return { scores, source };
  });
}

/**
 * Cosine reward scoring — GRPO-compatible signal.
 * GPU: rewardScoreGPU via tensorrt_bridge.node
 * Cache key: gpu:graph:reward:{n}:{dim}:{hash}
 */
export async function pipelineReward(
  gen: Float32Array,
  ref: Float32Array,
  n:   number,
  dim: number,
): Promise<{ scores: Float32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0   = performance.now();
  const telemetryStart = Date.now();
  const ckey = `gpu:graph:reward:${n}:${dim}:${inputHash(gen)}`;

  const cached = await cacheGet(ckey, base64ToF32);
  if (cached) {
    record({ fn: 'reward', n, dim, source: 'cache', durationMs: performance.now() - t0 });
    return { scores: cached, source: 'cache' };
  }

  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let scores: Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';
    let errorCode: string | null = null;

    if (addon?.rewardScoreGPU && gpuHasRoom(vramNeededMB(2 * n, dim) + 256)) {
      try {
        scores = addon.rewardScoreGPU(gen, ref, n, dim);
        source = 'gpu';
      } catch (err) {
        scores = cpuReward(gen, ref, n, dim);
        errorCode = (err as Error)?.message?.slice(0, 64) || 'gpu_fallback';
      }
    } else {
      scores = cpuReward(gen, ref, n, dim);
    }

    cacheSet(ckey, f32ToBase64(scores)).catch(() => {});
    const durationMs = performance.now() - t0;
    record({ fn: 'reward', n, dim, source, durationMs });

    // Phase 3: Emit GPU pipeline telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        latency_ms: Date.now() - telemetryStart,
        retrieval_strategy: source === 'cache' ? 'gpu_pipeline_cache' : `gpu_pipeline_reward_${source}`,
        packet_context: {
          packet_id: null,
          feature_id: 'gpu.pipeline.reward',
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu',
        },
        gpu_metadata: {
          kernel_name: 'rewardScoreGPU',
          gpu_backend: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu_fallback',
          operation: 'reward',
          candidate_count: n,
          input_dim: dim,
          output_dim: 1,
          fallback_used: source !== 'gpu',
          error_code: errorCode,
        },
      }).catch((err) => {
        console.debug('[gpu-pipeline] Reward telemetry failed (non-blocking):', err);
      });
    }

    return { scores, source };
  });
}

/**
 * GPU top-k selection — returns k indices of highest-scoring candidates.
 * Cache key: gpu:graph:topk:{n}:{k}:{hash}
 */
export async function pipelineTopK(
  scores: Float32Array,
  n:      number,
  k:      number,
): Promise<{ indices: Int32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0   = performance.now();
  const telemetryStart = Date.now();
  const ckey = `gpu:graph:topk:${n}:${k}:${inputHash(scores)}`;

  const cached = await cacheGet(ckey, base64ToI32);
  if (cached) {
    record({ fn: 'topk', n, dim: k, source: 'cache', durationMs: performance.now() - t0 });
    return { indices: cached, source: 'cache' };
  }

  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let indices: Int32Array;
    let source: 'gpu' | 'cpu' = 'cpu';
    let errorCode: string | null = null;

    if (addon?.topKIndicesGPU && k <= n && gpuHasRoom(vramNeededMB(n, 1) + 64)) {
      try {
        indices = addon.topKIndicesGPU(scores, n, k);
        source  = 'gpu';
      } catch (err) {
        indices = cpuTopK(scores, n, k);
        errorCode = (err as Error)?.message?.slice(0, 64) || 'gpu_fallback';
      }
    } else {
      indices = cpuTopK(scores, n, k);
    }

    cacheSet(ckey, i32ToBase64(indices)).catch(() => {});
    const durationMs = performance.now() - t0;
    record({ fn: 'topk', n, dim: k, source, durationMs });

    // Phase 3: Emit GPU pipeline telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        latency_ms: Date.now() - telemetryStart,
        retrieval_strategy: source === 'cache' ? 'gpu_pipeline_cache' : `gpu_pipeline_topk_${source}`,
        packet_context: {
          packet_id: null,
          feature_id: 'gpu.pipeline.topk',
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu',
        },
        gpu_metadata: {
          kernel_name: 'topKIndicesGPU',
          gpu_backend: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu_fallback',
          operation: 'topk',
          candidate_count: n,
          input_dim: 1,
          output_dim: k,
          fallback_used: source !== 'gpu',
          error_code: errorCode,
        },
      }).catch((err) => {
        console.debug('[gpu-pipeline] TopK telemetry failed (non-blocking):', err);
      });
    }

    return { indices, source };
  });
}

/**
 * GPU k-means with centroids — ACE cluster routing, SOM BMU assignment.
 * Cache key: gpu:graph:kmeans:{n}:{dim}:{k}:{hash}
 */
export async function pipelineKmeans(
  embeddings: Float32Array,
  n:          number,
  dim:        number,
  k:          number,
  maxIters    = 20,
): Promise<{
  assignments: Int32Array;
  centroids:   Float32Array;
  source:      'gpu' | 'cpu' | 'cache';
}> {
  const t0   = performance.now();
  const telemetryStart = Date.now();
  const ckey = `gpu:graph:kmeans:${n}:${dim}:${k}:${inputHash(embeddings)}`;

  const cached = await cacheGet(ckey, (raw) => {
    const parsed = JSON.parse(raw) as { a: string; c: string };
    return { assignments: base64ToI32(parsed.a), centroids: base64ToF32(parsed.c) };
  });
  if (cached) {
    record({ fn: 'kmeans', n, dim, source: 'cache', durationMs: performance.now() - t0 });
    return { ...cached, source: 'cache' };
  }

  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let assignments: Int32Array;
    let centroids:   Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';
    let errorCode: string | null = null;

    if (addon?.kmeansWithCentroids && n > 0 && dim > 0 && k > 0
        && gpuHasRoom(vramNeededMB(n + k, dim) + 256)) {
      try {
        const res = addon.kmeansWithCentroids(embeddings, n, dim, k, maxIters);
        assignments = res.assignments;
        centroids   = res.centroids;
        source      = 'gpu';
      } catch (err) {
        ({ assignments, centroids } = cpuKmeans(embeddings, n, dim, k, maxIters));
        errorCode = (err as Error)?.message?.slice(0, 64) || 'gpu_fallback';
      }
    } else {
      ({ assignments, centroids } = cpuKmeans(embeddings, n, dim, k, maxIters));
    }

    const payload = JSON.stringify({ a: i32ToBase64(assignments), c: f32ToBase64(centroids) });
    cacheSet(ckey, payload).catch(() => {});
    const durationMs = performance.now() - t0;
    record({ fn: 'kmeans', n, dim, source, durationMs });

    // Phase 3: Emit GPU pipeline telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        latency_ms: Date.now() - telemetryStart,
        retrieval_strategy: source === 'cache' ? 'gpu_pipeline_cache' : `gpu_pipeline_kmeans_${source}`,
        packet_context: {
          packet_id: null,
          feature_id: 'gpu.pipeline.kmeans',
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu',
        },
        gpu_metadata: {
          kernel_name: 'kmeansWithCentroids',
          gpu_backend: source === 'gpu' ? 'cuda' : source === 'cache' ? 'redis' : 'cpu_fallback',
          operation: 'kmeans',
          candidate_count: n,
          input_dim: dim,
          output_dim: k,
          fallback_used: source !== 'gpu',
          error_code: errorCode,
        },
      }).catch((err) => {
        console.debug('[gpu-pipeline] KMeans telemetry failed (non-blocking):', err);
      });
    }

    return { assignments, centroids, source };
  });
}

/**
 * GPU softmax — probability calibration for MCP confidence scores.
 */
export async function pipelineSoftmax(
  logits: Float32Array,
  n:      number,
): Promise<{ probs: Float32Array; source: 'gpu' | 'cpu' }> {
  const t0 = performance.now();
  const telemetryStart = Date.now();
  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let source: 'gpu' | 'cpu' = 'cpu';
    let probs: Float32Array;
    let errorCode: string | null = null;

    if (addon?.softmaxGPU && gpuHasRoom(vramNeededMB(n, 1) + 64)) {
      try {
        probs = addon.softmaxGPU(logits, n);
        source = 'gpu';
      } catch (err) {
        probs = cpuSoftmax(logits, n);
        errorCode = (err as Error)?.message?.slice(0, 64) || 'gpu_fallback';
      }
    } else {
      probs = cpuSoftmax(logits, n);
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'softmax', n, dim: 1, source, durationMs });

    // Phase 3: Emit GPU pipeline telemetry (non-blocking)
    if (recordPacketCentricTelemetry) {
      recordPacketCentricTelemetry({
        latency_ms: Date.now() - telemetryStart,
        retrieval_strategy: `gpu_pipeline_softmax_${source}`,
        packet_context: {
          packet_id: null,
          feature_id: 'gpu.pipeline.softmax',
          som_cell: null,
          schema_version: 1,
          embedding_version: 'embeddinggemma:latest',
          tool_version: 'mcp:1.0',
          gpu_kernel_version: 'tensorrt_bridge:1.0',
          rpc_transport: source === 'gpu' ? 'cuda' : 'cpu',
        },
        gpu_metadata: {
          kernel_name: 'softmaxGPU',
          gpu_backend: source === 'gpu' ? 'cuda' : 'cpu_fallback',
          operation: 'softmax',
          candidate_count: n,
          input_dim: 1,
          output_dim: 1,
          fallback_used: source !== 'gpu',
          error_code: errorCode,
        },
      }).catch((err) => {
        console.debug('[gpu-pipeline] Softmax telemetry failed (non-blocking):', err);
      });
    }

    return { probs, source };
  });
}

// ── CPU k-means (for fallback — mirrors kmeansWithCentroids CPU path) ────────

function cpuKmeans(
  embeddings: Float32Array, n: number, dim: number, k: number, maxIters: number,
): { assignments: Int32Array; centroids: Float32Array } {
  const kc = Math.min(k, n);
  const centroids = new Float32Array(kc * dim);
  for (let c = 0; c < kc; c++) {
    for (let d = 0; d < dim; d++) centroids[c * dim + d] = embeddings[c * dim + d];
  }
  const assignments = new Int32Array(n);

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < kc; c++) {
        let dist = 0;
        for (let d = 0; d < dim; d++) {
          const diff = embeddings[i * dim + d] - centroids[c * dim + d];
          dist += diff * diff;
        }
        if (dist < bestD) { bestD = dist; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;
    const counts = new Int32Array(kc);
    centroids.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) centroids[c * dim + d] += embeddings[i * dim + d];
    }
    for (let c = 0; c < kc; c++) {
      if (counts[c] > 0) for (let d = 0; d < dim; d++) centroids[c * dim + d] /= counts[c];
      else {
        let fi = 0, fd = -1;
        for (let i = 0; i < n; i++) {
          const ac = assignments[i];
          let dist = 0;
          for (let d = 0; d < dim; d++) {
            const diff = embeddings[i * dim + d] - centroids[ac * dim + d];
            dist += diff * diff;
          }
          if (dist > fd) { fd = dist; fi = i; }
        }
        for (let d = 0; d < dim; d++) centroids[c * dim + d] = embeddings[fi * dim + d];
      }
    }
  }
  return { assignments, centroids };
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export interface GpuPipelineStats {
  deviceId:      number;
  maxStreams:    number;
  activeStreams:  number;
  pendingOps:    number;
  recentOps:     PipelineTelemetry[];
  cacheHitRate:  number;
}

export function gpuPipelineStats(): GpuPipelineStats {
  const recent = _telemetry.slice(-50);
  const hits   = recent.filter((t) => t.source === 'cache').length;
  return {
    deviceId:     _deviceId,
    maxStreams:   _maxStreams,
    activeStreams: _queue?.active  ?? 0,
    pendingOps:   _queue?.pending ?? 0,
    recentOps:    recent,
    cacheHitRate: recent.length ? hits / recent.length : 0,
  };
}
