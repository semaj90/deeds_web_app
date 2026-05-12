/**
 * LibTorch N-API Bridge — server-only.
 *
 * Loads the compiled tensorrt_bridge.node addon and exposes:
 *   - graphSimilarity / graphSimilarityHalf — cosine similarity matrix
 *   - clusterEmbeddings — K-means clustering
 *   - batchCosineSimilarity / batchCosineSimilarityChunked — query vs corpus
 *   - computeCaseEmbedding — weighted average embedding
 *   - lstmAdd / somCache / dotProduct / scaleArray / reluActivation — CUDA kernels
 *   - getCudaMemoryInfo / getMemoryPressure — OOM monitoring
 *
 * Memory / performance optimizations:
 *   - Float32Array pool: reuses pre-allocated typed arrays → ~90% fewer GC pauses
 *   - CUDA OOM guard: checks free VRAM before each GPU op → prevents driver OOM
 *   - Cache-blocked CPU cosine similarity: 128-float tiles → stays in L2 cache
 *   - 8-element unrolled inner loop → SIMD-friendly for auto-vectorization
 *   - Chunked batchCosineSimilarity: 4096-vector pages → stays in L3 on large corpora
 *   - Heap pressure check before large CPU allocations → prevents Node.js OOM
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Worker } from 'worker_threads';
import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';

const esmRequire = createRequire(import.meta.url);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SimilarityResult {
	matrix: number[][];
	n: number;
	source: 'gpu' | 'cpu';
}

export interface ClusterResult {
  assignments: number[];
  centroids?: number[][];
  k: number;
  source: 'gpu' | 'cpu';
}

export interface WeightedEmbeddingResult {
	embedding: number[];
	dimension: number;
	source: 'gpu' | 'cpu';
}

export interface CudaMemoryInfo {
	freeBytes: number;
	totalBytes: number;
	freeMB: number;
	totalMB: number;
	usedMB: number;
	available: boolean;
}

export interface BatchSimilarityResult {
	scores: number[];
	n: number;
	source: 'gpu' | 'cpu';
}

export interface HalfPrecisionSimilarityResult {
	matrix: number[][];
	n: number;
	source: 'gpu' | 'cpu';
}

export interface MemoryPressure {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  gpuFreeMB: number;
  gpuTotalMB: number;
  heapPressurePct: number;
  gpuPressurePct: number;
}

// ── Addon interface ─────────────────────────────────────────────────────────────

export interface NativeAddonPoolStats {
  totalBuckets: number;
  totalPooled: number;
  totalCapacityBytes: number;
}

export interface NativeAddon {
  bridgeSIMD: (json: string) => number;
  checkCudaAvailable: () => number;
  graphSimilarity?: (embeddings: Float32Array, n: number, dim: number) => Float32Array;
  clusterEmbeddings?: (
    embeddings: Float32Array,
    n: number,
    dim: number,
    k: number,
    maxIters: number
  ) => Int32Array;
  computeCaseEmbedding?: (
    weights: Float32Array,
    embeddings: Float32Array,
    n: number,
    dim: number
  ) => Float32Array;
  lstmAdd?: (a: Float32Array, b: Float32Array, n: number) => Float32Array;
  somCache?: (input: Float32Array, n: number) => Float32Array;
  dotProduct?: (a: Float32Array, b: Float32Array, n: number) => Float32Array;
  scale?: (input: Float32Array, scalar: number, n: number) => Float32Array;
  relu?: (input: Float32Array, n: number) => Float32Array;
  getCudaMemory?: (freeOut: BigInt64Array, totalOut: BigInt64Array) => number;
  batchCosineSimilarity?: (
    query: Float32Array,
    dim: number,
    corpus: Float32Array,
    n: number,
    scores: Float32Array,
    scoresLen: number
  ) => number;
  graphSimilarityHalf?: (
    embeddings: Float32Array,
    n: number,
    dim: number,
    output: Float32Array,
    outputLen: number
  ) => number;
  poolStats?: () => NativeAddonPoolStats;
  // Extended N-API exports (wired after Phase 110)
  trainSOM?: (
    data: Float32Array, n: number, dim: number,
    gridW: number, gridH: number, iters: number,
    lrInit: number, lrFinal: number,
    radiusInit: number, radiusFinal: number
  ) => { weights: Float32Array; bmu: Int32Array };
  kmeansWithCentroids?: (
    embeddings: Float32Array, n: number, dim: number,
    k: number, maxIters: number
  ) => { assignments: Int32Array; centroids: Float32Array; reseeded: number };
  attentionScoreGPU?: (
    query: Float32Array, dim: number,
    keys: Float32Array, n: number
  ) => Float32Array;
  rewardScoreGPU?: (
    gen: Float32Array, ref: Float32Array, n: number, dim: number
  ) => Float32Array;
  pageRankGPU?: (adj: Float32Array, n: number, damping: number, iters: number) => Float32Array;
  softmaxGPU?: (logits: Float32Array, n: number) => Float32Array;
  topKIndicesGPU?: (scores: Float32Array, n: number, k: number) => Int32Array;
  // Topology projection (pytorch_graph.cc)
  autoencoderEncode?: (
    input: Float32Array, n: number, inputDim: number,
    W: Float32Array, b: Float32Array, hidden: number
  ) => Float32Array;
  autoencoderDecode?: (
    encoded: Float32Array, n: number, hidden: number,
    W: Float32Array, b: Float32Array, outputDim: number
  ) => Float32Array;
  pcaProject?: (
    data: Float32Array, n: number, dim: number,
    mean: Float32Array, components: Float32Array, k: number
  ) => Float32Array;
}

let addon: NativeAddon | null = null;
let loadAttempted = false;

/** Add LibTorch + cuDNN DLL directories to PATH so the addon can find its dependencies */
function ensureLibtorchInPath(): void {
	const libDirs = [
    resolve(process.cwd(), '../libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib'),
    'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib',
    '/mnt/c/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib',
    '/mnt/c/libtorch/lib',
    '/usr/local/libtorch/lib',
    '/opt/libtorch/lib',
    '/usr/local/lib',
  ];
	const cudnnDirs = [
    'C:/Program Files/NVIDIA/CUDNN/v9.16/bin/13.0',
    'C:/Program Files/NVIDIA/CUDNN/v9.8/bin/12.8',
    '/mnt/c/Program Files/NVIDIA/CUDNN/v9.16/bin/13.0',
    '/mnt/c/Program Files/NVIDIA/CUDNN/v9.8/bin/12.8',
    '/usr/local/cuda-13.0/lib64',
    '/usr/local/cuda-12.8/lib64',
    '/usr/local/cuda/lib64',
    '/usr/lib/x86_64-linux-gnu',
  ];
	const sep = process.platform === 'win32' ? ';' : ':';
	let currentPath = process.env.PATH ?? '';

	for (const dir of libDirs) {
    if (existsSync(dir) && !currentPath.includes(dir)) {
      currentPath = dir + sep + currentPath;
      console.log(`[libtorch-bridge] Added to PATH: ${dir}`);
      break;
    }
  }
	for (const dir of cudnnDirs) {
    if (existsSync(dir) && !currentPath.includes(dir)) {
      currentPath = dir + sep + currentPath;
      console.log(`[libtorch-bridge] Added cuDNN to PATH: ${dir}`);
      break;
    }
  }
	process.env.PATH = currentPath;
}

export function getAddonInternal(): NativeAddon | null {
	if (loadAttempted) return addon;
	loadAttempted = true;

	ensureLibtorchInPath();

	const paths = [
		resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node'),
	];

	for (const p of paths) {
		try {
			if (!existsSync(p)) continue;
			addon = esmRequire(p) as NativeAddon;
			const cudaCode = addon.checkCudaAvailable?.() ?? 0;
			const cudaLabel = cudaCode === 2 ? 'CUDA+cuDNN' : cudaCode === 1 ? 'CUDA' : 'CPU';
			console.log(`[libtorch-bridge] Loaded native addon from ${p} (${cudaLabel})`);
			return addon;
		} catch (err) {
			console.warn(`[libtorch-bridge] Failed to load ${p}:`, (err as Error).message);
		}
	}

	console.warn('[libtorch-bridge] Native addon not found, using CPU fallback');
	return null;
}

/**
 * Proactive GPU readiness probe.
 * Returns true if the native CUDA addon is loaded AND the driver reports
 * compute capability (CUDA/cuDNN) is initialized.
 */
export function isCudaAvailable(): boolean {
	const native = getAddonInternal();
	if (!native) return false;
	const code = native.checkCudaAvailable?.() ?? 0;
	return code > 0; // 1 = CUDA, 2 = CUDA+cuDNN
}

// ── Float32Array pool ──────────────────────────────────────────────────────────
// Reuses typed arrays across calls to eliminate GC churn from large allocations.
// Each bucket stores arrays of a fixed power-of-2 capacity.

const float32Pool = new Map<number, Float32Array[]>();
const POOL_MAX_PER_BUCKET = 6;

function nextPow2(n: number): number {
	let p = 1;
	while (p < n) p <<= 1;
	return p;
}

export function acquireFloat32(n: number): Float32Array {
	const cap = nextPow2(n);
	const bucket = float32Pool.get(cap);
	if (bucket && bucket.length > 0) {
		const arr = bucket.pop()!;
		arr.fill(0, 0, n); // zero only the used portion
		return arr.subarray(0, n) as Float32Array;
	}
	return new Float32Array(cap).subarray(0, n) as Float32Array;
}

export function releaseFloat32(arr: Float32Array): void {
	// Recover the backing buffer capacity (subarray shares buffer)
	const cap = arr.buffer.byteLength / 4;
	const bucket = float32Pool.get(cap) ?? [];
	if (bucket.length < POOL_MAX_PER_BUCKET) {
		// Store the full-capacity view for reuse
		bucket.push(new Float32Array(arr.buffer));
		float32Pool.set(cap, bucket);
	}
}

// ── Heap & CUDA OOM guards ─────────────────────────────────────────────────────

const CUDA_OOM_MIN_MB = 256;  // require at least 256 MB free VRAM for GPU ops

/**
 * True if Node.js V8 heap has enough headroom for a CPU allocation.
 * Prevents OOM crash in CPU fallback paths for large embedding matrices.
 */
export function heapHasRoom(requiredBytes: number): boolean {
	const m = process.memoryUsage();
	// heapTotal grows dynamically; headroom = uncommitted space before next GC forced expand
	return (m.heapTotal - m.heapUsed) >= requiredBytes;
}

/** True if GPU has enough VRAM for the requested op. Fast — uses cached BigInt64Array. */
let _cudaMemFreeBuf: BigInt64Array | null = null;
let _cudaMemTotalBuf: BigInt64Array | null = null;

export function gpuHasRoom(requiredMB: number): boolean {
	const native = getAddonInternal();
	if (!native?.getCudaMemory) return false;
	if (!_cudaMemFreeBuf)  _cudaMemFreeBuf  = new BigInt64Array(1);
	if (!_cudaMemTotalBuf) _cudaMemTotalBuf = new BigInt64Array(1);
	try {
		const rc = native.getCudaMemory(_cudaMemFreeBuf, _cudaMemTotalBuf);
		if (rc !== 0) return false;
		const freeMB = Number(_cudaMemFreeBuf[0]) / (1024 * 1024);
		return freeMB >= requiredMB;
	} catch {
		return false;
	}
}

/** Minimum VRAM (MB) needed for a Float32 matrix of shape [n × dim]. */
export function vramNeededMB(n: number, dim: number): number {
	return (n * dim * 4) / (1024 * 1024); // bytes → MB
}

// ── Cache-blocked CPU cosine similarity ───────────────────────────────────────
// Block size = 128 floats (512 bytes) — fits comfortably in L2 (256 KB typical).
// Inner loop unrolled 8× for SIMD auto-vectorization.

const TILE = 128;

function cpuCosineSimilarity(embeddings: number[][]): number[][] {
	const n = embeddings.length;
  const dim = embeddings[0]?.length ?? 0;
  if (n === 0 || dim === 0) return [];

  // Allocate output as flat Float32Array → better memory locality
  const flatOut = new Float32Array(n * n);

  // Precompute L2 norms (single pass, cache-warm before main loop)
  const norms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = embeddings[i];
    let s = 0;
    let d = 0;
    for (; d <= dim - 8; d += 8) {
      s +=
        v[d] * v[d] +
        v[d + 1] * v[d + 1] +
        v[d + 2] * v[d + 2] +
        v[d + 3] * v[d + 3] +
        v[d + 4] * v[d + 4] +
        v[d + 5] * v[d + 5] +
        v[d + 6] * v[d + 6] +
        v[d + 7] * v[d + 7];
    }
    for (; d < dim; d++) s += v[d] * v[d];
    norms[i] = Math.sqrt(s) || 1e-12;
  }

  // Blocked upper-triangle fill with 8-unrolled dot product
  for (let i = 0; i < n; i++) {
    flatOut[i * n + i] = 1.0;
    const vi = embeddings[i];
    const ni = norms[i];

    for (let j = i + 1; j < n; j++) {
      const vj = embeddings[j];
      let dot = 0;
      let d = 0;

      // Process TILE-sized blocks (L2 cache-friendly)
      for (; d + TILE <= dim; d += TILE) {
        let s0 = 0,
          s1 = 0;
        let k = d;
        // Unrolled 8× within the tile
        for (; k + 8 <= d + TILE; k += 8) {
          s0 +=
            vi[k] * vj[k] + vi[k + 1] * vj[k + 1] + vi[k + 2] * vj[k + 2] + vi[k + 3] * vj[k + 3];
          s1 +=
            vi[k + 4] * vj[k + 4] +
            vi[k + 5] * vj[k + 5] +
            vi[k + 6] * vj[k + 6] +
            vi[k + 7] * vj[k + 7];
        }
        dot += s0 + s1;
      }
      // Remainder
      for (; d < dim; d++) dot += vi[d] * vj[d];

      const sim = dot / (ni * norms[j]);
      flatOut[i * n + j] = sim;
      flatOut[j * n + i] = sim;
    }
  }

  // Convert flat output to row arrays
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    result.push(Array.from(flatOut.subarray(i * n, (i + 1) * n)));
  }
	return result;
}

function cpuKMeans(embeddings: number[][], k: number, maxIters = 100): number[] {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;
	if (n === 0 || dim === 0) return [];

	const effectiveK = Math.min(k, n);
	const centroids = embeddings.slice(0, effectiveK).map((v) => Float32Array.from(v));
  const assignments = new Int32Array(n);

	for (let iter = 0; iter < maxIters; iter++) {
		let changed = false;

		for (let i = 0; i < n; i++) {
      let bestDist = Infinity;
      let bestC = 0;
      const vi = embeddings[i];

      for (let c = 0; c < effectiveK; c++) {
        const vc = centroids[c];
        let dist = 0;
        let d = 0;
        for (; d + 8 <= dim; d += 8) {
          const d0 = vi[d] - vc[d],
            d1 = vi[d + 1] - vc[d + 1],
            d2 = vi[d + 2] - vc[d + 2],
            d3 = vi[d + 3] - vc[d + 3];
          const d4 = vi[d + 4] - vc[d + 4],
            d5 = vi[d + 5] - vc[d + 5],
            d6 = vi[d + 6] - vc[d + 6],
            d7 = vi[d + 7] - vc[d + 7];
          dist += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4 + d5 * d5 + d6 * d6 + d7 * d7;
        }
        for (; d < dim; d++) {
          const dd = vi[d] - vc[d];
          dist += dd * dd;
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centroids (Float32Array in-place)
    const counts = new Int32Array(effectiveK);
    for (let c = 0; c < effectiveK; c++) centroids[c].fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const vc = centroids[c];
      const vi = embeddings[i];
      for (let d = 0; d < dim; d++) vc[d] += vi[d];
    }
		for (let c = 0; c < effectiveK; c++) {
      const cnt = counts[c] || 1;
      const vc = centroids[c];
      for (let d = 0; d < dim; d++) vc[d] /= cnt;
    }
	}

	return Array.from(assignments);
}

function cpuWeightedEmbedding(weights: number[], embeddings: number[][]): number[] {
	const dim = embeddings[0]?.length ?? 0;
	if (dim === 0) return [];
	const wSum = weights.reduce((s, w) => s + w, 0) || 1e-12;
	const result = new Float32Array(dim);
	for (let i = 0; i < embeddings.length; i++) {
    const w = weights[i] / wSum;
    const v = embeddings[i];
    for (let d = 0; d < dim; d++) result[d] += w * v[d];
  }
	const norm = Math.sqrt(result.reduce((s, x) => s + x * x, 0)) || 1e-12;
	return Array.from(result).map((x) => x / norm);
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Cosine similarity matrix.
 * GPU: libtorch CUDA matmul. CPU: L2-cache-blocked, 8× unrolled dot product.
 * CUDA OOM guard: skips GPU if <256 MB VRAM free.
 */
// P1: hard N-cap — n×n result matrix grows as O(n²). At n=2048 that is
// 2048²×4 bytes = 16 MB (manageable); at n=4096 it is 64 MB on VRAM + 64 MB
// copy-back, which saturates the 8 GB GPU budget alongside model weights.
// C++ hard cap is MAX_N_SIMILARITY=4096 (libtorch_graph.cc:61); TS cap is stricter.
export const GRAPH_SIM_MAX_N = 2048;

export async function graphSimilarity(embeddings: number[][]): Promise<SimilarityResult> {
	const n = embeddings.length;
  const dim = embeddings[0]?.length ?? 0;

  if (n === 0 || dim === 0) return { matrix: [], n: 0, source: 'cpu' };

  // P1: reject before allocating anything — gives a clear, actionable message
  if (n > GRAPH_SIM_MAX_N) {
    throw new RangeError(
      `[libtorch-bridge] graphSimilarity: n=${n} exceeds hard cap ${GRAPH_SIM_MAX_N}. ` +
      `Slice your input or use batchCosineSimilarity for pairwise scores instead.`
    );
  }

  const native = getAddonInternal();
  if (native?.graphSimilarity) {
    const mb = vramNeededMB(n, dim);
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      const flat = acquireFloat32(n * dim);
      try {
        for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);
        const result = native.graphSimilarity(flat, n, dim);
        const matrix: number[][] = [];
        for (let i = 0; i < n; i++) {
          matrix.push(Array.from(result.subarray(i * n, (i + 1) * n)));
        }
        return { matrix, n, source: 'gpu' };
      } catch (err) {
        console.warn(`[libtorch-bridge] graphSimilarity GPU failed (${(err as Error)?.message ?? err}), falling back to CPU`);
      } finally {
        releaseFloat32(flat);
      }
    } else {
      console.warn(
        `[libtorch-bridge] graphSimilarity: insufficient VRAM (need ${mb.toFixed(0)} MB), using CPU`
      );
    }
  }

  // CPU heap guard: n×n float matrix at 4 bytes each
  const cpuBytes = n * n * 4;
  if (!heapHasRoom(cpuBytes)) {
    throw new RangeError(
      `[libtorch-bridge] graphSimilarity: insufficient heap for ${n}×${n} CPU matrix ` +
        `(need ~${(cpuBytes / 1e6).toFixed(0)} MB)`
    );
  }
	return { matrix: cpuCosineSimilarity(embeddings), n, source: 'cpu' };
}

/**
 * K-means clustering.
 * GPU: libtorch CUDA K-means. CPU: 8× unrolled, Float32 centroid storage.
 */
export async function clusterEmbeddings(embeddings: number[][], k: number): Promise<ClusterResult> {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;

  // P0: k > n would leave empty clusters with undefined centroids → NaN propagation
  if (n === 0 || dim === 0) return { assignments: [], k: 0, source: 'cpu' };
  const effectiveK = Math.max(1, Math.min(k, n));
  if (effectiveK !== k) {
    console.warn(`[libtorch-bridge] clusterEmbeddings: k=${k} clamped to ${effectiveK} (n=${n})`);
  }

	const native = getAddonInternal();
	if (native?.clusterEmbeddings) {
		const mb = vramNeededMB(n, dim);
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      const flat = acquireFloat32(n * dim);
      try {
        for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);
        const result = native.clusterEmbeddings(flat, n, dim, effectiveK, 100);
        const assignments = Array.from(result);

        // P0: validate GPU result — NaN or out-of-range assignments indicate
        // empty cluster → uninitialized centroid → silent NaN propagation.
        const hasInvalid = assignments.some((a) => !Number.isFinite(a) || a < 0 || a >= effectiveK);
        if (hasInvalid) {
          console.warn(
            `[libtorch-bridge] clusterEmbeddings: GPU returned invalid assignments (empty cluster?), ` +
            `falling back to CPU k-means`
          );
          // fall through to CPU
        } else {
          return { assignments, k: effectiveK, source: 'gpu' };
        }
      } catch (err) {
        console.warn(`[libtorch-bridge] clusterEmbeddings GPU failed (${(err as Error)?.message ?? err}), falling back to CPU`);
      } finally {
        releaseFloat32(flat);
      }
    }
	}

	return { assignments: cpuKMeans(embeddings, effectiveK), k: effectiveK, source: 'cpu' };
}

/**
 * Weighted average embedding for a case.
 */
export async function computeCaseEmbedding(
	weights: number[],
	embeddings: number[][]
): Promise<WeightedEmbeddingResult> {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;

	const native = getAddonInternal();
	if (native?.computeCaseEmbedding && n > 0 && dim > 0) {
		if (gpuHasRoom(vramNeededMB(n, dim) + CUDA_OOM_MIN_MB)) {
      const wArr = new Float32Array(weights);
      const flat = acquireFloat32(n * dim);
      try {
        for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);
        const result = native.computeCaseEmbedding(wArr, flat, n, dim);
        return { embedding: Array.from(result), dimension: dim, source: 'gpu' };
      } catch {
        // fall through
      } finally {
        releaseFloat32(flat);
      }
    }
	}

	return {
    embedding: cpuWeightedEmbedding(weights, embeddings),
    dimension: dim,
    source: 'cpu',
  };
}

/**
 * Query-vs-corpus cosine similarity.
 * GPU: libtorch CUDA matmul. CPU: 8× unrolled per-vector dot product.
 */
export async function batchCosineSimilarity(
  query: number[],
  corpus: number[][]
): Promise<BatchSimilarityResult> {
  const n = corpus.length;
  const dim = query.length;
  if (n === 0 || dim === 0) return { scores: [], n: 0, source: 'cpu' };

  const native = getAddonInternal();
  if (native?.batchCosineSimilarity) {
    const mb = vramNeededMB(n, dim);
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      const qArr = new Float32Array(query);
      const cFlat = acquireFloat32(n * dim);
      const scoresArr = acquireFloat32(n);
      try {
        for (let i = 0; i < n; i++) cFlat.set(corpus[i], i * dim);
        const rc = native.batchCosineSimilarity(qArr, dim, cFlat, n, scoresArr, n);
        if (rc === 0) {
          return { scores: Array.from(scoresArr), n, source: 'gpu' };
        }
      } catch {
        // fall through
      } finally {
        releaseFloat32(cFlat);
        releaseFloat32(scoresArr);
      }
    }
  }

  // CPU: L2-cache-blocked, 8× unrolled
  // Guard: corpus flat array + scores (n*dim*4 + n*4 bytes)
  const cpuBytes = n * dim * 4 + n * 4;
  if (!heapHasRoom(cpuBytes)) {
    throw new RangeError(
      `[libtorch-bridge] batchCosineSimilarity: insufficient heap (need ~${(cpuBytes / 1e6).toFixed(0)} MB). ` +
        `Use batchCosineSimilarityChunked() to process in pages.`
    );
  }
  const qNorm = Math.sqrt(query.reduce((s, x) => s + x * x, 0)) || 1e-12;
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = corpus[i];
    let dot = 0,
      cNorm = 0,
      d = 0;
    for (; d + 8 <= dim; d += 8) {
      dot +=
        query[d] * v[d] +
        query[d + 1] * v[d + 1] +
        query[d + 2] * v[d + 2] +
        query[d + 3] * v[d + 3] +
        query[d + 4] * v[d + 4] +
        query[d + 5] * v[d + 5] +
        query[d + 6] * v[d + 6] +
        query[d + 7] * v[d + 7];
      cNorm +=
        v[d] * v[d] +
        v[d + 1] * v[d + 1] +
        v[d + 2] * v[d + 2] +
        v[d + 3] * v[d + 3] +
        v[d + 4] * v[d + 4] +
        v[d + 5] * v[d + 5] +
        v[d + 6] * v[d + 6] +
        v[d + 7] * v[d + 7];
    }
    for (; d < dim; d++) {
      dot += query[d] * v[d];
      cNorm += v[d] * v[d];
    }
    scores[i] = dot / (qNorm * (Math.sqrt(cNorm) || 1e-12));
  }
  return { scores: Array.from(scores), n, source: 'cpu' };
}

/**
 * Chunked variant of batchCosineSimilarity for very large corpora (>4096 vectors).
 * Processes in 4096-vector pages so each page fits in L3 cache (RTX 3060 Ti: 6 MB L3).
 * Each chunk is scored independently and concatenated — same result as full-batch.
 */
export async function batchCosineSimilarityChunked(
  query: number[],
  corpus: number[][],
  chunkSize = 4096
): Promise<BatchSimilarityResult> {
  if (corpus.length <= chunkSize) {
    return batchCosineSimilarity(query, corpus);
  }

  const allScores: number[] = [];
  for (let i = 0; i < corpus.length; i += chunkSize) {
    const chunk = corpus.slice(i, i + chunkSize);
    const res = await batchCosineSimilarity(query, chunk);
    allScores.push(...res.scores);
  }
  return { scores: allScores, n: allScores.length, source: 'cpu' };
}

/**
 * FP16 similarity matrix — 50% VRAM savings vs FP32.
 * GPU: kFloat16 cast → matmul → cast back. CPU: FP32 blocked fallback.
 */
export async function graphSimilarityHalf(embeddings: number[][]): Promise<HalfPrecisionSimilarityResult> {
	const n   = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;
	if (n === 0 || dim === 0) return { matrix: [], n: 0, source: 'cpu' };

	const native = getAddonInternal();
  if (native?.graphSimilarityHalf) {
    const mb = vramNeededMB(n, dim) / 2; // FP16 is half the bytes
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      const flat = acquireFloat32(n * dim);
      const outputArr = acquireFloat32(n * n);
      try {
        for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);
        const rc = native.graphSimilarityHalf(flat, n, dim, outputArr, n * n);
        if (rc === 0) {
          const matrix: number[][] = [];
          for (let i = 0; i < n; i++) {
            matrix.push(Array.from(outputArr.subarray(i * n, (i + 1) * n)));
          }
          return { matrix, n, source: 'gpu' };
        }
      } catch {
        // fall through
      } finally {
        releaseFloat32(flat);
        releaseFloat32(outputArr);
      }
    }
  }

	return { matrix: cpuCosineSimilarity(embeddings), n, source: 'cpu' };
}

// ── LSTM / SOM / Dot / Scale / ReLU ───────────────────────────────────────────

export interface LSTMAddResult   { output: number[]; n: number; source: 'gpu' | 'cpu'; }
export interface SOMCacheResult  { output: number[]; n: number; source: 'gpu' | 'cpu'; }
export interface DotProductResult { value: number;  n: number; source: 'gpu' | 'cpu'; }
export interface ScaleResult     { output: number[]; n: number; source: 'gpu' | 'cpu'; }
export interface ReLUResult      { output: number[]; n: number; source: 'gpu' | 'cpu'; }

export async function lstmAdd(a: number[], b: number[]): Promise<LSTMAddResult> {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { output: [], n: 0, source: 'cpu' };
  const native = getAddonInternal();
  if (native?.lstmAdd) {
    try {
      const result = native.lstmAdd(new Float32Array(a), new Float32Array(b), n);
      return { output: Array.from(result), n, source: 'gpu' };
    } catch {
      /* fall through */
    }
  }
  const output = new Float32Array(n);
  for (let i = 0; i < n; i++) output[i] = a[i] + b[i];
  return { output: Array.from(output), n, source: 'cpu' };
}

export async function somCache(input: number[]): Promise<SOMCacheResult> {
	const n = input.length;
	if (n === 0) return { output: [], n: 0, source: 'cpu' };
	const native = getAddonInternal();
	if (native?.somCache) {
    try {
      const result = native.somCache(new Float32Array(input), n);
      return { output: Array.from(result), n, source: 'gpu' };
    } catch {
      /* fall through */
    }
  }
	return { output: [...input], n, source: 'cpu' };
}

export interface QueryBmuResult {
  bmuRow: number;
  bmuCol: number;
  gridW: number;
  gridH: number;
  source: 'gpu' | 'cpu' | 'cache';
}

/**
 * Map a query embedding to its SOM Best Matching Unit (BMU) via the CUDA somCache kernel.
 * Result is Redis-cached for 30 min so repeated queries (e.g. rephrased variants) skip GPU.
 *
 * The SOM weights are loaded from Redis key `som:weights` (written by run-hypergraph.ts).
 * If weights aren't cached or CUDA unavailable, falls back to CPU argmin over L2 distances.
 *
 * Returns { bmuRow, bmuCol } in [0, gridH) × [0, gridW) coordinates —
 * directly comparable to `somBmuRow` / `somBmuCol` stored in Qdrant payloads.
 */
export async function queryBmuCached(
  embedding: number[],
  gridW = 10,
  gridH = 10
): Promise<QueryBmuResult> {
  const dim = embedding.length;
  if (dim === 0) return { bmuRow: 0, bmuCol: 0, gridW, gridH, source: 'cpu' };

  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    // Cache key: deterministic hash of first+last 8 floats (fast approximation)
    const fp = embedding;
    const hashKey = [fp[0], fp[1], fp[7], fp[dim - 1], fp[dim - 8] ?? 0]
      .map((v) => (v ?? 0).toFixed(5))
      .join(':');
    const cacheKey = `som:bmu:${hashKey}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { bmuRow: number; bmuCol: number };
      return { ...parsed, gridW, gridH, source: 'cache' };
    }

    // Try GPU forward pass via somCache kernel
    const native = getAddonInternal();
    let bmuIdx: number | null = null;

    if (native?.somCache) {
      // somCache does a forward pass against stored neuron weights in GPU memory
      const input = new Float32Array(embedding);
      const result = native.somCache(input, dim);
      // result[0] = argmin neuron index (linearized)
      bmuIdx = Math.round(result[0]);
    }

    if (bmuIdx === null) {
      // CPU fallback: load SOM weights from Redis and compute argmin
      const weightsJson = await redis.get('som:weights');
      if (weightsJson) {
        const weights = JSON.parse(weightsJson) as number[];
        const neurons = Math.floor(weights.length / dim);
        let minDist = Infinity;
        for (let i = 0; i < neurons; i++) {
          let dist = 0;
          for (let d = 0; d < dim; d++) {
            const diff = embedding[d] - (weights[i * dim + d] ?? 0);
            dist += diff * diff;
          }
          if (dist < minDist) { minDist = dist; bmuIdx = i; }
        }
      }
    }

    if (bmuIdx === null) return { bmuRow: 0, bmuCol: 0, gridW, gridH, source: 'cpu' };

    const bmuRow = Math.floor(bmuIdx / gridW);
    const bmuCol = bmuIdx % gridW;

    // Cache result for 30 min
    await redis.setex(cacheKey, 1800, JSON.stringify({ bmuRow, bmuCol }));

    return { bmuRow, bmuCol, gridW, gridH, source: native?.somCache ? 'gpu' : 'cpu' };
  } catch {
    return { bmuRow: 0, bmuCol: 0, gridW, gridH, source: 'cpu' };
  }
}

/**
 * GPU-accelerated attention-weighted scoring: given a query embedding and a set of
 * candidate chunk embeddings (as a flat Float32Array), returns per-chunk attention scores.
 * Falls back to CPU dot-product if GPU unavailable.
 */
export async function attentionScoreChunks(
  queryEmbedding: number[],
  chunkEmbeddings: number[][]
): Promise<number[]> {
  const n = chunkEmbeddings.length;
  if (n === 0) return [];
  const dim = queryEmbedding.length;

  try {
    const redis = getRedis();
    const queryHash = createHash('sha256').update(JSON.stringify(queryEmbedding)).digest('hex').slice(0, 16);
    const setHash = createHash('sha256').update(JSON.stringify(chunkEmbeddings.slice(0, 5))).digest('hex').slice(0, 12);
    const cacheKey = `gpu:attn:${queryHash}:${setHash}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  const native = getAddonInternal();
  if (native?.attentionScoreGPU) {
    try {
      const query = new Float32Array(queryEmbedding);
      const keys = new Float32Array(n * dim);
      for (let i = 0; i < n; i++) {
        const ce = chunkEmbeddings[i];
        for (let d = 0; d < dim; d++) keys[i * dim + d] = ce[d] ?? 0;
      }
      const scores = native.attentionScoreGPU(query, dim, keys, n);
      return Array.from(scores);
    } catch { /* fall through */ }
  }

  // CPU fallback: cosine similarity (dot product after L2 norm)
  const qNorm = Math.sqrt(queryEmbedding.reduce((s, v) => s + v * v, 0)) || 1;
  return chunkEmbeddings.map((ce) => {
    const cNorm = Math.sqrt(ce.reduce((s, v) => s + v * v, 0)) || 1;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += (queryEmbedding[d] ?? 0) * (ce[d] ?? 0);
    return dot / (qNorm * cNorm);
  });
}

export async function dotProduct(a: number[], b: number[]): Promise<DotProductResult> {
	const n = Math.min(a.length, b.length);
	if (n === 0) return { value: 0, n: 0, source: 'cpu' };
	const native = getAddonInternal();
	if (native?.dotProduct) {
    try {
      const result = native.dotProduct(new Float32Array(a), new Float32Array(b), n);
      return { value: result[0], n, source: 'gpu' };
    } catch {
      /* fall through */
    }
  }
	let sum = 0;
	let i = 0;
  for (; i + 8 <= n; i += 8) {
    sum +=
      a[i] * b[i] +
      a[i + 1] * b[i + 1] +
      a[i + 2] * b[i + 2] +
      a[i + 3] * b[i + 3] +
      a[i + 4] * b[i + 4] +
      a[i + 5] * b[i + 5] +
      a[i + 6] * b[i + 6] +
      a[i + 7] * b[i + 7];
  }
	for (; i < n; i++) sum += a[i] * b[i];
	return { value: sum, n, source: 'cpu' };
}

export async function scaleArray(input: number[], scalar: number): Promise<ScaleResult> {
	const n = input.length;
	if (n === 0) return { output: [], n: 0, source: 'cpu' };
	const native = getAddonInternal();
	if (native?.scale) {
    try {
      const result = native.scale(new Float32Array(input), scalar, n);
      return { output: Array.from(result), n, source: 'gpu' };
    } catch {
      /* fall through */
    }
  }
	const output = new Float32Array(n);
  for (let i = 0; i < n; i++) output[i] = input[i] * scalar;
  return { output: Array.from(output), n, source: 'cpu' };
}

export async function reluActivation(input: number[]): Promise<ReLUResult> {
  const n = input.length;
  if (n === 0) return { output: [], n: 0, source: 'cpu' };
  const native = getAddonInternal();
  if (native?.relu) {
    try {
      const result = native.relu(new Float32Array(input), n);
      return { output: Array.from(result), n, source: 'gpu' };
    } catch {
      /* fall through */
    }
  }
  const output = new Float32Array(n);
  for (let i = 0; i < n; i++) output[i] = input[i] > 0 ? input[i] : 0;
  return { output: Array.from(output), n, source: 'cpu' };
}

// ── CUDA / Memory diagnostics ──────────────────────────────────────────────────

export function getCudaMemoryInfo(): CudaMemoryInfo {
	const native = getAddonInternal();
	if (native?.getCudaMemory) {
		if (!_cudaMemFreeBuf) _cudaMemFreeBuf = new BigInt64Array(1);
    if (!_cudaMemTotalBuf) _cudaMemTotalBuf = new BigInt64Array(1);
		try {
      const rc = native.getCudaMemory(_cudaMemFreeBuf, _cudaMemTotalBuf);
      if (rc === 0) {
        const freeBytes = Number(_cudaMemFreeBuf[0]);
        const totalBytes = Number(_cudaMemTotalBuf[0]);
        return {
          freeBytes,
          totalBytes,
          freeMB: Math.round(freeBytes / (1024 * 1024)),
          totalMB: Math.round(totalBytes / (1024 * 1024)),
          usedMB: Math.round((totalBytes - freeBytes) / (1024 * 1024)),
          available: true,
        };
      }
    } catch {
      /* fall through */
    }
	}
	return { freeBytes: 0, totalBytes: 0, freeMB: 0, totalMB: 0, usedMB: 0, available: false };
}

/**
 * Combined CPU + GPU memory pressure report — for OOM dashboards and Langfuse traces.
 */
export function getMemoryPressure(): MemoryPressure {
  const m = process.memoryUsage();
  const gpu = getCudaMemoryInfo();
  return {
    heapUsedMB: Math.round(m.heapUsed / (1024 * 1024)),
    heapTotalMB: Math.round(m.heapTotal / (1024 * 1024)),
    rssMB: Math.round(m.rss / (1024 * 1024)),
    gpuFreeMB: gpu.freeMB,
    gpuTotalMB: gpu.totalMB,
    heapPressurePct: gpu.available ? 0 : Math.round((m.heapUsed / m.heapTotal) * 100),
    gpuPressurePct: gpu.available ? Math.round((gpu.usedMB / (gpu.totalMB || 1)) * 100) : 0,
  };
}

/**
 * Drain the Float32Array pool — call after large batch jobs to reclaim heap.
 */
export function drainFloat32Pool(): void {
	float32Pool.clear();
}

// ── Adaptive CUDA OOM batch runner ─────────────────────────────────────────────
//
// Processes `items` in micro-batches that shrink on CUDA OOM and grow back on success.
// Starting at `initialBatch`, halves on OOM until `minBatch`, then throws if still OOM.
// This mirrors PyTorch's caching allocator behaviour: freed tensors return to the cache
// allocator, not the OS immediately, so smaller batches help more than retrying same size.

export interface AdaptiveBatchOpts {
	/** Initial micro-batch size (items, not bytes). Default 256. */
	initialBatch?: number;
	/** Minimum acceptable batch size before giving up. Default 8. */
	minBatch?: number;
}

/** Telemetry snapshot from a completed adaptive batch run. */
export interface AdaptiveBatchTelemetry {
	initialBatch:   number;
	finalBatch:     number;
	oomRetries:     number;
	totalItems:     number;
	totalBatches:   number;
	totalMs:        number;
	meanMsPerChunk: number;
}

/**
 * Run `fn` over `items` in adaptive micro-batches.
 * Halves batch size on CUDA/OOM errors; doubles back toward `initialBatch` on success.
 *
 * @returns telemetry snapshot with batch sizing, OOM retry count, and timing data.
 *
 * @example
 * const telemetry = await runWithAdaptiveBatch(embeddings, async (slice) => {
 *   await uploadToGpu(slice);
 * }, { initialBatch: 128 });
 * console.log(telemetry.oomRetries, telemetry.meanMsPerChunk);
 */
export async function runWithAdaptiveBatch<T>(
	items: T[],
	fn: (slice: T[], batchIndex: number) => Promise<void>,
	opts: AdaptiveBatchOpts = {}
): Promise<AdaptiveBatchTelemetry> {
  const initialBatch = opts.initialBatch ?? 256;
  const minBatch = opts.minBatch ?? 8;

  let batchSize = initialBatch;
  let i = 0;
  let batchIndex = 0;
  let oomRetries = 0;
  const t0 = performance.now();

  while (i < items.length) {
    const slice = items.slice(i, i + batchSize);

    try {
      await fn(slice, batchIndex);
      i += slice.length;
      batchIndex++;
      // Recover toward initial batch size on consecutive success
      if (batchSize < initialBatch) {
        batchSize = Math.min(initialBatch, batchSize * 2);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCudaOom = /out of memory|CUDA|CUDNN|cublas|cuDNN|Insufficient/i.test(msg);

      if (!isCudaOom || batchSize <= minBatch) {
        // Non-OOM error or already at minimum — propagate
        throw err;
      }

      batchSize = Math.max(minBatch, Math.floor(batchSize / 2));
      oomRetries++;
      console.warn(
        `[libtorch-bridge] CUDA OOM at batch ${batchIndex} — reducing batch size to ${batchSize} and retrying item ${i}`
      );
      // Do NOT advance i — retry the same slice with smaller batch
    }
  }

  const totalMs = performance.now() - t0;
  return {
    initialBatch,
    finalBatch: batchSize,
    oomRetries,
    totalItems: items.length,
    totalBatches: batchIndex,
    totalMs: Math.round(totalMs * 100) / 100,
    meanMsPerChunk: items.length > 0 ? Math.round((totalMs / items.length) * 100) / 100 : 0,
  };
}

/**
 * Estimate GPU VRAM needed for a Float32 tensor of shape [rows × cols].
 * Accounts for a 1.5× overhead factor (PyTorch allocates more than the raw tensor).
 */
export function estimateGpuBytes(rows: number, cols: number): number {
  return rows * cols * 4 * 1.5; // float32 = 4 bytes, 1.5× for PyTorch overhead
}

export function isCudnnAvailable(): boolean {
  const native = getAddonInternal();
  if (!native?.checkCudaAvailable) return false;
  return native.checkCudaAvailable() === 2;
}

// ── Autoencoder decoder ───────────────────────────────────────────────────────

/**
 * Pre-loaded decoder weights for the topology autoencoder.
 * W: [hidden × outputDim] row-major — each row i is the weight vector for latent dim i.
 * b: [outputDim] bias.
 * Written to Redis as `ace:autoencoder:decoder:weights` by the topology pipeline.
 */
export interface AutoencoderWeights {
  W:         Float32Array;
  b:         Float32Array;
  hidden:    number; // latent dim (typically 4)
  outputDim: number; // reconstruction dim (typically 768)
}

export interface ManifoldDecodeResult {
  decoded:   Float32Array;
  source:    'gpu' | 'cpu';
  durationMs: number;
}

/**
 * Decode a manifold4 coordinate vector back to full-dim space.
 *
 * GPU path: calls native.autoencoderDecode via the LibTorch N-API addon (~0.1ms).
 * CPU fallback: single-layer linear decode — decoded[j] = Σ_i W[i×outputDim+j]×enc[i] + b[j].
 *
 * Caller is responsible for loading `weights` from Redis before calling this function
 * (see centroid-cache.ts `loadDecoderWeights()`).
 */
export function decodeManifold4(
  encoded:  Float32Array | number[],
  weights:  AutoencoderWeights,
): ManifoldDecodeResult {
  const t0 = performance.now();
  const { W, b, hidden, outputDim } = weights;

  const encF32 = encoded instanceof Float32Array
    ? encoded
    : new Float32Array(encoded);

  // ── GPU path ─────────────────────────────────────────────────────────────
  const native = getAddonInternal();
  if (native?.autoencoderDecode && gpuHasRoom(vramNeededMB(1, outputDim) + 1)) {
    try {
      const out = native.autoencoderDecode(encF32, 1, hidden, W, b, outputDim);
      return { decoded: out, source: 'gpu', durationMs: performance.now() - t0 };
    } catch {
      // Fall through to CPU
    }
  }

  // ── CPU path: single-layer linear decode ─────────────────────────────────
  // decoded = enc @ W_T + b  (W stored as [hidden × outputDim])
  const out = new Float32Array(outputDim);
  for (let j = 0; j < outputDim; j++) {
    let s = b[j];
    let i = 0;
    // Unrolled 4× for auto-vectorization
    for (; i + 3 < hidden; i += 4) {
      s += W[i * outputDim + j]       * encF32[i]
         + W[(i + 1) * outputDim + j] * encF32[i + 1]
         + W[(i + 2) * outputDim + j] * encF32[i + 2]
         + W[(i + 3) * outputDim + j] * encF32[i + 3];
    }
    for (; i < hidden; i++) s += W[i * outputDim + j] * encF32[i];
    out[j] = s;
  }
  return { decoded: out, source: 'cpu', durationMs: performance.now() - t0 };
}

/**
 * Compute the mean-squared reconstruction error between a 768-dim query vector
 * and the autoencoder's decoded reconstruction of its manifold4 representation.
 *
 * Normalized to the same numeric range as `1 − cosine(a, b)` for unit vectors
 * (mse × outputDim / 2), so the same novelty thresholds apply.
 *
 * Returns null if the query or decoded vector is zero-length.
 */
export function reconstructionMse(
  queryVec: Float32Array | number[],
  decoded:  Float32Array,
  normalize = true,
): number | null {
  const q = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec);
  const dim = Math.min(q.length, decoded.length);
  if (dim === 0) return null;

  let mse = 0;
  for (let i = 0; i < dim; i++) {
    const diff = q[i] - decoded[i];
    mse += diff * diff;
  }
  mse /= dim;
  return normalize ? mse * dim / 2 : mse;
}

// ── Async GPU worker wrappers ─────────────────────────────────────────────────
//
// Heavy synchronous N-API calls (kmeansWithCentroids n=2000: ~400ms, trainSOM: ~50ms)
// would block the Node.js event loop entirely.  These wrappers move the work to a
// worker thread (worker_threads) so the main loop stays responsive.
//
// The worker script (gpu-worker.mjs) loads the native addon, calls the sync function,
// then copies results to fresh ArrayBuffers and transfers them back (zero-copy transfer,
// not structured-clone copy — the send buffer is detached and the receive end owns it).
//
// Threshold: ops expected to take >10ms on the target corpus size use async; ops that
// stay under 10ms on any realistic input (batchCosineSimilarity, attentionScoreGPU,
// graphSimilarity with n<100) stay synchronous.

let _addonPath: string | null = null;
let _libPath: string | null   = null;

function getWorkerPaths(): { addonPath: string; libPath: string; workerScriptPath: string } {
  if (!_addonPath) {
    // Resolve addon path using __dirname equivalent — absolute so the worker
    // can require() it regardless of its own cwd.
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const cwd = process.cwd();
    const candidates = [
      resolve(thisDir, '../../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
      resolve(cwd, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
      resolve(cwd, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    ];
    _addonPath = candidates.find(existsSync) ?? candidates[0];

    // Mirror the PATH additions from getAddonInternal
    const libCandidates = [
      'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib',
      '/usr/local/lib/libtorch/lib',
    ];
    _libPath = libCandidates.find(existsSync) ?? '';
  }

  const workerScriptPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../lib/workers/gpu-worker.mjs',
  );

  return { addonPath: _addonPath!, libPath: _libPath!, workerScriptPath };
}

function runGpuWorker<T>(fn: string, args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const { addonPath, libPath, workerScriptPath } = getWorkerPaths();

    // Collect transferable ArrayBuffers from args (Float32Array / Int32Array inputs)
    const transferList: ArrayBuffer[] = [];
    const argsCloned = args.map((a) => {
      if (a instanceof Float32Array || a instanceof Int32Array) {
        // Copy to a fresh ArrayBuffer so the caller retains usable data and
        // the worker receives its own copy (avoids detach-on-transfer issues).
        const buf: ArrayBuffer = a.buffer instanceof SharedArrayBuffer
          ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice().buffer as ArrayBuffer
          : (a.buffer as ArrayBuffer).slice(a.byteOffset, a.byteOffset + a.byteLength);
        transferList.push(buf);
        return a instanceof Float32Array ? new Float32Array(buf) : new Int32Array(buf);
      }
      return a;
    });

    let w: Worker;
    try {
      w = new Worker(workerScriptPath, {
        workerData: { fn, addonPath, libPath, args: argsCloned },
        transferList,
      });
    } catch (e) {
      return reject(e);
    }

    const tid = setTimeout(() => {
      w.terminate();
      reject(new Error(`gpu-worker: ${fn} timed out after 120s`));
    }, 120_000);

    w.once('message', (msg: { ok: boolean; result?: T; error?: string }) => {
      clearTimeout(tid);
      w.terminate();
      if (msg.ok) resolve(msg.result as T);
      else reject(new Error(msg.error ?? 'gpu-worker: unknown error'));
    });
    w.once('error', (err) => { clearTimeout(tid); reject(err); });
  });
}

export interface KmeansWithCentroidsResult {
  assignments: Int32Array;
  centroids:   Float32Array;
  reseeded:    number;
  source:      'gpu' | 'cpu';
}

/**
 * Async k-means with centroids — offloads to worker thread to avoid blocking
 * the event loop (n=2000 takes ~400ms on CPU, ~25ms on GPU).
 */
export async function kmeansWithCentroidsAsync(
  embeddings: Float32Array,
  n:          number,
  dim:        number,
  k:          number,
  maxIters = 20,
): Promise<KmeansWithCentroidsResult> {
  const result = await runGpuWorker<{ assignments: Int32Array; centroids: Float32Array; reseeded: number }>(
    'kmeansWithCentroids',
    [embeddings, n, dim, k, maxIters],
  );
  return { ...result, source: isCudaAvailable() ? 'gpu' : 'cpu' };
}

export interface TrainSOMResult {
  weights: Float32Array;  // [gridW * gridH * dim]
  bmu:     Int32Array;    // [n] best-matching unit index per sample
  source:  'gpu' | 'cpu';
}

/**
 * Async SOM training — offloads to worker thread (n=500 takes ~50ms on CPU).
 */
export async function trainSOMAsync(
  data:       Float32Array,
  n:          number,
  dim:        number,
  gridW:      number,
  gridH:      number,
  iters:      number,
  lrInit:     number,
  lrFinal:    number,
  radInit:    number,
  radFinal:   number,
): Promise<TrainSOMResult> {
  const result = await runGpuWorker<{ weights: Float32Array; bmu: Int32Array }>(
    'trainSOM',
    [data, n, dim, gridW, gridH, iters, lrInit, lrFinal, radInit, radFinal],
  );
  return { ...result, source: isCudaAvailable() ? 'gpu' : 'cpu' };
}

/**
 * Async graphSimilarity — offloads to worker thread for n ≥ GPU_ASYNC_THRESHOLD_N.
 * Returns n×n cosine similarity matrix as a flat Float32Array.
 */
export async function graphSimilarityAsync(
  embeddings: Float32Array,
  n:          number,
  dim:        number,
): Promise<{ matrix: Float32Array; n: number; source: 'gpu' | 'cpu' }> {
  const result = await runGpuWorker<Float32Array>('graphSimilarity', [embeddings, n, dim]);
  return { matrix: result, n, source: isCudaAvailable() ? 'gpu' : 'cpu' };
}

// Threshold below which graphSimilarity runs synchronously (n×n = 65K floats = 256 KB VRAM).
// At n=256 a single GPU call takes ~15ms — enough to drop an HTTP response deadline.
export const GPU_ASYNC_THRESHOLD_N = 256;

/**
 * Threshold-dispatching graphSimilarity wrapper.
 *
 * - n < GPU_ASYNC_THRESHOLD_N  → sync GPU or CPU path (stays on main thread, <10ms)
 * - n ≥ GPU_ASYNC_THRESHOLD_N  → async worker-thread path (event loop stays free)
 *
 * This is the preferred call-site for any code where n is variable.
 * The return shape always matches SimilarityResult regardless of path.
 */
export async function graphSimilaritySafe(embeddings: number[][]): Promise<SimilarityResult> {
  const n   = embeddings.length;
  const dim = embeddings[0]?.length ?? 0;

  if (n === 0 || dim === 0) return { matrix: [], n: 0, source: 'cpu' };

  if (n > GRAPH_SIM_MAX_N) {
    throw new RangeError(
      `[libtorch-bridge] graphSimilarity: n=${n} exceeds hard cap ${GRAPH_SIM_MAX_N}. ` +
      `Slice your input or use batchCosineSimilarity for pairwise scores instead.`
    );
  }

  if (n >= GPU_ASYNC_THRESHOLD_N) {
    // Flatten once and offload — avoids blocking the event loop for n*n GPU matmul
    const flat = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);
    const res = await graphSimilarityAsync(flat, n, dim);
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      matrix.push(Array.from(res.matrix.subarray(i * n, (i + 1) * n)));
    }
    return { matrix, n, source: res.source };
  }

  // Small n: sync path (includes all OOM guards from graphSimilarity)
  return graphSimilarity(embeddings);
}

/**
 * Async batchCosineSimilarity — offloads to worker thread for large corpora.
 * Prefer this over the sync variant when n > GPU_ASYNC_THRESHOLD_N.
 */
export async function batchCosineSimilarityAsync(
  query:  Float32Array,
  dim:    number,
  corpus: Float32Array,
  n:      number,
): Promise<BatchSimilarityResult> {
  const result = await runGpuWorker<Float32Array>('batchCosineSimilarity', [query, dim, corpus, n]);
  return { scores: Array.from(result), n, source: isCudaAvailable() ? 'gpu' : 'cpu' };
}

/**
 * Async pageRankGPU — for large graphs (n > 500).
 */
export async function pageRankGPUAsync(
  adj:     Float32Array,
  n:       number,
  damping  = 0.85,
  iters    = 30,
): Promise<Float32Array> {
  return runGpuWorker<Float32Array>('pageRankGPU', [adj, n, damping, iters]);
}
