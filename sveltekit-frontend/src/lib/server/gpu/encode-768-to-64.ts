import { autoencoderEncode2Layer } from './topology-projection.js';
import { getCachedAutoencoderWeights } from './autoencoder-weights.js';

/**
 * Two-layer encoder: 768 → 256(ReLU) → 64(linear) + L2-norm.
 * Uses the canonical autoencoderEncode2Layer — matches train-autoencoder.py architecture.
 */
export async function encode768to64(
	vec: Float32Array, // [768] or [n × 768]
	opts?: { n?: number; preferGpu?: boolean }
): Promise<Float32Array> {
	const weights = await getCachedAutoencoderWeights();
	const n = opts?.n ?? (vec.length / 768);
	const result = await autoencoderEncode2Layer(vec, {
		...weights,
		hidden: weights.b1.length,
		outDim: weights.b2.length,
	}, { n, dim: 768, preferGpu: opts?.preferGpu });
	if (!result.ok) throw new Error('Autoencoder 2-layer encode failed');
	return result.projected;
}

/**
 * Batched variant for backfill — single 2-layer pass, no intermediate allocation.
 */
export async function encode768to64Batch(
	matrix: Float32Array, // [n × 768]
	n: number,
	opts?: { preferGpu?: boolean }
): Promise<{ encoded: Float32Array; n: number; durationMs: number; gpuPath: boolean }> {
	const t0 = performance.now();
	const weights = await getCachedAutoencoderWeights();
	const result = await autoencoderEncode2Layer(matrix, {
		...weights,
		hidden: weights.b1.length,
		outDim: weights.b2.length,
	}, { n, dim: 768, preferGpu: opts?.preferGpu });
	const durationMs = performance.now() - t0;
	return { encoded: result.projected, n, durationMs, gpuPath: result.source === 'gpu' };
}
