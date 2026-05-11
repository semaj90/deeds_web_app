import { autoencoderEncode } from './topology-projection.js';
import { getCachedAutoencoderWeights } from './autoencoder-weights.js';

/**
 * Two-layer encoder: 768 ΓåÆ 256 ΓåÆ 64. 
 * Chains two autoencoderEncode calls (which include tanh).
 */
export async function encode768to64(
	vec: Float32Array, // [768] or [n ΓÇö 768]
	opts?: { n?: number; preferGpu?: boolean }
): Promise<Float32Array> {
	const weights = await getCachedAutoencoderWeights();
	const n = opts?.n ?? (vec.length / 768);

	// Layer 1: 768 ΓåÆ 256
	const result1 = await autoencoderEncode(vec, weights.W1, weights.b1, {
		n,
		dim: 768,
		outDim: 256,
		preferGpu: opts?.preferGpu
	});

	if (!result1.ok) throw new Error('Autoencoder Layer 1 failed');

	// Layer 2: 256 ΓåÆ 64
	const result2 = await autoencoderEncode(result1.projected, weights.W2, weights.b2, {
		n,
		dim: 256,
		outDim: 64,
		preferGpu: opts?.preferGpu
	});

	if (!result2.ok) throw new Error('Autoencoder Layer 2 failed');

	return result2.projected;
}

/**
 * Batched variant for backfill ΓÇö single GPU call per layer per batch.
 */
export async function encode768to64Batch(
	matrix: Float32Array, // [n ΓÇö 768]
	n: number,
	opts?: { preferGpu?: boolean }
): Promise<{ encoded: Float32Array; n: number; durationMs: number; gpuPath: boolean }> {
	const t0 = performance.now();
	const weights = await getCachedAutoencoderWeights();

	// Layer 1
	const result1 = await autoencoderEncode(matrix, weights.W1, weights.b1, {
		n,
		dim: 768,
		outDim: 256,
		preferGpu: opts?.preferGpu
	});

	// Layer 2
	const result2 = await autoencoderEncode(result1.projected, weights.W2, weights.b2, {
		n,
		dim: 256,
		outDim: 64,
		preferGpu: opts?.preferGpu
	});

	const durationMs = performance.now() - t0;

	return {
		encoded: result2.projected,
		n,
		durationMs,
		gpuPath: result1.source === 'gpu' || result2.source === 'gpu'
	};
}
