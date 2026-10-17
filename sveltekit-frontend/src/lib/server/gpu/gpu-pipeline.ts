// @ts-nocheck
/**
 * GPU Pipeline — bounded async queuing for MCP tool calls.
 *
 * Legacy numeric Redis result storage is disabled; qualified residency descriptors
 * remain with the existing ACE/BitFrost owner, not this compute executor.
 * A semaphore caps host tasks; it does not allocate or prove parallel CUDA streams.
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

import { getAddonInternal, gpuHasRoom, vramNeededMB } from './libtorch-bridge.js';
import { recordResourceOperation } from '../telemetry/gpu-telemetry.js';

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
// Limits host tasks; CUDA stream creation and overlap require separate native proof.

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
  const names = { attn: ['attention', 'attentionScoreGPU'], pr: ['pagerank', 'pageRankGPU'],
    reward: ['reward', 'rewardScoreGPU'], topk: ['topk', 'topKIndicesGPU'],
    kmeans: ['kmeans', 'kmeansWithCentroids'], softmax: ['softmax', 'softmaxGPU'] };
  const [operation, nativeExport] = names[t.fn];
  void recordResourceOperation({ schema: 'atlas.resource-operation.v1', operation,
    native_export: t.source === 'gpu' ? nativeExport : null, requested_kernel: null,
    kernel_name: null, kernel_ms: null, wall_ms: t.durationMs, duration_scope: 'PIPELINE_WALL_TIME',
    execution_backend: t.source === 'cpu' ? 'CPU_REFERENCE' : t.source === 'cache' ? 'CACHE' : 'NATIVE_EXPORT_UNVERIFIED',
    reported_backend: null, candidate_count: t.n, input_dim: t.fn === 'topk' ? 1 : t.dim,
    output_dim: t.fn === 'topk' ? t.dim : t.fn === 'kmeans' ? null : 1, canonicalAuthority: false,
  });
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
 */
export async function pipelineAttention(
  query: Float32Array,
  keys:  Float32Array,
  n:     number,
  dim:   number,
): Promise<{ weights: Float32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0  = performance.now();


  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let weights: Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';

    if (addon?.attentionScoreGPU && gpuHasRoom(vramNeededMB(n + 1, dim) + 256)) {
      try {
        weights = addon.attentionScoreGPU(query, dim, keys, n);
        source  = 'gpu';
      } catch (err) {
        weights = cpuAttention(query, dim, keys, n);
      }
    } else {
      weights = cpuAttention(query, dim, keys, n);
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'attn', n, dim, source, durationMs });

    return { weights, source };
  });
}

/**
 * Power-iteration PageRank for code dependency graphs.
 * GPU: pageRankGPU via tensorrt_bridge.node
 */
export async function pipelinePageRank(
  adj:     Float32Array,
  n:       number,
  damping  = 0.85,
  iters    = 50,
): Promise<{ scores: Float32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0   = performance.now();


  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let scores: Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';

    if (addon?.pageRankGPU && gpuHasRoom(vramNeededMB(n, n) + 256)) {
      try {
        scores = addon.pageRankGPU(adj, n, damping, iters);
        source = 'gpu';
      } catch (err) {
        scores = cpuPageRank(adj, n, damping, iters);
      }
    } else {
      scores = cpuPageRank(adj, n, damping, iters);
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'pr', n, dim: n, source, durationMs });

    return { scores, source };
  });
}

/**
 * Cosine reward scoring — GRPO-compatible signal.
 * GPU: rewardScoreGPU via tensorrt_bridge.node
 */
export async function pipelineReward(
  gen: Float32Array,
  ref: Float32Array,
  n:   number,
  dim: number,
): Promise<{ scores: Float32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0   = performance.now();


  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let scores: Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';

    if (addon?.rewardScoreGPU && gpuHasRoom(vramNeededMB(2 * n, dim) + 256)) {
      try {
        scores = addon.rewardScoreGPU(gen, ref, n, dim);
        source = 'gpu';
      } catch (err) {
        scores = cpuReward(gen, ref, n, dim);
      }
    } else {
      scores = cpuReward(gen, ref, n, dim);
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'reward', n, dim, source, durationMs });

    return { scores, source };
  });
}

/**
 * GPU top-k selection — returns k indices of highest-scoring candidates.
 */
export async function pipelineTopK(
  scores: Float32Array,
  n:      number,
  k:      number,
): Promise<{ indices: Int32Array; source: 'gpu' | 'cpu' | 'cache' }> {
  const t0   = performance.now();


  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let indices: Int32Array;
    let source: 'gpu' | 'cpu' = 'cpu';

    if (addon?.topKIndicesGPU && k <= n && gpuHasRoom(vramNeededMB(n, 1) + 64)) {
      try {
        indices = addon.topKIndicesGPU(scores, n, k);
        source  = 'gpu';
      } catch (err) {
        indices = cpuTopK(scores, n, k);
      }
    } else {
      indices = cpuTopK(scores, n, k);
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'topk', n, dim: k, source, durationMs });

    return { indices, source };
  });
}

/**
 * GPU k-means with centroids — ACE cluster routing, SOM BMU assignment.
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


  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let assignments: Int32Array;
    let centroids:   Float32Array;
    let source: 'gpu' | 'cpu' = 'cpu';

    if (addon?.kmeansWithCentroids && n > 0 && dim > 0 && k > 0
        && gpuHasRoom(vramNeededMB(n + k, dim) + 256)) {
      try {
        const res = addon.kmeansWithCentroids(embeddings, n, dim, k, maxIters);
        assignments = res.assignments;
        centroids   = res.centroids;
        source      = 'gpu';
      } catch (err) {
        ({ assignments, centroids } = cpuKmeans(embeddings, n, dim, k, maxIters));
      }
    } else {
      ({ assignments, centroids } = cpuKmeans(embeddings, n, dim, k, maxIters));
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'kmeans', n, dim, source, durationMs });

    return { assignments, centroids, source };
  });
}

/**
 * GPU softmax — normalized scores, not evidence of calibrated confidence.
 */
export async function pipelineSoftmax(
  logits: Float32Array,
  n:      number,
): Promise<{ probs: Float32Array; source: 'gpu' | 'cpu' }> {
  const t0 = performance.now();
  const q = await getQueue();
  return q.run(async () => {
    const addon = getAddonInternal();
    let source: 'gpu' | 'cpu' = 'cpu';
    let probs: Float32Array;

    if (addon?.softmaxGPU && gpuHasRoom(vramNeededMB(n, 1) + 64)) {
      try {
        probs = addon.softmaxGPU(logits, n);
        source = 'gpu';
      } catch (err) {
        probs = cpuSoftmax(logits, n);
      }
    } else {
      probs = cpuSoftmax(logits, n);
    }

    const durationMs = performance.now() - t0;
    record({ fn: 'softmax', n, dim: 1, source, durationMs });

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
  concurrencyScope: 'HOST_TASK_QUEUE_NOT_CUDA_STREAMS';
  resultCachePolicy: 'DISABLED_LEGACY_NUMERIC_STORAGE';
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
    concurrencyScope: 'HOST_TASK_QUEUE_NOT_CUDA_STREAMS',
    resultCachePolicy: 'DISABLED_LEGACY_NUMERIC_STORAGE',
    deviceId:     _deviceId,
    maxStreams:   _maxStreams,
    activeStreams: _queue?.active  ?? 0,
    pendingOps:   _queue?.pending ?? 0,
    recentOps:    recent,
    cacheHitRate: recent.length ? hits / recent.length : 0,
  };
}
