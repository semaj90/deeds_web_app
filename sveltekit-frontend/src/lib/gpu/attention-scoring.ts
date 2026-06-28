/**
 * Attention Scoring: Query-Weighted Packet Relevance
 * Computes similarity between query and each packet embedding with attention mechanism
 * Replaces script-only: scripts/compute-p4-attention-scores.mjs
 *
 * Used in Karpathy Authority Blend:
 *   final_score = 0.4 * PageRank + 0.3 * attention + 0.3 * authority
 */

import type { ComputeResult } from './gpu-compute-pipeline.js';

export interface AttentionScoreResult {
	packetId: string;
	queryEmbedding: Float32Array; // 768-dim
	packetEmbedding: Float32Array; // 768-dim
	cosineScore: number; // [-1, 1], higher = more similar
	attentionScore: number; // [0, 1], normalized attention weight
	isRelevant: boolean; // cosineScore > 0.3 threshold
}

export interface AttentionConfig {
	temperature: number; // Softmax temperature (higher = softer attention distribution)
	relevanceThreshold: number; // Minimum cosine similarity to consider relevant
	normalization: 'softmax' | 'sigmoid' | 'linear';
}

/**
 * Attention: Compute cosine similarity with attention weighting
 *
 * Algorithm:
 *   1. Compute cosine(query, packet) ∈ [-1, 1]
 *   2. Apply attention transformation (sigmoid, softmax, or linear)
 *   3. Return both raw cosine score and attention-weighted score
 *
 * For batch use: call computeAttentionBatch() instead
 */
export function computeAttentionScore(
	query: Float32Array,
	packet: Float32Array,
	config: AttentionConfig = {
		temperature: 1.0,
		relevanceThreshold: 0.3,
		normalization: 'sigmoid'
	}
): AttentionScoreResult {
	if (query.length !== packet.length) {
		throw new Error(`Embedding dimension mismatch: query ${query.length} vs packet ${packet.length}`);
	}

	// 1. Compute cosine similarity
	const cosineScore = cosineSimilarity(query, packet);

	// 2. Apply attention transformation
	let attentionScore = 0;
	if (config.normalization === 'sigmoid') {
		attentionScore = sigmoid(cosineScore / config.temperature);
	} else if (config.normalization === 'softmax') {
		// Softmax requires batch context; approximate with sigmoid
		attentionScore = sigmoid(cosineScore / config.temperature);
	} else {
		// Linear: clip to [0, 1]
		attentionScore = Math.max(0, Math.min(1, (cosineScore + 1) / 2));
	}

	return {
		packetId: '', // Filled by caller
		queryEmbedding: query,
		packetEmbedding: packet,
		cosineScore,
		attentionScore,
		isRelevant: cosineScore > config.relevanceThreshold
	};
}

/**
 * Attention: Batch compute scores for query vs multiple packets
 * Returns both raw cosine and attention-weighted scores
 * Used in Stage 4 GPU rerank within ACE retrieval
 */
export async function computeAttentionBatch(
	query: Float32Array,
	packets: Float32Array[],
	config: AttentionConfig = {
		temperature: 1.0,
		relevanceThreshold: 0.3,
		normalization: 'sigmoid'
	}
): Promise<ComputeResult<AttentionScoreResult[]>> {
	const t0 = Date.now();

	if (packets.length === 0) {
		return {
			data: [],
			backend: 'cpu',
			durationMs: 0
		};
	}

	// Compute raw cosine scores
	const cosineScores = packets.map((p) => cosineSimilarity(query, p));

	// Apply attention transformation
	const results: AttentionScoreResult[] = [];

	if (config.normalization === 'softmax') {
		// Softmax over all scores: exp(score/T) / sum(exp(scores/T))
		const expScores = cosineScores.map((s) => Math.exp(s / config.temperature));
		const sumExp = expScores.reduce((a, b) => a + b, 0);

		for (let i = 0; i < packets.length; i++) {
			const attentionScore = expScores[i] / sumExp;
			results.push({
				packetId: '',
				queryEmbedding: query,
				packetEmbedding: packets[i],
				cosineScore: cosineScores[i],
				attentionScore,
				isRelevant: cosineScores[i] > config.relevanceThreshold
			});
		}
	} else if (config.normalization === 'sigmoid') {
		// Sigmoid: independent scores for each packet
		for (let i = 0; i < packets.length; i++) {
			const attentionScore = sigmoid(cosineScores[i] / config.temperature);
			results.push({
				packetId: '',
				queryEmbedding: query,
				packetEmbedding: packets[i],
				cosineScore: cosineScores[i],
				attentionScore,
				isRelevant: cosineScores[i] > config.relevanceThreshold
			});
		}
	} else {
		// Linear normalization
		for (let i = 0; i < packets.length; i++) {
			const attentionScore = Math.max(0, Math.min(1, (cosineScores[i] + 1) / 2));
			results.push({
				packetId: '',
				queryEmbedding: query,
				packetEmbedding: packets[i],
				cosineScore: cosineScores[i],
				attentionScore,
				isRelevant: cosineScores[i] > config.relevanceThreshold
			});
		}
	}

	return {
		data: results,
		backend: 'cpu', // Would be 'webgpu' for cuBLAS GEMM (100× faster for n > 1000)
		durationMs: Date.now() - t0
	};
}

/**
 * Attention: Compute multi-head attention (simplified)
 * Splits embedding into multiple heads for richer scoring
 * Optional: used for advanced reranking
 */
export function computeMultiHeadAttention(
	query: Float32Array,
	packets: Float32Array[],
	numHeads: number = 4
): { scores: number[]; attentionPerHead: number[][] } {
	const headDim = Math.floor(query.length / numHeads);
	const scores: number[] = [];
	const attentionPerHead: number[][] = [];

	for (let h = 0; h < numHeads; h++) {
		const queryHead = query.slice(h * headDim, (h + 1) * headDim);
		const headScores: number[] = [];

		for (const packet of packets) {
			const packetHead = packet.slice(h * headDim, (h + 1) * headDim);
			const score = cosineSimilarity(queryHead, packetHead);
			headScores.push(score);
		}

		attentionPerHead.push(headScores);
	}

	// Average across heads
	for (let i = 0; i < packets.length; i++) {
		let sum = 0;
		for (let h = 0; h < numHeads; h++) {
			sum += attentionPerHead[h][i];
		}
		scores.push(sum / numHeads);
	}

	return { scores, attentionPerHead };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Cosine similarity: (a · b) / (||a|| * ||b||)
 * Range: [-1, 1] where 1 = identical, 0 = orthogonal, -1 = opposite
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	if (a.length !== b.length) {
		throw new Error('Vector length mismatch');
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	normA = Math.sqrt(normA);
	normB = Math.sqrt(normB);

	if (normA === 0 || normB === 0) {
		return 0; // Prevent NaN
	}

	return dotProduct / (normA * normB);
}

/**
 * Sigmoid activation: 1 / (1 + exp(-x))
 * Range: (0, 1)
 */
export function sigmoid(x: number): number {
	if (x > 500) return 1; // Overflow protection
	if (x < -500) return 0;
	return 1 / (1 + Math.exp(-x));
}

/**
 * Softmax: exp(x_i) / sum(exp(x_j))
 * Used in batch attention normalization
 */
export function softmax(scores: number[]): number[] {
	// Numerical stability: subtract max before exp
	const maxScore = Math.max(...scores);
	const expScores = scores.map((s) => Math.exp(s - maxScore));
	const sumExp = expScores.reduce((a, b) => a + b, 0);

	return expScores.map((e) => e / sumExp);
}

export const AttentionDefaults: AttentionConfig = {
	temperature: 1.0,
	relevanceThreshold: 0.3,
	normalization: 'sigmoid'
};