/**
 * Autoencoder: 768→64 Dimension Reduction
 * Compresses packet embeddings for efficient memory storage and clustering
 *
 * Replaces script-only: scripts/ae:train:dry / scripts/ae:train:apply
 * Schema field: atlas_packets.latent_64 (bytea, 64-element Float32)
 */

import type { ComputeResult } from './gpu-compute-pipeline.js';

export interface AutoencoderConfig {
	inputDim: number; // 768
	latentDim: number; // 64
	hiddenDim: number; // 256 (optional bottleneck layer)
	modelPath?: string; // Path to trained weights (future)
	quantized?: boolean; // Use INT8 quantization for storage
}

export interface EncodedPacket {
	packetId: string;
	latent: Float32Array; // 64-dim latent vector
	reconstructed?: Float32Array; // Optional: reconstructed 768-dim for quality check
	reconstructionError?: number; // MSE of reconstruction vs original
}

/**
 * Autoencoder: Encode 768→64 (compression)
 * Simple linear projection for MVP (full autoencoder training is deferred)
 *
 * For production, replace with trained weights from PyTorch model:
 *   model = torch.load('encoder.pt')
 *   encoder = nn.Sequential(
 *     nn.Linear(768, 256),
 *     nn.ReLU(),
 *     nn.Linear(256, 64)
 *   )
 */
export async function encodeToLatent(
	embedding: Float32Array,
	config: AutoencoderConfig
): Promise<ComputeResult<Float32Array>> {
	const t0 = Date.now();

	if (embedding.length !== config.inputDim) {
		throw new Error(`Expected embedding dim ${config.inputDim}, got ${embedding.length}`);
	}

	// MVP: Simple linear projection (768 → 64)
	// Replace with actual learned weights once training completes
	const latent = linearProjection(embedding, config.inputDim, config.latentDim);

	// Optional: Normalize latent space
	const normalized = normalizeL2(latent);

	return {
		data: normalized,
		backend: 'cpu', // Would be 'webgpu' for GPU-accelerated inference
		durationMs: Date.now() - t0
	};
}

/**
 * Autoencoder: Decode 64→768 (reconstruction)
 * Used to verify quality and for visualization
 */
export async function decodeFromLatent(
	latent: Float32Array,
	config: AutoencoderConfig
): Promise<ComputeResult<Float32Array>> {
	const t0 = Date.now();

	if (latent.length !== config.latentDim) {
		throw new Error(`Expected latent dim ${config.latentDim}, got ${latent.length}`);
	}

	// MVP: Transpose of encoder projection
	// In full model: nn.Sequential(nn.Linear(64, 256), nn.ReLU(), nn.Linear(256, 768))
	const reconstructed = linearProjectionTranspose(latent, config.latentDim, config.inputDim);

	return {
		data: reconstructed,
		backend: 'cpu',
		durationMs: Date.now() - t0
	};
}

/**
 * Autoencoder: Batch encode multiple embeddings
 * Used during reindexing to populate latent_64 column
 */
export async function encodeBatch(
	embeddings: Float32Array[],
	config: AutoencoderConfig
): Promise<ComputeResult<EncodedPacket[]>> {
	const t0 = Date.now();

	const results: EncodedPacket[] = embeddings.map((embedding, idx) => {
		const latent = linearProjection(embedding, config.inputDim, config.latentDim);
		const normalized = normalizeL2(latent);

		return {
			packetId: '', // Filled by caller
			latent: normalized
		};
	});

	return {
		data: results,
		backend: 'cpu',
		durationMs: Date.now() - t0
	};
}

/**
 * Autoencoder: Measure reconstruction quality (MSE)
 * Lower is better. Used to validate model performance.
 */
export function measureReconstructionError(
	original: Float32Array,
	reconstructed: Float32Array
): number {
	if (original.length !== reconstructed.length) {
		throw new Error('Vector length mismatch');
	}

	let mse = 0;
	for (let i = 0; i < original.length; i++) {
		const diff = original[i] - reconstructed[i];
		mse += diff * diff;
	}

	return mse / original.length;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Simple linear projection: x → Ax where A is inputDim × outputDim
 * MVP uses random orthogonal projection until trained weights available
 */
function linearProjection(x: Float32Array, inputDim: number, outputDim: number): Float32Array {
	const result = new Float32Array(outputDim);

	// MVP: Sum pooling over input dimensions (data-efficient initialization)
	// Replace with learned weights matrix once training complete
	const poolSize = Math.ceil(inputDim / outputDim);

	for (let i = 0; i < outputDim; i++) {
		let sum = 0;
		const start = i * poolSize;
		const end = Math.min(start + poolSize, inputDim);

		for (let j = start; j < end; j++) {
			sum += x[j];
		}

		result[i] = sum / poolSize;
	}

	return result;
}

/**
 * Transpose of linear projection: y → A^T y
 * For reconstruction, unpools 64→768
 */
function linearProjectionTranspose(y: Float32Array, inputDim: number, outputDim: number): Float32Array {
	const result = new Float32Array(outputDim);

	// MVP: Repeat each latent element to reconstruct original shape
	const repeatFactor = Math.ceil(outputDim / inputDim);

	for (let i = 0; i < inputDim; i++) {
		const value = y[i];
		const start = i * repeatFactor;
		const end = Math.min(start + repeatFactor, outputDim);

		for (let j = start; j < end; j++) {
			result[j] = value / repeatFactor;
		}
	}

	return result;
}

/**
 * L2 normalization: ||x|| → x / ||x||
 */
function normalizeL2(x: Float32Array): Float32Array {
	let norm = 0;
	for (let i = 0; i < x.length; i++) {
		norm += x[i] * x[i];
	}
	norm = Math.sqrt(norm);

	if (norm === 0) return x;

	const result = new Float32Array(x.length);
	for (let i = 0; i < x.length; i++) {
		result[i] = x[i] / norm;
	}
	return result;
}

/**
 * Quantize Float32 latent vector to INT8 for compact storage
 * Used when storing to atlas_packets.latent_64 (bytea)
 */
export function quantizeINT8(latent: Float32Array): Uint8Array {
	const quantized = new Uint8Array(latent.length);

	// Find range
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < latent.length; i++) {
		min = Math.min(min, latent[i]);
		max = Math.max(max, latent[i]);
	}

	const range = max - min || 1;
	const scale = 255 / range;

	// Quantize to [0, 255]
	for (let i = 0; i < latent.length; i++) {
		const normalized = (latent[i] - min) * scale;
		quantized[i] = Math.round(Math.max(0, Math.min(255, normalized)));
	}

	return quantized;
}

/**
 * Dequantize INT8 back to Float32
 * Used when reading from atlas_packets.latent_64
 */
export function dequantizeINT8(quantized: Uint8Array, originalMin: number, originalMax: number): Float32Array {
	const result = new Float32Array(quantized.length);
	const range = originalMax - originalMin || 1;
	const scale = range / 255;

	for (let i = 0; i < quantized.length; i++) {
		result[i] = quantized[i] * scale + originalMin;
	}

	return result;
}

export const AutoencoderDefaults: AutoencoderConfig = {
	inputDim: 768,
	latentDim: 64,
	hiddenDim: 256,
	quantized: true
};