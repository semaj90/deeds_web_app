/**
 * LibTorch N-API Bridge — server-only.
 *
 * Loads the compiled tensorrt_bridge.node addon and exposes:
 *   - graphSimilarity(embeddings) → cosine similarity matrix
 *   - clusterEmbeddings(embeddings, k) → cluster assignments
 *   - computeCaseEmbedding(weights, embeddings) → weighted embedding
 *
 * Falls back to CPU-only JS implementations if addon unavailable.
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const esmRequire = createRequire(import.meta.url);

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Addon loading ──────────────────────────────────────────────────────────

interface NativeAddon {
	bridgeSIMD: (json: string) => number;
	checkCudaAvailable: () => number;
	graphSimilarity?: (embeddings: Float32Array, n: number, dim: number) => Float32Array;
	clusterEmbeddings?: (embeddings: Float32Array, n: number, dim: number, k: number, maxIters: number) => Int32Array;
	computeCaseEmbedding?: (weights: Float32Array, embeddings: Float32Array, n: number, dim: number) => Float32Array;
	lstmAdd?: (a: Float32Array, b: Float32Array, n: number) => Float32Array;
	somCache?: (input: Float32Array, n: number) => Float32Array;
	dotProduct?: (a: Float32Array, b: Float32Array, n: number) => Float32Array;
	scale?: (input: Float32Array, scalar: number, n: number) => Float32Array;
	relu?: (input: Float32Array, n: number) => Float32Array;
	getCudaMemory?: (freeOut: BigInt64Array, totalOut: BigInt64Array) => number;
	batchCosineSimilarity?: (query: Float32Array, dim: number, corpus: Float32Array, n: number, scores: Float32Array, scoresLen: number) => number;
	graphSimilarityHalf?: (embeddings: Float32Array, n: number, dim: number, output: Float32Array, outputLen: number) => number;
}

let addon: NativeAddon | null = null;
let loadAttempted = false;

/** Add LibTorch + cuDNN DLL directories to PATH so the addon can find its dependencies */
function ensureLibtorchInPath(): void {
	const libDirs = [
		resolve(process.cwd(), '../libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib'),
		'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib',
	];
	// cuDNN DLLs (v9.16 for CUDA 13.0) — enables torch::cuda::cudnn_is_available()
	const cudnnDirs = [
		'C:/Program Files/NVIDIA/CUDNN/v9.16/bin/13.0',
		'C:/Program Files/NVIDIA/CUDNN/v9.8/bin/12.8',
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

function getAddon(): NativeAddon | null {
	if (loadAttempted) return addon;
	loadAttempted = true;

	// LibTorch DLLs must be in PATH before loading the addon
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

// ── CPU fallbacks ──────────────────────────────────────────────────────────

function cpuCosineSimilarity(embeddings: number[][]): number[][] {
	const n = embeddings.length;
	const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

	// Precompute norms
	const norms = embeddings.map(v => {
		const sum = v.reduce((s, x) => s + x * x, 0);
		return Math.sqrt(sum) || 1e-12;
	});

	for (let i = 0; i < n; i++) {
		result[i][i] = 1.0;
		for (let j = i + 1; j < n; j++) {
			let dot = 0;
			for (let d = 0; d < embeddings[i].length; d++) {
				dot += embeddings[i][d] * embeddings[j][d];
			}
			const sim = dot / (norms[i] * norms[j]);
			result[i][j] = sim;
			result[j][i] = sim;
		}
	}

	return result;
}

function cpuKMeans(embeddings: number[][], k: number, maxIters = 100): number[] {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;
	if (n === 0 || dim === 0) return [];

	const effectiveK = Math.min(k, n);
	const centroids = embeddings.slice(0, effectiveK).map(v => [...v]);
	const assignments = new Array(n).fill(0);

	for (let iter = 0; iter < maxIters; iter++) {
		let changed = false;

		// Assign
		for (let i = 0; i < n; i++) {
			let bestDist = Infinity;
			let bestC = 0;
			for (let c = 0; c < effectiveK; c++) {
				let dist = 0;
				for (let d = 0; d < dim; d++) {
					const diff = embeddings[i][d] - centroids[c][d];
					dist += diff * diff;
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

		// Update centroids
		for (let c = 0; c < effectiveK; c++) {
			const members = [];
			for (let i = 0; i < n; i++) {
				if (assignments[i] === c) members.push(i);
			}
			if (members.length > 0) {
				for (let d = 0; d < dim; d++) {
					centroids[c][d] = members.reduce((s, i) => s + embeddings[i][d], 0) / members.length;
				}
			}
		}
	}

	return assignments;
}

function cpuWeightedEmbedding(weights: number[], embeddings: number[][]): number[] {
	const dim = embeddings[0]?.length ?? 0;
	if (dim === 0) return [];

	const wSum = weights.reduce((s, w) => s + w, 0) || 1e-12;
	const result = new Array(dim).fill(0);

	for (let i = 0; i < embeddings.length; i++) {
		const w = weights[i] / wSum;
		for (let d = 0; d < dim; d++) {
			result[d] += w * embeddings[i][d];
		}
	}

	// L2 normalize
	const norm = Math.sqrt(result.reduce((s, x) => s + x * x, 0)) || 1e-12;
	return result.map(x => x / norm);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity matrix for embeddings.
 * GPU-accelerated via libtorch if available, CPU fallback otherwise.
 */
export async function graphSimilarity(embeddings: number[][]): Promise<SimilarityResult> {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;

	const native = getAddon();
	if (native?.graphSimilarity && n > 0 && dim > 0) {
		try {
			const flat = new Float32Array(n * dim);
			for (let i = 0; i < n; i++) {
				flat.set(embeddings[i], i * dim);
			}
			const result = native.graphSimilarity(flat, n, dim);
			const matrix: number[][] = [];
			for (let i = 0; i < n; i++) {
				matrix.push(Array.from(result.slice(i * n, (i + 1) * n)));
			}
			return { matrix, n, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	return { matrix: cpuCosineSimilarity(embeddings), n, source: 'cpu' };
}

/**
 * K-means clustering on embeddings.
 * GPU-accelerated via libtorch if available.
 */
export async function clusterEmbeddings(embeddings: number[][], k: number): Promise<ClusterResult> {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;

	const native = getAddon();
	if (native?.clusterEmbeddings && n > 0 && dim > 0) {
		try {
			const flat = new Float32Array(n * dim);
			for (let i = 0; i < n; i++) {
				flat.set(embeddings[i], i * dim);
			}
			const result = native.clusterEmbeddings(flat, n, dim, k, 100);
			return { assignments: Array.from(result), k, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	return { assignments: cpuKMeans(embeddings, k), k, source: 'cpu' };
}

/**
 * Compute weighted average embedding for a case.
 * GPU-accelerated via libtorch if available.
 */
export async function computeCaseEmbedding(
	weights: number[],
	embeddings: number[][]
): Promise<WeightedEmbeddingResult> {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;

	const native = getAddon();
	if (native?.computeCaseEmbedding && n > 0 && dim > 0) {
		try {
			const wArr = new Float32Array(weights);
			const flat = new Float32Array(n * dim);
			for (let i = 0; i < n; i++) {
				flat.set(embeddings[i], i * dim);
			}
			const result = native.computeCaseEmbedding(wArr, flat, n, dim);
			return { embedding: Array.from(result), dimension: dim, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	return {
		embedding: cpuWeightedEmbedding(weights, embeddings),
		dimension: dim,
		source: 'cpu'
	};
}

/**
 * Check if CUDA/GPU is available via native addon.
 */
export function isCudaAvailable(): boolean {
	const native = getAddon();
	if (!native?.checkCudaAvailable) return false;
	return native.checkCudaAvailable() >= 1;
}

/**
 * Check if cuDNN is available (CUDA+cuDNN detected at init).
 * Returns true only if the addon reports cuDNN benchmark mode is active.
 */
export function isCudnnAvailable(): boolean {
	const native = getAddon();
	if (!native?.checkCudaAvailable) return false;
	return native.checkCudaAvailable() === 2;
}

// ── LSTM / SOM types ──────────────────────────────────────────────────

export interface LSTMAddResult {
	output: number[];
	n: number;
	source: 'gpu' | 'cpu';
}

export interface SOMCacheResult {
	output: number[];
	n: number;
	source: 'gpu' | 'cpu';
}

// ── LSTM Add ──────────────────────────────────────────────────────────

/**
 * Element-wise add two float arrays via CUDA kernel.
 * GPU-accelerated via LSTM CUDA kernel if available, CPU fallback otherwise.
 */
export async function lstmAdd(a: number[], b: number[]): Promise<LSTMAddResult> {
	const n = Math.min(a.length, b.length);
	if (n === 0) return { output: [], n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.lstmAdd) {
		try {
			const aArr = new Float32Array(a);
			const bArr = new Float32Array(b);
			const result = native.lstmAdd(aArr, bArr, n);
			return { output: Array.from(result), n, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	// CPU fallback: simple element-wise add
	const output = new Array(n);
	for (let i = 0; i < n; i++) {
		output[i] = a[i] + b[i];
	}
	return { output, n, source: 'cpu' };
}

// ── SOM Cache ─────────────────────────────────────────────────────────

/**
 * Run SOM cache operation (GPU copy/transform kernel).
 * GPU-accelerated if CUDA available, CPU memcpy fallback otherwise.
 */
export async function somCache(input: number[]): Promise<SOMCacheResult> {
	const n = input.length;
	if (n === 0) return { output: [], n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.somCache) {
		try {
			const inArr = new Float32Array(input);
			const result = native.somCache(inArr, n);
			return { output: Array.from(result), n, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	// CPU fallback: identity copy
	return { output: [...input], n, source: 'cpu' };
}

// ── Dot Product ───────────────────────────────────────────────────────

export interface DotProductResult {
	value: number;
	n: number;
	source: 'gpu' | 'cpu';
}

/**
 * GPU-accelerated dot product of two float arrays.
 * Uses parallel reduction on CUDA, sequential sum on CPU.
 */
export async function dotProduct(a: number[], b: number[]): Promise<DotProductResult> {
	const n = Math.min(a.length, b.length);
	if (n === 0) return { value: 0, n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.dotProduct) {
		try {
			const aArr = new Float32Array(a);
			const bArr = new Float32Array(b);
			const result = native.dotProduct(aArr, bArr, n);
			return { value: result[0], n, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	let sum = 0;
	for (let i = 0; i < n; i++) {
		sum += a[i] * b[i];
	}
	return { value: sum, n, source: 'cpu' };
}

// ── Scale ─────────────────────────────────────────────────────────────

export interface ScaleResult {
	output: number[];
	n: number;
	source: 'gpu' | 'cpu';
}

/**
 * GPU-accelerated scalar multiplication of a float array.
 */
export async function scaleArray(input: number[], scalar: number): Promise<ScaleResult> {
	const n = input.length;
	if (n === 0) return { output: [], n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.scale) {
		try {
			const inArr = new Float32Array(input);
			const result = native.scale(inArr, scalar, n);
			return { output: Array.from(result), n, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	const output = new Array(n);
	for (let i = 0; i < n; i++) {
		output[i] = input[i] * scalar;
	}
	return { output, n, source: 'cpu' };
}

// ── ReLU ──────────────────────────────────────────────────────────────

export interface ReLUResult {
	output: number[];
	n: number;
	source: 'gpu' | 'cpu';
}

/**
 * GPU-accelerated ReLU activation: max(0, x) for each element.
 */
export async function reluActivation(input: number[]): Promise<ReLUResult> {
	const n = input.length;
	if (n === 0) return { output: [], n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.relu) {
		try {
			const inArr = new Float32Array(input);
			const result = native.relu(inArr, n);
			return { output: Array.from(result), n, source: 'gpu' };
		} catch {
			// fall through to CPU
		}
	}

	const output = new Array(n);
	for (let i = 0; i < n; i++) {
		output[i] = input[i] > 0 ? input[i] : 0;
	}
	return { output, n, source: 'cpu' };
}

// ── CUDA Memory ───────────────────────────────────────────────────────

/**
 * Query CUDA GPU free/total VRAM via native addon.
 * Returns memory info if CUDA available, zeros with available=false otherwise.
 */
export function getCudaMemoryInfo(): CudaMemoryInfo {
	const native = getAddon();
	if (native?.getCudaMemory) {
		try {
			const freeBuf = new BigInt64Array(1);
			const totalBuf = new BigInt64Array(1);
			const rc = native.getCudaMemory(freeBuf, totalBuf);
			if (rc === 0) {
				const freeBytes = Number(freeBuf[0]);
				const totalBytes = Number(totalBuf[0]);
				return {
					freeBytes,
					totalBytes,
					freeMB: Math.round(freeBytes / (1024 * 1024)),
					totalMB: Math.round(totalBytes / (1024 * 1024)),
					usedMB: Math.round((totalBytes - freeBytes) / (1024 * 1024)),
					available: true
				};
			}
		} catch {
			// fall through
		}
	}
	return { freeBytes: 0, totalBytes: 0, freeMB: 0, totalMB: 0, usedMB: 0, available: false };
}

// ── Batch Cosine Similarity ───────────────────────────────────────────

/**
 * Cosine similarity between a single query vector and a corpus of vectors.
 * GPU: L2-normalized matmul via libtorch CUDA. CPU: sequential fallback.
 */
export async function batchCosineSimilarity(
	query: number[],
	corpus: number[][]
): Promise<BatchSimilarityResult> {
	const n = corpus.length;
	const dim = query.length;
	if (n === 0 || dim === 0) return { scores: [], n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.batchCosineSimilarity) {
		try {
			const qArr = new Float32Array(query);
			const cFlat = new Float32Array(n * dim);
			for (let i = 0; i < n; i++) {
				cFlat.set(corpus[i], i * dim);
			}
			const scoresArr = new Float32Array(n);
			const rc = native.batchCosineSimilarity(qArr, dim, cFlat, n, scoresArr, n);
			if (rc === 0) {
				return { scores: Array.from(scoresArr), n, source: 'gpu' };
			}
		} catch {
			// fall through to CPU
		}
	}

	// CPU fallback
	const qNorm = Math.sqrt(query.reduce((s, x) => s + x * x, 0)) || 1e-12;
	const scores = new Array(n);
	for (let i = 0; i < n; i++) {
		let dot = 0;
		let cNorm = 0;
		for (let d = 0; d < dim; d++) {
			dot += query[d] * corpus[i][d];
			cNorm += corpus[i][d] * corpus[i][d];
		}
		scores[i] = dot / (qNorm * (Math.sqrt(cNorm) || 1e-12));
	}
	return { scores, n, source: 'cpu' };
}

// ── Half-Precision Similarity Matrix ──────────────────────────────────

/**
 * Similarity matrix using FP16 (half-precision) for 50% VRAM savings.
 * GPU: casts to kFloat16, matmul, casts back. CPU: falls back to FP32.
 */
export async function graphSimilarityHalf(embeddings: number[][]): Promise<HalfPrecisionSimilarityResult> {
	const n = embeddings.length;
	const dim = embeddings[0]?.length ?? 0;
	if (n === 0 || dim === 0) return { matrix: [], n: 0, source: 'cpu' };

	const native = getAddon();
	if (native?.graphSimilarityHalf) {
		try {
			const flat = new Float32Array(n * dim);
			for (let i = 0; i < n; i++) {
				flat.set(embeddings[i], i * dim);
			}
			const outputArr = new Float32Array(n * n);
			const rc = native.graphSimilarityHalf(flat, n, dim, outputArr, n * n);
			if (rc === 0) {
				const matrix: number[][] = [];
				for (let i = 0; i < n; i++) {
					matrix.push(Array.from(outputArr.slice(i * n, (i + 1) * n)));
				}
				return { matrix, n, source: 'gpu' };
			}
		} catch {
			// fall through to CPU
		}
	}

	// CPU fallback: FP32 cosine similarity
	return { matrix: cpuCosineSimilarity(embeddings), n, source: 'cpu' };
}