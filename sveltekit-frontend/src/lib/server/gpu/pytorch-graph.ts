/**
 * PyTorch Graph N-API Bridge — server-only.
 *
 * Exposes 5 GPU-accelerated ML ops from pytorch_graph.cc via tensorrt_bridge.node:
 *   pageRankGPU       — power-iteration PageRank on GPU (code dependency graphs)
 *   attentionScoreGPU — scaled dot-product attention (ACE context weighting)
 *   rewardScoreGPU    — cosine reward scoring, GRPO-compatible
 *   softmaxGPU        — GPU softmax for confidence calibration
 *   topKIndices       — GPU top-k retrieval ranking
 *
 * All functions have CPU-only JS fallbacks when the addon is unavailable.
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const esmRequire = createRequire(import.meta.url);

// ── Float32Array pool (matches libtorch-bridge.ts) ────────────────────────
// Reuses typed arrays across calls to eliminate GC churn.

const float32Pool = new Map<number, Float32Array[]>();
const POOL_MAX_PER_BUCKET = 6;

function nextPow2(n: number): number {
	let p = 1;
	while (p < n) p <<= 1;
	return p;
}

function acquireFloat32(n: number): Float32Array {
	const cap = nextPow2(n);
	const bucket = float32Pool.get(cap);
	if (bucket && bucket.length > 0) {
		const arr = bucket.pop()!;
		arr.fill(0, 0, n);
		return arr.subarray(0, n) as Float32Array;
	}
	return new Float32Array(cap).subarray(0, n) as Float32Array;
}

function releaseFloat32(arr: Float32Array): void {
	const cap = arr.buffer.byteLength / 4;
	const bucket = float32Pool.get(cap) ?? [];
	if (bucket.length < POOL_MAX_PER_BUCKET) {
		bucket.push(new Float32Array(arr.buffer));
		float32Pool.set(cap, bucket);
	}
}

/** Drain the pool — call after large batch jobs to reclaim heap. */
export function drainFloat32Pool(): void {
	float32Pool.clear();
}

// ── CUDA OOM + heap guards ────────────────────────────────────────────────

const CUDA_OOM_MIN_MB = 256;

function heapHasRoom(requiredBytes: number): boolean {
	const m = process.memoryUsage();
	return (m.heapTotal - m.heapUsed) >= requiredBytes;
}

/** Check free VRAM via the addon's getCudaMemory. */
function gpuHasRoom(requiredMB: number): boolean {
	const a = getAddon() as Record<string, unknown> | null;
	const fn = a?.getCudaMemory as ((f: BigInt64Array, t: BigInt64Array) => number) | undefined;
	if (!fn) return false;
	try {
		const f = new BigInt64Array(1), t = new BigInt64Array(1);
		if (fn(f, t) !== 0) return false;
		return Number(f[0]) / (1024 * 1024) >= requiredMB;
	} catch { return false; }
}

function vramNeededMB(elements: number): number {
	return (elements * 4) / (1024 * 1024);
}

// ── Addon interface (shared with libtorch-bridge) ─────────────────────────

interface KmeansResult {
	assignments: Int32Array;
	centroids: Float32Array;
}

interface SOMResult {
	weights: Float32Array;
	bmu: Int32Array;
}

interface PytorchAddon {
	pageRankGPU?: (adj: Float32Array, n: number, damping: number, iters: number) => Float32Array;
	attentionScoreGPU?: (query: Float32Array, dim: number, keys: Float32Array, n: number) => Float32Array;
	rewardScoreGPU?: (gen: Float32Array, ref: Float32Array, n: number, dim: number) => Float32Array;
	softmaxGPU?: (logits: Float32Array, n: number) => Float32Array;
	topKIndicesGPU?: (scores: Float32Array, n: number, k: number) => Int32Array;
	kmeansWithCentroids?: (embeddings: Float32Array, n: number, dim: number, k: number, maxIters: number) => KmeansResult;
	trainSOM?: (data: Float32Array, n: number, dim: number, gridW: number, gridH: number, iters: number, lrInit: number, lrFinal: number, radInit: number, radFinal: number) => SOMResult;
	checkCudaAvailable?: () => number;
}

let addon: PytorchAddon | null = null;
let loadAttempted = false;

function getAddon(): PytorchAddon | null {
	if (loadAttempted) return addon;
	loadAttempted = true;

	const paths = [
		resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node'),
	];

	for (const p of paths) {
		try {
			if (!existsSync(p)) continue;
			addon = esmRequire(p) as PytorchAddon;
			const cuda = addon.checkCudaAvailable?.() ?? 0;
			console.log(`[pytorch-graph] addon loaded from ${p} (CUDA=${cuda >= 1})`);
			return addon;
		} catch (e) {
			console.warn(`[pytorch-graph] failed to load ${p}:`, e);
		}
	}

	console.warn('[pytorch-graph] addon not found — using CPU JS fallbacks');
	return null;
}

// ── CPU fallbacks ─────────────────────────────────────────────────────────

function l2norm(v: Float32Array): Float32Array {
	let sum = 0;
	for (const x of v) sum += x * x;
	const mag = Math.sqrt(sum) || 1e-8;
	return new Float32Array(v.map((x) => x / mag));
}

function cpuPageRank(adj: Float32Array, n: number, damping: number, iters: number): Float32Array {
	// Build row-normalised column-stochastic P
	const P = new Float32Array(n * n);
	for (let i = 0; i < n; i++) {
		let rowSum = 0;
		for (let j = 0; j < n; j++) rowSum += adj[i * n + j];
		if (rowSum < 1e-8) rowSum = 1;
		for (let j = 0; j < n; j++) P[j * n + i] = adj[i * n + j] / rowSum; // column-stochastic
	}

	let r = new Float32Array(n).fill(1 / n);
	const teleport = (1 - damping) / n;

	for (let iter = 0; iter < iters; iter++) {
		const next = new Float32Array(n).fill(teleport);
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) next[j] += damping * P[j * n + i] * r[i];
		}
		r = next;
	}
	return r;
}

function cpuSoftmax(logits: Float32Array): Float32Array {
	const max = Math.max(...logits);
	const exp = new Float32Array(logits.map((x) => Math.exp(x - max)));
	let sum = 0;
	for (const e of exp) sum += e;
	return new Float32Array(exp.map((e) => e / sum));
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * GPU power-iteration PageRank for code dependency graphs.
 * Returns normalised rank scores (sum to 1.0).
 */
export function pageRankGPU(
	adj: Float32Array,
	n: number,
	damping = 0.85,
	iters = 50
): { scores: Float32Array; source: 'gpu' | 'cpu' } {
	const a = getAddon();
	if (a?.pageRankGPU) {
    const mb = vramNeededMB(n * n); // adj is n×n
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      try {
        return { scores: a.pageRankGPU(adj, n, damping, iters), source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] pageRankGPU GPU failed, falling back:', e);
      }
    } else {
      console.warn(
        `[pytorch-graph] pageRankGPU: insufficient VRAM (need ${mb.toFixed(0)} MB), using CPU`
      );
    }
  }

  // CPU heap guard
  const cpuBytes = n * n * 4 + n * 4; // P matrix + rank vector
  if (!heapHasRoom(cpuBytes)) {
    throw new RangeError(
      `[pytorch-graph] pageRankGPU: insufficient heap for ${n}×${n} matrix (need ~${(cpuBytes / 1e6).toFixed(0)} MB)`
    );
  }
	return { scores: cpuPageRank(adj, n, damping, iters), source: 'cpu' };
}

/**
 * Scaled dot-product attention weights for ACE context chunk ranking.
 * Returns softmax weights over the n key vectors.
 */
export function attentionScoreGPU(
	query: Float32Array,
	dim: number,
	keys: Float32Array,
	n: number
): { weights: Float32Array; source: 'gpu' | 'cpu' } {
	const a = getAddon();
	if (a?.attentionScoreGPU) {
    const mb = vramNeededMB(dim + n * dim); // query + keys
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      try {
        return { weights: a.attentionScoreGPU(query, dim, keys, n), source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] attentionScoreGPU GPU failed, falling back:', e);
      }
    }
  }

  // CPU fallback: Q @ K^T / sqrt(dim) → softmax — pooled output
  const scale = 1 / Math.sqrt(dim);
  const rawScores = acquireFloat32(n);
  try {
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += query[d] * keys[i * dim + d];
      rawScores[i] = dot * scale;
    }
    // cpuSoftmax returns a new array, so release the pooled scratch
    return { weights: cpuSoftmax(rawScores), source: 'cpu' };
  } finally {
    releaseFloat32(rawScores);
  }
}

/**
 * Cosine reward scoring — GRPO-compatible signal.
 * Returns cosine similarity in [-1, 1] for each generated/reference pair.
 */
export function rewardScoreGPU(
	gen: Float32Array,
	ref: Float32Array,
	n: number,
	dim: number
): { scores: Float32Array; source: 'gpu' | 'cpu' } {
  const a = getAddon();
  if (a?.rewardScoreGPU) {
    const mb = vramNeededMB(2 * n * dim); // gen + ref
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      try {
        return { scores: a.rewardScoreGPU(gen, ref, n, dim), source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] rewardScoreGPU GPU failed, falling back:', e);
      }
    }
  }

  // CPU heap guard: 2 temp norm vectors + output
  const cpuBytes = (2 * dim + n) * 4;
  if (!heapHasRoom(cpuBytes)) {
    throw new RangeError(
      `[pytorch-graph] rewardScoreGPU: insufficient heap (need ~${(cpuBytes / 1e6).toFixed(0)} MB)`
    );
  }

  // CPU fallback: element-wise cosine similarity — pooled output
  const scores = acquireFloat32(n);
  for (let i = 0; i < n; i++) {
    const gSlice = l2norm(gen.slice(i * dim, (i + 1) * dim) as Float32Array);
    const rSlice = l2norm(ref.slice(i * dim, (i + 1) * dim) as Float32Array);
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += gSlice[d] * rSlice[d];
    scores[i] = dot;
  }
  // Caller owns the array — do NOT release pooled scores here
  return { scores, source: 'cpu' };
}

/**
 * GPU softmax for confidence calibration / probability output.
 */
export function softmaxGPU(logits: Float32Array): { probs: Float32Array; source: 'gpu' | 'cpu' } {
	const n = logits.length;
	const a = getAddon();
	if (a?.softmaxGPU) {
		if (gpuHasRoom(vramNeededMB(n) + CUDA_OOM_MIN_MB)) {
      try {
        return { probs: a.softmaxGPU(logits, n), source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] softmaxGPU GPU failed, falling back:', e);
      }
    }
	}
	return { probs: cpuSoftmax(logits), source: 'cpu' };
}

/**
 * GPU top-k selection — returns k indices of highest-scoring candidates.
 * Descending order (best first).
 */
export function topKIndices(
	scores: Float32Array,
	k: number
): { indices: Int32Array; source: 'gpu' | 'cpu' } {
	const n = scores.length;
	const a = getAddon();
	if (a?.topKIndicesGPU && k <= n) {
		if (gpuHasRoom(vramNeededMB(n) + CUDA_OOM_MIN_MB)) {
      try {
        return { indices: a.topKIndicesGPU(scores, n, k), source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] topKIndicesGPU GPU failed, falling back:', e);
      }
    }
	}

	// CPU fallback: sort indices by score descending
	const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
	return { indices: new Int32Array(idx.slice(0, k)), source: 'cpu' };
}

/**
 * K-means clustering returning both cluster assignments AND centroid vectors.
 * Extends clusterEmbeddings (assignments only) with centroid output.
 *
 * @param embeddings - Flat Float32Array of shape [n × dim]
 * @param n          - Number of data points
 * @param dim        - Embedding dimension
 * @param k          - Number of clusters
 * @param maxIters   - Maximum iterations (default 100)
 * @returns { assignments: Int32Array[n], centroids: Float32Array[k×dim], source }
 */
export function kmeansWithCentroids(
	embeddings: Float32Array,
	n: number,
	dim: number,
	k: number,
	maxIters = 100
): { assignments: Int32Array; centroids: Float32Array; source: 'gpu' | 'cpu' } {
	// Empty-input guard — prevents NaN propagation and undefined centroid state.
	// Matches the C++ guard in kmeansWithCentroids() (pytorch_graph.cc: GPU_ERR_INVALID_ARGS).
	if (n <= 0 || dim <= 0 || k <= 0) {
		return { assignments: new Int32Array(0), centroids: new Float32Array(0), source: 'cpu' };
	}
	const a = getAddon();
	if (a?.kmeansWithCentroids) {
    const mb = vramNeededMB(n * dim + k * dim); // embeddings + centroids
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      try {
        const result = a.kmeansWithCentroids(embeddings, n, dim, k, maxIters);
        return { ...result, source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] kmeansWithCentroids GPU failed, falling back:', e);
      }
    } else {
      console.warn(
        `[pytorch-graph] kmeansWithCentroids: insufficient VRAM (need ${mb.toFixed(0)} MB), using CPU`
      );
    }
  }

  // CPU heap guard: centroids + assignments + temp counts
  const cpuBytes = k * dim * 4 + n * 4 + k * 4;
  if (!heapHasRoom(cpuBytes)) {
    throw new RangeError(
      `[pytorch-graph] kmeansWithCentroids: insufficient heap (need ~${(cpuBytes / 1e6).toFixed(0)} MB)`
    );
  }

	// CPU fallback: Lloyd's algorithm
	const kClamped = Math.min(k, n);
	// Init centroids: first k data points
	const centroids = new Float32Array(kClamped * dim);
	for (let c = 0; c < kClamped; c++) {
		for (let d = 0; d < dim; d++) centroids[c * dim + d] = embeddings[c * dim + d];
	}
	const assignments = new Int32Array(n);

	for (let iter = 0; iter < maxIters; iter++) {
		// Assign each point to nearest centroid
		let changed = false;
		for (let i = 0; i < n; i++) {
			let bestC = 0;
			let bestDist = Infinity;
			for (let c = 0; c < kClamped; c++) {
				let dist = 0;
				for (let d = 0; d < dim; d++) {
					const diff = embeddings[i * dim + d] - centroids[c * dim + d];
					dist += diff * diff;
				}
				if (dist < bestDist) { bestDist = dist; bestC = c; }
			}
			if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
		}
		if (!changed) break;
		// Recompute centroids
		const counts = new Int32Array(kClamped);
		centroids.fill(0);
		for (let i = 0; i < n; i++) {
			const c = assignments[i];
			counts[c]++;
			for (let d = 0; d < dim; d++) centroids[c * dim + d] += embeddings[i * dim + d];
		}
		for (let c = 0; c < kClamped; c++) {
			if (counts[c] > 0) {
				for (let d = 0; d < dim; d++) centroids[c * dim + d] /= counts[c];
			} else {
				// Empty cluster guard — re-seed from farthest data point (mirrors C++ pytorch_graph.cc).
				// Without this, the centroid stays at zero → silent NaN propagation in next iter.
				let farthestIdx = 0, farthestDist = -1;
				for (let i = 0; i < n; i++) {
					const ac = assignments[i];
					let dist = 0;
					for (let d = 0; d < dim; d++) {
						const diff = embeddings[i * dim + d] - centroids[ac * dim + d];
						dist += diff * diff;
					}
					if (dist > farthestDist) { farthestDist = dist; farthestIdx = i; }
				}
				for (let d = 0; d < dim; d++) centroids[c * dim + d] = embeddings[farthestIdx * dim + d];
			}
		}
	}
	return { assignments, centroids, source: 'cpu' };
}

/**
 * Kohonen Self-Organizing Map (SOM) training.
 * Returns trained neuron weight vectors and best-matching-unit (BMU) index per input.
 *
 * @param data       - Flat Float32Array [n × dim]
 * @param n          - Number of data points
 * @param dim        - Input dimension
 * @param gridW      - SOM grid width
 * @param gridH      - SOM grid height (total neurons = gridW × gridH)
 * @param iters      - Training iterations (default 1000)
 * @param lrInit     - Initial learning rate (default 0.1)
 * @param lrFinal    - Final learning rate (default 0.01)
 * @param radInit    - Initial neighbourhood radius (default max(gridW,gridH)/2)
 * @param radFinal   - Final neighbourhood radius (default 1.0)
 * @returns { weights: Float32Array[gridW*gridH*dim], bmu: Int32Array[n], source }
 */
export function trainSOM(
	data: Float32Array,
	n: number,
	dim: number,
	gridW: number,
	gridH: number,
	iters = 1000,
	lrInit = 0.1,
	lrFinal = 0.01,
	radInit = Math.max(gridW, gridH) / 2,
	radFinal = 1.0
): { weights: Float32Array; bmu: Int32Array; source: 'gpu' | 'cpu' } {
	const neurons = gridW * gridH;
	const a = getAddon();
	if (a?.trainSOM) {
    const mb = vramNeededMB(n * dim + neurons * dim); // data + weights
    if (gpuHasRoom(mb + CUDA_OOM_MIN_MB)) {
      try {
        const result = a.trainSOM(
          data,
          n,
          dim,
          gridW,
          gridH,
          iters,
          lrInit,
          lrFinal,
          radInit,
          radFinal
        );
        return { ...result, source: 'gpu' };
      } catch (e) {
        console.warn('[pytorch-graph] trainSOM GPU failed, falling back:', e);
      }
    } else {
      console.warn(
        `[pytorch-graph] trainSOM: insufficient VRAM (need ${mb.toFixed(0)} MB), using CPU`
      );
    }
  }

  // CPU heap guard: weights + bmu + gridPos
  const cpuBytes = neurons * dim * 4 + n * 4 + neurons * 2 * 4;
  if (!heapHasRoom(cpuBytes)) {
    throw new RangeError(
      `[pytorch-graph] trainSOM: insufficient heap for ${neurons} neurons × ${dim} dim (need ~${(cpuBytes / 1e6).toFixed(0)} MB)`
    );
  }

	// CPU fallback: Kohonen competitive learning
	// (neurons already declared above: const neurons = gridW * gridH)
	// Init weights: first neurons rows of data (deterministic)
	const weights = new Float32Array(neurons * dim);
	const step = Math.max(1, Math.floor(n / neurons));
	for (let j = 0; j < neurons; j++) {
		const src = Math.min(j * step, n - 1);
		for (let d = 0; d < dim; d++) weights[j * dim + d] = data[src * dim + d];
	}

	// Precompute 2D grid positions
	const gridPos = new Float32Array(neurons * 2);
	for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) {
		const idx = r * gridW + c;
		gridPos[idx * 2] = r;
		gridPos[idx * 2 + 1] = c;
	}

	for (let t = 0; t < iters; t++) {
		const progress = t / (iters - 1 + 1e-6);
		const lr = lrInit + progress * (lrFinal - lrInit);
		const radius = radInit + progress * (radFinal - radInit);
		const r2 = radius * radius;

		// Random input sample
		const xi = Math.floor(Math.random() * n);

		// Find BMU
		let bmuIdx = 0;
		let bmuDist = Infinity;
		for (let j = 0; j < neurons; j++) {
			let dist = 0;
			for (let d = 0; d < dim; d++) {
				const diff = data[xi * dim + d] - weights[j * dim + d];
				dist += diff * diff;
			}
			if (dist < bmuDist) { bmuDist = dist; bmuIdx = j; }
		}

		// Update weights with neighbourhood function
		const bmuR = gridPos[bmuIdx * 2], bmuC = gridPos[bmuIdx * 2 + 1];
		for (let j = 0; j < neurons; j++) {
			const dr = gridPos[j * 2] - bmuR, dc = gridPos[j * 2 + 1] - bmuC;
			const h = Math.exp(-(dr * dr + dc * dc) / (2 * r2));
			const lrh = lr * h;
			for (let d = 0; d < dim; d++) {
				weights[j * dim + d] += lrh * (data[xi * dim + d] - weights[j * dim + d]);
			}
		}
	}

	// Assign BMU to each data point
	const bmu = new Int32Array(n);
	for (let i = 0; i < n; i++) {
		let best = 0, bestDist = Infinity;
		for (let j = 0; j < neurons; j++) {
			let dist = 0;
			for (let d = 0; d < dim; d++) {
				const diff = data[i * dim + d] - weights[j * dim + d];
				dist += diff * diff;
			}
			if (dist < bestDist) { bestDist = dist; best = j; }
		}
		bmu[i] = best;
	}
	return { weights, bmu, source: 'cpu' };
}

/** True if GPU functions are available (addon loaded + CUDA present). */
export function isPytorchGpuAvailable(): boolean {
	const a = getAddon();
	return !!a?.checkCudaAvailable && (a.checkCudaAvailable() ?? 0) >= 1;
}
