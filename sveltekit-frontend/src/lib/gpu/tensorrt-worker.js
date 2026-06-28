/**
 * TensorRT Worker Thread
 *
 * Each worker thread runs independently with its own CUDA context/stream.
 * N-API addon calls are thread-safe (cuBLAS/cuDNN handle per-thread).
 *
 * Message protocol:
 *   IN:  { taskId, operation, embedding, embeddings, centroids, dim, n, k, maxIters, gridSize, ... }
 *   OUT: { taskId, error?, data?, duration? }
 *
 * Operations:
 *   - findBMU: SOM clustering (Best Matching Unit)
 *   - attention: attention scoring
 *   - autoencoder: 768->64 compression
 *   - cosine: batch cosine similarity
 *   - kmeans: k-means with centroids
 *   - pagerank: PageRank on adjacency matrix
 */

const { parentPort, workerData } = require('worker_threads');

// Lazy-load N-API addon (only when needed)
let addon = null;

function loadAddon() {
	if (!addon) {
		try {
			addon = require('../../../build/Release/tensorrt_bridge.node');
		} catch (err) {
			console.error('[TensorRT Worker] Failed to load N-API addon:', err.message);
			throw err;
		}
	}
	return addon;
}

parentPort.on('message', async (task) => {
	const t0 = Date.now();
	let result = { taskId: task.taskId };

	try {
		const addon = loadAddon();

		switch (task.operation) {
			case 'findBMU': {
				if (!task.embeddings || !task.centroids) {
					throw new Error('findBMU requires embeddings and centroids');
				}

				const gridSize = task.gridSize || 20;
				const numEmbeddings = task.embeddings.length;
				const output = new Int32Array(numEmbeddings * 2); // cluster, distance

				for (let i = 0; i < numEmbeddings; i++) {
					const embedding = task.embeddings[i];

					// Call N-API: find BMU in SOM grid
					const bmuIdx = addon.findBMU(embedding, task.centroids, gridSize);
					const bmuRow = Math.floor(bmuIdx / gridSize);
					const bmuCol = bmuIdx % gridSize;
					const cluster = bmuRow * gridSize + bmuCol;

					// Compute distance to BMU (L2)
					const centroidOffset = bmuIdx * embedding.length;
					let distSq = 0;
					for (let d = 0; d < embedding.length; d++) {
						const diff = embedding[d] - task.centroids[centroidOffset + d];
						distSq += diff * diff;
					}
					const distance = Math.sqrt(distSq);

					output[i * 2] = cluster;
					output[i * 2 + 1] = distance;
				}

				result.data = output;
				break;
			}

			case 'attention': {
				if (!task.queryEmbedding || !task.keys) {
					throw new Error('attention requires queryEmbedding and keys');
				}

				const n = task.n || task.keys.length / task.dim;
				const output = new Float32Array(n);

				// Call N-API: attention score
				const status = addon.attentionScoreGPU(
					task.queryEmbedding,
					task.dim,
					task.keys,
					n,
					output,
					output.length
				);

				if (status !== 0) {
					throw new Error(`attentionScoreGPU failed with status ${status}`);
				}

				result.data = output;
				break;
			}

			case 'cosine': {
				if (!task.queryEmbedding || !task.corpus) {
					throw new Error('cosine requires queryEmbedding and corpus');
				}

				const n = task.n || task.corpus.length / task.dim;
				const output = new Float32Array(n);

				// Call N-API: batch cosine similarity
				const status = addon.batchCosineSimilarity(
					task.queryEmbedding,
					task.dim,
					task.corpus,
					n,
					output,
					output.length
				);

				if (status !== 0) {
					throw new Error(`batchCosineSimilarity failed with status ${status}`);
				}

				result.data = output;
				break;
			}

			case 'kmeans': {
				if (!task.embeddings) {
					throw new Error('kmeans requires embeddings');
				}

				// Concatenate embeddings into single buffer
				const embeddingsBuffer = new Float32Array(task.n * task.dim);
				for (let i = 0; i < task.embeddings.length; i++) {
					embeddingsBuffer.set(task.embeddings[i], i * task.dim);
				}

				const assignments = new Int32Array(task.n);
				const centroids = new Float32Array(task.k * task.dim);
				const reseededCount = new Int32Array(1);

				// Call N-API: k-means
				const status = addon.kmeansWithCentroids(
					embeddingsBuffer,
					task.n,
					task.dim,
					task.k,
					task.maxIters || 10,
					assignments,
					assignments.length,
					centroids,
					centroids.length,
					reseededCount
				);

				if (status !== 0) {
					throw new Error(`kmeansWithCentroids failed with status ${status}`);
				}

				// Return combined output (assignments + centroids)
				const combined = new Int32Array(task.n + task.k * task.dim);
				combined.set(assignments, 0);
				combined.set(new Int32Array(centroids.buffer), task.n);

				result.data = combined;
				break;
			}

			case 'pagerank': {
				if (!task.embeddings) {
					throw new Error('pagerank requires embeddings (adjacency matrix)');
				}

				const n = task.n;
				const output = new Float32Array(n);

				// Call N-API: PageRank
				const status = addon.pageRankGPU(
					task.embeddings,
					n,
					task.damping || 0.85,
					task.iters || 20,
					output,
					output.length
				);

				if (status !== 0) {
					throw new Error(`pageRankGPU failed with status ${status}`);
				}

				result.data = output;
				break;
			}

			case 'autoencoder': {
				if (!task.embedding) {
					throw new Error('autoencoder requires embedding');
				}

				// TODO: wire autoencoder N-API function once available
				// For now, return mock output
				const output = new Float32Array(64);
				for (let i = 0; i < 64; i++) {
					output[i] = task.embedding[i * 12] || 0; // sum pooling mock
				}

				result.data = output;
				break;
			}

			default:
				throw new Error(`Unknown operation: ${task.operation}`);
		}

		result.duration = Date.now() - t0;
	} catch (err) {
		result.error = err.message;
		result.duration = Date.now() - t0;
	}

	// Send result back to main thread
	if (result.data && result.data.buffer) {
		// Transfer typed array buffer back
		parentPort.postMessage(result, [result.data.buffer]);
	} else {
		parentPort.postMessage(result);
	}
});

console.log(`[TensorRT Worker ${workerData.workerId}] Started (pool size: ${workerData.poolSize})`);
