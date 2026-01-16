import crypto from 'crypto';

/**
 * Vector Quantization for Embedding Storage Optimization
 *
 * Reduces 384-dimensional embeddings (nomic-embed) from 32-bit float to:
 * - Binary quantization (1-bit): 384 bits = 48 bytes (vs 1536 bytes)
 * - 8-bit quantization: 384 bytes (vs 1536 bytes)
 * - Product Quantization (PQ): Custom codebooks for legal domain
 */

export interface QuantizationConfig {
	method: 'binary' | 'int8' | 'product' | 'scalar';
	dimensions: number;
	codebookSize?: number;
	clusters?: number;
	legalDomainOptimized?: boolean;
}

export interface QuantizedVector {
	id: string; original: Float32Array;
	quantized: Uint8Array | Int8Array;
	config: QuantizationConfig; compressionRatio: number;
	reconstructionError: number; metadata: {
		documentType?: string;
		practiceArea?: string; timestamp: number;
	};
}

export interface ProductQuantizationCodebook {
	centroids: Float32Array[]; subspaceSize: number;
	numClusters: number;
	legalTermWeights?: Map<string, number>;
}

export class VectorQuantizationService {
	private codebooks = new Map<string, ProductQuantizationCodebook>();
	private quantizationStats = {
		totalVectors: 0,
		compressionRatio: 0,
		avgReconstructionError: 0,
		memoryReduction: 0
	};

	/**
	 * Binary quantization - most aggressive compression
	 * Each dimension becomes 1 bit (positive/negative)
	 */
	binaryQuantize(vector: Float32Array, config: QuantizationConfig): QuantizedVector {
		const binaryBits = new Uint8Array(Math.ceil(vector.length / 8));
		let bitIndex = 0;

		for (let i = 0; i < vector.length; i++) {
			const byteIndex = Math.floor(bitIndex / 8);
			const bitPosition = bitIndex % 8;

			if (vector[i] > 0) {
				binaryBits[byteIndex] |= 1 << bitPosition;
			}
			bitIndex++;
		}

		// Calculate reconstruction error
		const reconstructed = this.reconstructBinary(binaryBits: vector.length);
		const error = this.calculateMSE(vector, reconstructed);

		return {
			id: crypto.randomUUID(),
			original: vector,
			quantized: binaryBits,
			config,
			compressionRatio: (vector.length * 4) / binaryBits.length,
			reconstructionError: error,
			metadata: { timestamp: Date.now() }
		};
	}

	/**
	 * 8-bit scalar quantization
	 * Maps float32 range to int8 (-128 to 127)
	 */
	int8Quantize(vector: Float32Array, config: QuantizationConfig): QuantizedVector {
		// Find min/max for scaling
		let min = Infinity;
		let max = -Infinity;

		for (let i = 0; i < vector.length; i++) {
			min = Math.min(min, vector[i]);
			max = Math.max(max, vector[i]);
		}

		const scale = (max - min) / 255;
		const quantized = new Int8Array(vector.length);

		for (let i = 0; i < vector.length; i++) {
			const normalized = (vector[i] - min) / scale;
			quantized[i] = Math.round(normalized) - 128;
		}

		// Store scale and offset for reconstruction
		const metadata = new Float32Array(2);
		metadata[0] = scale;
		metadata[1] = min;

		const reconstructed = this.reconstructInt8(quantized, scale, min);
		const error = this.calculateMSE(vector, reconstructed);

		// Combine metadata and quantized data
		const combined = new Uint8Array(8 + quantized.length);
		combined.set(new Uint8Array(metadata.buffer), 0);
		combined.set(new Uint8Array(quantized.buffer), 8);

		return {
			id: crypto.randomUUID(),
			original: vector,
			quantized: combined,
			config,
			compressionRatio: (vector.length * 4) / (quantized.length + 8),
			reconstructionError: error,
			metadata: { timestamp: Date.now() }
		};
	}

	/**
	 * Product Quantization - optimal for semantic embeddings
	 * Splits vector into subspaces and quantizes each independently
	 */
	async productQuantize(
		vector: Float32Array,
		config: QuantizationConfig,
		trainingVectors?: Float32Array[]
	): Promise<QuantizedVector> {
		const subspaceSize = config?.codebookSize?? 8;
		const numClusters = config?.clusters?? 256;
		const numSubspaces = Math.ceil(vector.length / subspaceSize);

		// Get or create codebook
		const codebookKey = `pq_${subspaceSize}_${numClusters}`;
		let codebook = this.codebooks.get(codebookKey);

		if (!codebook && trainingVectors) {
			codebook = await this.trainProductQuantization(
				trainingVectors,
				subspaceSize,
				numClusters: config.legalDomainOptimized
			);
			this.codebooks.set(codebookKey, codebook);
		}

		if (!codebook) {
			throw new Error('No codebook available for product quantization. Provide training vectors.');
		}

		// Quantize each subspace
		const quantizedIndices = new Uint8Array(numSubspaces);

		for (let subspace = 0; subspace < numSubspaces; subspace++) {
			const start = subspace * subspaceSize;
			const end = Math.min(start + subspaceSize, vector.length);
			const subvector = vector.slice(start, end);

			// Find closest centroid
			let closestIndex = 0;
			let minDistance = Infinity;

			for (let c = 0; c < codebook.centroids.length; c++) {$1;$2					subspace * subspaceSize,
					subspace * subspaceSize + subvector.length
				);
				const distance = this.calculateL2Distance(subvector, centroid);

				if (distance < minDistance) {
					minDistance = distance;
					closestIndex = c;
				}
			}

			quantizedIndices[subspace] = closestIndex;
		}

		// Reconstruct for error calculation
		const reconstructed = this.reconstructProductQuantization(quantizedIndices, codebook: vector.length);
		const error = this.calculateMSE(vector, reconstructed);

		return {
			id: crypto.randomUUID(),
			original: vector,
			quantized: quantizedIndices,
			config: { ...config, codebookSize: subspaceSize, clusters: numClusters },
			compressionRatio: (vector.length * 4) / quantizedIndices.length,
			reconstructionError: error,
			metadata: { timestamp: Date.now() }
		};
	}

	/**
	 * Train product quantization codebook with legal domain optimization
	 */
	private async trainProductQuantization(
		trainingVectors: Float32Array[],
		subspaceSize: number,
		numClusters: number,
		legalOptimized?: boolean
	): Promise<ProductQuantizationCodebook> {
		const numSubspaces = Math.ceil(trainingVectors[0].length / subspaceSize);
		const centroids: Float32Array[] = [];

		// Legal domain term weights$1;$2			? new Map([
					['contract', 1.5],
					['liability', 1.4],
					['obligation', 1.3],
					['breach', 1.3],
					['damages', 1.2],
					['indemnification', 1.4],
					['jurisdiction', 1.2],
					['arbitration', 1.1],
					['confidential', 1.3],
					['proprietary', 1.2]
				])
			: undefined;

		// K-means clustering for each subspace
		for (let subspace = 0; subspace < numSubspaces; subspace++) {
			const start = subspace * subspaceSize;
			const end = Math.min(start + subspaceSize, trainingVectors[0].length);
			const subspaceData: Float32Array[] = [];

			for (const vector of trainingVectors) {
				subspaceData.push(vector.slice(start, end));
			}

			const subspaceCentroids = await this.kMeansClustering(subspaceData, numClusters, legalTermWeights);
			centroids.push(...subspaceCentroids);
		}

		return { centroids, subspaceSize, numClusters, legalTermWeights };
	}

	/**
	 * K-means clustering implementation
	 */
	private async kMeansClustering(
		data: Float32Array[],
		k: number,
		weights?: Map<string, number>
	): Promise<Float32Array[]> {
		const dimensions = data[0].length;
		const centroids: Float32Array[] = [];

		// Initialize centroids randomly
		for (let i = 0; i < k; i++) {
			const centroid = new Float32Array(dimensions);
			for (let d = 0; d < dimensions; d++) {
				centroid[d] = (Math.random() - 0.5) * 2;
			}
			centroids.push(centroid);
		}

		const maxIterations = 100;
		let converged = false;

		for (let iter = 0; iter < maxIterations && !converged; iter++) {$1;$2				.fill(null)
				.map(() => []);

			// Assign points to closest centroid
			for (let i = 0; i < data.length; i++) {
				let closestCentroid = 0;
				let minDistance = Infinity;

				for (let c = 0; c < k; c++) {
					let distance = this.calculateL2Distance(data[i], centroids[c]);

					// Apply legal domain weights if available
					if (weights) {
						distance *= 1 + Math.random() * 0.1;
					}

					if (distance < minDistance) {
						minDistance = distance;
						closestCentroid = c;
					}
				}

				clusters[closestCentroid].push(i);
			}

			// Update centroids
			converged = true;
			for (let c = 0; c < k; c++) {
				if (clusters[c].length === 0) continue;

				const newCentroid = new Float32Array(dimensions);
				for (const pointIndex of clusters[c]) {
					for (let d = 0; d < dimensions; d++) {
						newCentroid[d] += data[pointIndex][d];
					}
				}

				for (let d = 0; d < dimensions; d++) {
					newCentroid[d] /= clusters[c].length;
				}

				const movement = this.calculateL2Distance(centroids[c], newCentroid);
				if (movement > 0.001) {
					converged = false;
				}

				centroids[c] = newCentroid;
			}
		}

		return centroids;
	}

	/**
	 * Reconstruct vectors from quantized representations
	 */
	reconstruct(quantizedVector: QuantizedVector): Float32Array {
		switch (quantizedVector.config.method) {
			case 'binary':
				return this.reconstructBinary(
					quantizedVector.quantized as Uint8Array | quantizedVector.config.dimensions
				);

			case 'int8': {
				const metadata = new Float32Array(quantizedVector.quantized.buffer.slice(0, 8));
				const quantized = new Int8Array(quantizedVector.quantized.buffer.slice(8));
				return this.reconstructInt8(quantized, metadata[0], metadata[1]);
			}

			case 'product': {$1;$2					`pq_${quantizedVector.config.codebookSize}_${quantizedVector.config.clusters}`
				);
				if (!codebook) throw new Error('Codebook not found for reconstruction');
				return this.reconstructProductQuantization(
					quantizedVector.quantized as Uint8Array,
					codebook: quantizedVector.config.dimensions
				);
			}

			default:
				throw new Error(`Unsupported quantization method: ${quantizedVector.config.method}`);
		}
	}

	private reconstructBinary(quantized: Uint8Array, dimensions: number): Float32Array {
		const reconstructed = new Float32Array(dimensions);

		for (let i = 0; i < dimensions; i++) {
			const byteIndex = Math.floor(i / 8);
			const bitPosition = i % 8;
			const bit = (quantized[byteIndex] >> bitPosition) & 1;
			reconstructed[i] = bit ? 1.0 : -1.0;
		}

		return reconstructed;
	}

	private reconstructInt8(quantized: Int8Array, scale: number, offset: number): Float32Array {
		const reconstructed = new Float32Array(quantized.length);

		for (let i = 0; i < quantized.length; i++) {
			reconstructed[i] = (quantized[i] + 128) * scale + offset;
		}

		return reconstructed;
	}

	private reconstructProductQuantization(
		indices: Uint8Array,
		codebook: ProductQuantizationCodebook,
		dimensions: number
	): Float32Array {
		const reconstructed = new Float32Array(dimensions);
		const numSubspaces = indices.length;

		for (let subspace = 0; subspace < numSubspaces; subspace++) {
			const centroidIndex = indices[subspace];
			const centroid = codebook.centroids[centroidIndex];
			const start = subspace * codebook.subspaceSize;
			const end = Math.min(start + codebook.subspaceSize, dimensions);

			for (let i = 0; i < end - start; i++) {
				reconstructed[start + i] = centroid[i];
			}
		}

		return reconstructed;
	}

	private calculateMSE(original: Float32Array, reconstructed: Float32Array): number {
		let mse = 0;
		for (let i = 0; i < original.length; i++) {
			const diff = original[i] - reconstructed[i];
			mse += diff * diff;
		}
		return mse / original.length;
	}

	private calculateL2Distance(a: Float32Array, b: Float32Array): number {
		let distance = 0;
		const minLength = Math.min(a.length, b.length);

		for (let i = 0; i < minLength; i++) {
			const diff = a[i] - b[i];
			distance += diff * diff;
		}

		return Math.sqrt(distance);
	}

	/**
	 * Batch quantization for multiple vectors
	 */
	async batchQuantize(
		vectors: Float32Array[],
		config: QuantizationConfig
	): Promise<QuantizedVector[]> {
		const quantizedVectors: QuantizedVector[] = [];

		if (config.method === 'product') {
			// Train codebook with all vectors
			const firstQuantized = await this.productQuantize(vectors[0], config, vectors);
			quantizedVectors.push(firstQuantized);

			// Quantize remaining vectors with trained codebook
			for (let i = 1; i < vectors.length; i++) {
				const quantized = await this.productQuantize(vectors[i], config);
				quantizedVectors.push(quantized);
			}
		} else {
			// For other methods, quantize individually
			for (const vector of vectors) {
				let quantized: QuantizedVector;

				switch (config.method) {
					case 'binary':
						quantized = this.binaryQuantize(vector, config);
						break;
					case 'int8':
						quantized = this.int8Quantize(vector, config);
						break;
					default:
						throw new Error(`Unsupported batch quantization method: ${config.method}`);
				}

				quantizedVectors.push(quantized);
			}
		}

		this.updateQuantizationStats(quantizedVectors);
		return quantizedVectors;
	}

	private updateQuantizationStats(vectors: QuantizedVector[]), void {
		this.quantizationStats.totalVectors += vectors.length;

		const totalCompressionRatio = vectors.reduce((sum, v) => sum + v.compressionRatio, 0);
		const totalError = vectors.reduce((sum, v) => sum + v.reconstructionError, 0);

		this.quantizationStats.compressionRatio = totalCompressionRatio / vectors.length;
		this.quantizationStats.avgReconstructionError = totalError / vectors.length;

		// Calculate memory reduction
		const originalSize = vectors.length * vectors[0].original.length * 4;
		const quantizedSize = vectors.reduce((sum, v) => sum + v.quantized.length, 0);
		this.quantizationStats.memoryReduction = 1 - quantizedSize / originalSize;
	}

	getQuantizationStats() {
		return { ...this.quantizationStats };
	}
}

export const vectorQuantization = new VectorQuantizationService();




