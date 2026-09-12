/**
 * CUDA Compute Bridge for RTX 3060 Ti
 *
 * Portable package boundary: this module owns compute only. Application-level
 * queue dispatch, evidence persistence, Qdrant writes, and audit logging are
 * bound by the host application rather than imported from this package.
 */

import {
	graphSimilarity,
	clusterEmbeddings,
	computeCaseEmbedding,
	isCudaAvailable
} from './libtorch-bridge.js';

export { graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable };

export interface CudaComputeRequest {
	operation: 'vector_similarity' | 'cluster' | 'weighted_embedding';
	data: {
		embeddings?: number[][];
		weights?: number[];
		k?: number;
	};
}

export interface CudaComputeResult {
	jobId: string;
	operation: string;
	result: unknown;
	source: 'gpu' | 'cpu';
	latencyMs: number;
}

/**
 * Execute a bounded compute request directly through the package-local
 * LibTorch bridge. Hosts that need RabbitMQ/event tracking wrap this function
 * at the application boundary; the portable retrieval package does not own
 * that side effect.
 */
export async function submitCudaCompute(request: CudaComputeRequest): Promise<CudaComputeResult> {
	const jobId = crypto.randomUUID();
	const start = performance.now();
	const { operation, data } = request;
	let result: unknown;
	let source: 'gpu' | 'cpu' = 'cpu';

	if (operation === 'vector_similarity' && data.embeddings) {
		const sim = await graphSimilarity(data.embeddings);
		result = sim.matrix;
		source = sim.source;
	} else if (operation === 'cluster' && data.embeddings) {
		const cluster = await clusterEmbeddings(data.embeddings, data.k ?? 5);
		result = cluster.assignments;
		source = cluster.source;
	} else if (operation === 'weighted_embedding' && data.embeddings && data.weights) {
		const emb = await computeCaseEmbedding(data.weights, data.embeddings);
		result = emb.embedding;
		source = emb.source;
	} else {
		result = null;
	}

	return {
		jobId,
		operation,
		result,
		source,
		latencyMs: Math.round(performance.now() - start)
	};
}

/** Get CUDA device info from the live addon. */
export async function getCudaDeviceInfo() {
	const cudaAvailable = isCudaAvailable();
	return {
		name: cudaAvailable ? 'NVIDIA GeForce RTX 3060 Ti' : 'CPU fallback',
		computeCapability: cudaAvailable ? '8.6' : 'N/A',
		cudaAvailable,
		totalMemory: 8 * 1024 * 1024 * 1024,
		multiProcessorCount: 38,
		architecture: 'Ampere'
	};
}
