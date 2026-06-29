/**
 * TensorRT Worker Thread — Routes GPU operations to N-API addon
 *
 * Receives GPU tasks via worker message protocol and executes them on the
 * tensorrt_bridge.node N-API addon (CUDA kernels on RTX 3060 Ti).
 *
 * Message protocol:
 * IN:  { taskId, operation, embedding, embeddings, centroids, dim, n, k, maxIters, gridSize, damping, iters }
 * OUT: { taskId, error?, data?, duration? }
 */

const { parentPort, workerData } = require('worker_threads');

// Try to load the N-API addon (CUDA kernels)
let addon = null;
try {
	// Try different possible paths for the compiled addon
	addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
} catch (e) {
	// Fallback: addon not available, will use CPU emulation
	console.warn(`[Worker ${workerData?.workerId}] N-API addon not available, using CPU emulation:`, e.message);
	addon = null;
}

// CPU emulation fallbacks (when CUDA unavailable)
function emulateGpuOperation(task) {
	const { operation, embedding, embeddings, centroids, queryEmbedding, keys, corpus, dim, n, k, maxIters, gridSize, damping, iters } = task;

	try {
		switch (operation) {
			case 'findBMU': {
				// CPU: find closest centroid for each embedding
				if (!embeddings || !centroids) throw new Error('Missing embeddings or centroids');
				const results = new Int32Array(embeddings.length * 2);
				for (let i = 0; i < embeddings.length; i++) {
					let minDist = Infinity;
					let bestCluster = 0;
					const emb = embeddings[i];
					for (let c = 0; c < centroids.length; c += dim) {
						let dist = 0;
						for (let d = 0; d < dim; d++) {
							const diff = emb[d] - centroids[c + d];
							dist += diff * diff;
						}
						dist = Math.sqrt(dist);
						if (dist < minDist) {
							minDist = dist;
							bestCluster = Math.floor(c / dim);
						}
					}
					results[i * 2] = bestCluster;
					results[i * 2 + 1] = Math.floor(minDist * 1000); // scale to int
				}
				return results;
			}

			case 'attention': {
				// CPU: softmax(Q @ K^T / sqrt(d))
				if (!queryEmbedding || !keys) throw new Error('Missing query or keys');
				const n_keys = Math.floor(keys.length / dim);
				const scores = new Float32Array(n_keys);
				let max_score = -Infinity;
				for (let i = 0; i < n_keys; i++) {
					let score = 0;
					for (let d = 0; d < dim; d++) {
						score += queryEmbedding[d] * keys[i * dim + d];
					}
					score /= Math.sqrt(dim);
					scores[i] = score;
					if (score > max_score) max_score = score;
				}
				// Softmax
				let sum = 0;
				for (let i = 0; i < n_keys; i++) {
					scores[i] = Math.exp(scores[i] - max_score);
					sum += scores[i];
				}
				for (let i = 0; i < n_keys; i++) scores[i] /= sum;
				return scores;
			}

			case 'cosine': {
				// CPU: ||A - B|| / (||A|| * ||B||)
				if (!queryEmbedding || !corpus) throw new Error('Missing query or corpus');
				const n_corpus = Math.floor(corpus.length / dim);
				const similarities = new Float32Array(n_corpus);
				let queryNorm = 0;
				for (let d = 0; d < dim; d++) {
					queryNorm += queryEmbedding[d] * queryEmbedding[d];
				}
				queryNorm = Math.sqrt(queryNorm) || 1;
				for (let i = 0; i < n_corpus; i++) {
					let dot = 0;
					let corpusNorm = 0;
					for (let d = 0; d < dim; d++) {
						const c = corpus[i * dim + d];
						dot += queryEmbedding[d] * c;
						corpusNorm += c * c;
					}
					corpusNorm = Math.sqrt(corpusNorm) || 1;
					similarities[i] = dot / (queryNorm * corpusNorm);
				}
				return similarities;
			}

			case 'kmeans': {
				// CPU: simple k-means (k iterations)
				if (!embeddings) throw new Error('Missing embeddings');
				const assignments = new Int32Array(n);
				const newCentroids = new Float32Array(k * dim);

				// Initialize centroids (first k embeddings)
				for (let i = 0; i < k && i < n; i++) {
					newCentroids.set(embeddings[i], i * dim);
				}

				// Iterate
				for (let iter = 0; iter < (maxIters || 1); iter++) {
					// Assign clusters
					for (let i = 0; i < n; i++) {
						let minDist = Infinity;
						let bestCluster = 0;
						for (let c = 0; c < k; c++) {
							let dist = 0;
							for (let d = 0; d < dim; d++) {
								const diff = embeddings[i * dim + d] - newCentroids[c * dim + d];
								dist += diff * diff;
							}
							if (dist < minDist) {
								minDist = dist;
								bestCluster = c;
							}
						}
						assignments[i] = bestCluster;
					}

					// Recompute centroids
					const counts = new Int32Array(k);
					newCentroids.fill(0);
					for (let i = 0; i < n; i++) {
						const cluster = assignments[i];
						counts[cluster]++;
						for (let d = 0; d < dim; d++) {
							newCentroids[cluster * dim + d] += embeddings[i * dim + d];
						}
					}
					for (let c = 0; c < k; c++) {
						if (counts[c] > 0) {
							for (let d = 0; d < dim; d++) {
								newCentroids[c * dim + d] /= counts[c];
							}
						}
					}
				}

				// Return assignments + centroids
				const result = new Int32Array(n + k * dim);
				result.set(assignments, 0);
				for (let i = 0; i < k * dim; i++) {
					result[n + i] = Math.floor(newCentroids[i] * 1000000);
				}
				return result;
			}

			case 'pagerank': {
				// CPU: power iteration method
				if (!embedding) throw new Error('Missing adjacency matrix');
				const pr = new Float32Array(n);
				pr.fill(1 / n);
				const damping_factor = damping || 0.85;

				for (let iter = 0; iter < (iters || 10); iter++) {
					const new_pr = new Float32Array(n);
					for (let i = 0; i < n; i++) {
						new_pr[i] = (1 - damping_factor) / n;
						for (let j = 0; j < n; j++) {
							if (embedding[j * n + i] > 0) {
								let out_degree = 0;
								for (let k = 0; k < n; k++) {
									if (embedding[j * n + k] > 0) out_degree++;
								}
								if (out_degree > 0) {
									new_pr[i] += damping_factor * (pr[j] / out_degree);
								}
							}
						}
					}
					pr.set(new_pr);
				}
				return pr;
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	} catch (e) {
		throw new Error(`CPU emulation failed for ${operation}: ${e.message}`);
	}
}

// Main worker message handler
if (parentPort) {
	parentPort.on('message', async (task) => {
		const startTime = Date.now();
		const { taskId, operation } = task;

		try {
			let data;

			if (addon && addon[operation]) {
				// GPU path: call N-API addon
				switch (operation) {
					case 'findBMU':
						data = await addon.findBMU(task.embedding, task.centroids, task.gridSize || 20);
						break;
					case 'attention':
						data = await addon.computeAttention(task.queryEmbedding, task.keys, task.dim || 768);
						break;
					case 'cosine':
						data = await addon.batchCosineSimilarity(task.queryEmbedding, task.corpus, task.dim || 768);
						break;
					case 'kmeans':
						data = await addon.kmeansWithCentroids(task.embeddings, task.n, task.dim || 768, task.k, task.maxIters || 10);
						break;
					case 'pagerank':
						data = await addon.pageRankGPU(task.embeddings, task.n, task.damping || 0.85, task.iters || 20);
						break;
					default:
						throw new Error(`Unknown GPU operation: ${operation}`);
				}
			} else {
				// CPU emulation path
				data = emulateGpuOperation(task);
			}

			parentPort.postMessage({
				taskId,
				data,
				duration: Date.now() - startTime
			});
		} catch (error) {
			parentPort.postMessage({
				taskId,
				error: error.message,
				duration: Date.now() - startTime
			});
		}
	});
}

console.log(`[TensorRT Worker ${workerData?.workerId}] Started (addon: ${addon ? 'CUDA' : 'CPU-emulated'})`);
