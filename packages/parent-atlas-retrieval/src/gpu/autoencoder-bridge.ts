/**
 * autoencoder-bridge.ts — GPU autoencoder + PCA projection (server-only).
 *
 * autoencoderEncode  — linear encode:   tanh(input @ W^T + b)  →  [n, hidden]
 * autoencoderDecode  — linear decode:   tanh(encoded @ W^T + b) → [n, outputDim]
 * pcaProject         — PCA projection:  (data − mean) @ V^T    →  [n, k]
 *
 * All ops run on CUDA when available; fall back to CPU LibTorch if not.
 * Weights must be Float32Array in row-major order (standard PyTorch layout).
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const esmRequire = createRequire(import.meta.url);

interface GpuAddon {
	autoencoderEncode(
		input: Float32Array, n: number, inputDim: number,
		W: Float32Array, b: Float32Array, hidden: number
	): Float32Array;
	autoencoderDecode(
		encoded: Float32Array, n: number, hidden: number,
		W: Float32Array, b: Float32Array, outputDim: number
	): Float32Array;
	pcaProject(
		data: Float32Array, n: number, dim: number,
		mean: Float32Array, components: Float32Array, k: number
	): Float32Array;
}

let addon: GpuAddon | null = null;
let loadAttempted = false;

function getAddon(): GpuAddon | null {
	if (loadAttempted) return addon;
	loadAttempted = true;
	const paths = [
		resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
	];
	for (const p of paths) {
		try {
			if (!existsSync(p)) continue;
			const mod = esmRequire(p) as Record<string, unknown>;
			if (typeof mod.autoencoderEncode === 'function') {
				addon = mod as unknown as GpuAddon;
				return addon;
			}
		} catch { /* fall through */ }
	}
	return null;
}

// ── CPU fallbacks ─────────────────────────────────────────────────────────────

function cpuLinear(X: Float32Array, n: number, inDim: number,
                   W: Float32Array, b: Float32Array, outDim: number): Float32Array {
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

function cpuPca(data: Float32Array, n: number, dim: number,
                mean: Float32Array, components: Float32Array, k: number): Float32Array {
	const out = new Float32Array(n * k);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < k; j++) {
			let v = 0;
			for (let d = 0; d < dim; d++) v += (data[i * dim + d] - mean[d]) * components[j * dim + d];
			out[i * k + j] = v;
		}
	}
	return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encode n embeddings from inputDim → hidden dimensions.
 * W shape: [hidden, inputDim]  (PyTorch Linear.weight layout)
 * b shape: [hidden]
 */
export function encode(
	input: Float32Array, n: number, inputDim: number,
	W: Float32Array, b: Float32Array, hidden: number
): Float32Array {
	const gpu = getAddon();
	if (gpu) return gpu.autoencoderEncode(input, n, inputDim, W, b, hidden);
	return cpuLinear(input, n, inputDim, W, b, hidden);
}

/**
 * Decode n encoded vectors from hidden → outputDim dimensions.
 * W shape: [outputDim, hidden]
 * b shape: [outputDim]
 */
export function decode(
	encoded: Float32Array, n: number, hidden: number,
	W: Float32Array, b: Float32Array, outputDim: number
): Float32Array {
	const gpu = getAddon();
	if (gpu) return gpu.autoencoderDecode(encoded, n, hidden, W, b, outputDim);
	return cpuLinear(encoded, n, hidden, W, b, outputDim);
}

/**
 * Project n vectors (dim-dimensional) onto k principal components.
 * mean:       [dim]   — mean vector from PCA fit (zeros = skip centering)
 * components: [k, dim] — k principal component row vectors
 * Returns:    [n, k]   — projected coordinates
 */
export function projectPCA(
	data: Float32Array, n: number, dim: number,
	mean: Float32Array, components: Float32Array, k: number
): Float32Array {
	const gpu = getAddon();
	if (gpu) return gpu.pcaProject(data, n, dim, mean, components, k);
	return cpuPca(data, n, dim, mean, components, k);
}

export const isGpuAvailable = (): boolean => getAddon() !== null;
