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
	k: number;
	source: 'gpu' | 'cpu';
}

export interface WeightedEmbeddingResult {
	embedding: number[];
	dimension: number;
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
}

let addon: NativeAddon | null = null;
let loadAttempted = false;

/** Add LibTorch DLL directory to PATH so the addon can find its dependencies */
function ensureLibtorchInPath(): void {
	const libDirs = [
		resolve(process.cwd(), '../libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib'),
		'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib',
	];
	const sep = process.platform === 'win32' ? ';' : ':';
	const currentPath = process.env.PATH ?? '';

	for (const dir of libDirs) {
		if (existsSync(dir) && !currentPath.includes(dir)) {
			process.env.PATH = dir + sep + currentPath;
			console.log(`[libtorch-bridge] Added to PATH: ${dir}`);
			return;
		}
	}
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
			const cuda = addon.checkCudaAvailable?.() === 1;
			console.log(`[libtorch-bridge] Loaded native addon from ${p} (CUDA: ${cuda})`);
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
	return native.checkCudaAvailable() === 1;
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