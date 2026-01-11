// WebAssembly AI Adapter - Bridge between WebAssembly and AI services
import { WebAssemblyAccelerator } from '../wasm/webassembly-accelerator';
import { TensorCache } from '../cache/indexeddb';
import { ProtoSerializer } from '../cache/proto-serializer';

export interface AIModelConfig {
    modelName: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    useCache: boolean;
    compressionLevel: 'none' | 'float16' | 'int8';
}

export interface TensorEmbedding {
    id: string;
    vector: Float32Array;
    metadata: Record<string, any>;
    timestamp: number;
}

export interface ClusterResult {
    clusterId: number;
    centroid: Float32Array;
    members: string[];
    silhouetteScore: number;
}

export class WebASMAIAdapter {
    private wasmAccelerator: WebAssemblyAccelerator;
    private tensorCache: TensorCache;
    private serializer: ProtoSerializer;
    private modelConfig: AIModelConfig;
    private embeddingCache = new Map<string, TensorEmbedding>();
    private clusterCache = new Map<string, ClusterResult[]>();

    constructor(config: Partial<AIModelConfig> = {}) {
        this.wasmAccelerator = new WebAssemblyAccelerator();
        this.tensorCache = new TensorCache();
        this.serializer = new ProtoSerializer();

        this.modelConfig = {
            modelName: 'embeddinggemma:latest',
            maxTokens: 512,
            temperature: 0.7,
            topP: 0.9,
            useCache: true,
            compressionLevel: 'float16',
            ...config
        };
    }

    async init(wasmPath?: string) {
        await Promise.all([
            this.wasmAccelerator.init(wasmPath),
            this.tensorCache.init()
        ]);
    }

    // Generate embeddings with WASM acceleration
    async generateEmbedding(
        text: string,
        options: {
            useLocalCache?: boolean;
            forceRefresh?: boolean;
            sliceCount?: number;
        } = {}
    ): Promise<TensorEmbedding> {
        const { useLocalCache = true, forceRefresh = false, sliceCount = 3 } = options;
        const embeddingId = this.generateEmbeddingId(text);

        // Check local cache first
        if (useLocalCache && !forceRefresh && this.embeddingCache.has(embeddingId)) {
            return this.embeddingCache.get(embeddingId)!;
        }

        // Check IndexedDB cache
        if (useLocalCache && !forceRefresh) {
            const cached = await this.tensorCache.getTensor(embeddingId);
            if (cached) {
                const embedding = await this.deserializeEmbedding(cached, embeddingId);
                this.embeddingCache.set(embeddingId, embedding);
                return embedding;
            }
        }

        // Generate new embedding via API
        const response = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                tensor_id: embeddingId,
                num_slices: sliceCount,
                cluster: true
            })
        });

        const apiResult = await response.json();

        // Create tensor embedding
        const vector = new Float32Array(apiResult.embeddings);
        const embedding: TensorEmbedding = {
            id: embeddingId,
            vector,
            metadata: {
                text: text.substring(0, 100), // Store first 100 chars
                model: this.modelConfig.modelName,
                slices: apiResult.slices,
                shape: apiResult.shape,
                dtype: apiResult.dtype
            },
            timestamp: Date.now()
        };

        // Cache in memory
        this.embeddingCache.set(embeddingId, embedding);

        // Cache in IndexedDB with compression
        if (useLocalCache) {
            await this.cacheEmbeddingWithCompression(embedding);
        }

        return embedding;
    }

    // Batch embedding generation with WASM optimization
    async generateEmbeddingBatch(
        texts: string[],
        options: { batchSize?: number; parallel?: boolean } = {}
    ): Promise<TensorEmbedding[]> {
        const { batchSize = 10, parallel = true } = options;
        const batches: string[][] = [];

        // Split into batches
        for (let i = 0; i < texts.length; i += batchSize) {
            batches.push(texts.slice(i, i + batchSize));
        }

        if (parallel) {
            // Process batches in parallel
            const batchPromises = batches.map(batch =>
                Promise.all(batch.map(text => this.generateEmbedding(text)))
            );
            const results = await Promise.all(batchPromises);
            return results.flat();
        } else {
            // Process batches sequentially
            const results: TensorEmbedding[] = [];
            for (const batch of batches) {
                const batchResults = await Promise.all(
                    batch.map(text => this.generateEmbedding(text))
                );
                results.push(...batchResults);
            }
            return results;
        }
    }

    // WASM-accelerated clustering
    async clusterEmbeddings(
        embeddingIds: string[],
        k: number,
        options: {
            useCache?: boolean;
            maxIterations?: number;
            convergenceThreshold?: number;
        } = {}
    ): Promise<ClusterResult[]> {
        const { useCache = true, maxIterations = 50, convergenceThreshold = 0.001 } = options;
        const cacheKey = `cluster_${embeddingIds.join('_')}_k${k}`;

        // Check cache
        if (useCache && this.clusterCache.has(cacheKey)) {
            return this.clusterCache.get(cacheKey)!;
        }

        // Load embeddings
        const embeddings = await Promise.all(
            embeddingIds.map(async (id) => {
                const cached = this.embeddingCache.get(id);
                if (cached) return cached;

                const tensor = await this.tensorCache.getTensor(id);
                if (tensor) {
                    return this.deserializeEmbedding(tensor, id);
                }

                throw new Error(`Embedding ${id} not found`);
            })
        );

        // Extract vectors for clustering
        const vectors = embeddings.map(e => e.vector);

        // Perform WASM-accelerated k-means
        const clusterResult = await this.wasmAccelerator.kMeansCluster(
            vectors,
            k,
            maxIterations
        );

        // Calculate silhouette scores
        const clusters: ClusterResult[] = clusterResult.centroids.map((centroid, clusterId) => {
            const members = embeddingIds.filter((_, i) => clusterResult.assignments[i] === clusterId);
            const silhouetteScore = this.calculateSilhouetteScore(
                vectors,
                clusterResult.assignments,
                clusterId
            );

            return {
                clusterId,
                centroid,
                members,
                silhouetteScore
            };
        });

        // Cache results
        if (useCache) {
            this.clusterCache.set(cacheKey, clusters);
        }

        return clusters;
    }

    // Semantic similarity search with WASM acceleration
    async findSimilarEmbeddings(
        queryEmbedding: TensorEmbedding,
        candidateIds: string[],
        topK: number = 10,
        threshold: number = 0.7
    ): Promise<Array<{ id: string; similarity: number; embedding: TensorEmbedding }>> {
        // Load candidate embeddings
        const candidates = await Promise.all(
            candidateIds.map(async (id) => {
                const cached = this.embeddingCache.get(id);
                if (cached) return { id, embedding: cached };

                const tensor = await this.tensorCache.getTensor(id);
                if (tensor) {
                    const embedding = await this.deserializeEmbedding(tensor, id);
                    return { id, embedding };
                }
                return null;
            })
        );

        const validCandidates = candidates.filter(c => c !== null);

        // Calculate similarities using WASM
        const similarities = validCandidates.map(candidate => {
            const similarity = this.calculateCosineSimilarity(
                queryEmbedding.vector,
                candidate!.embedding.vector
            );

            return {
                id: candidate!.id,
                similarity,
                embedding: candidate!.embedding
            };
        });

        // Filter by threshold and sort
        return similarities
            .filter(s => s.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
    }

    // Calculate cosine similarity using WASM dot product
    private calculateCosineSimilarity(a: Float32Array, b: Float32Array): number {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }

        const dotProduct = this.wasmAccelerator.tensorDotProduct(a, b);
        const normA = Math.sqrt(this.wasmAccelerator.tensorDotProduct(a, a));
        const normB = Math.sqrt(this.wasmAccelerator.tensorDotProduct(b, b));

        return dotProduct / (normA * normB);
    }

    private calculateEuclideanDistance(a: Float32Array, b: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    // Calculate silhouette score for clustering quality
    private calculateSilhouetteScore(
        vectors: Float32Array[],
        assignments: number[],
        clusterId: number
    ): number {
        const clusterMembers = vectors.filter((_, i) => assignments[i] === clusterId);
        if (clusterMembers.length <= 1) return 0;

        let totalScore = 0;

        for (let i = 0; i < vectors.length; i++) {
            if (assignments[i] !== clusterId) continue;

            // Calculate average intra-cluster distance
            let intraDistance = 0;
            for (const member of clusterMembers) {
                if (member !== vectors[i]) {
                    intraDistance += this.calculateEuclideanDistance(vectors[i], member);
                }
            }
            intraDistance /= (clusterMembers.length - 1);

            // Calculate minimum average inter-cluster distance
            const otherClusters = new Set(assignments.filter(a => a !== clusterId));
            let minInterDistance = Infinity;

            for (const otherCluster of otherClusters) {
                const otherMembers = vectors.filter((_, j) => assignments[j] === otherCluster);
                let interDistance = 0;
                for (const otherMember of otherMembers) {
                    interDistance += this.calculateEuclideanDistance(vectors[i], otherMember);
                }
                interDistance /= otherMembers.length;
                minInterDistance = Math.min(minInterDistance, interDistance);
            }

            // Silhouette score
            const score = (minInterDistance - intraDistance) / Math.max(intraDistance, minInterDistance);
            totalScore += score;
        }

        return totalScore / clusterMembers.length;
    }

    // Cache embedding with WASM compression
    private async cacheEmbeddingWithCompression(embedding: TensorEmbedding) {
        if (this.modelConfig.compressionLevel === 'none') {
            await this.tensorCache.storeTensorSlices(
                embedding.id,
                embedding.vector,
                [embedding.vector.length]
            );
            return;
        }

        const compressedData = await this.wasmAccelerator.compressTensor(
            embedding.vector,
            this.modelConfig.compressionLevel
        );

        await this.tensorCache.storeTensorSlices(
            embedding.id,
            new Uint8Array(compressedData) as any,
            [embedding.vector.length]
        );
    }

    // Deserialize embedding from cached tensor
    private async deserializeEmbedding(
        tensor: { data: ArrayBuffer; shape: number[]; dtype: string },
        id: string
    ): Promise<TensorEmbedding> {
        let vector: Float32Array;

        if (tensor.dtype === 'float16') {
            vector = this.tensorCache.unpackFloat16(tensor.data, tensor.shape[0]);
        } else if (tensor.dtype === 'int8') {
            // Reconstruct from quantized data
            const quantized = new Int8Array(tensor.data, 4); // Skip scale
            const scale = new Float32Array(tensor.data, 0, 1)[0];
            vector = new Float32Array(quantized.length);
            for (let i = 0; i < quantized.length; i++) {
                vector[i] = (quantized[i] / 127) * scale;
            }
        } else {
            vector = new Float32Array(tensor.data);
        }

        return {
            id,
            vector,
            metadata: { fromCache: true },
            timestamp: Date.now()
        };
    }

    // Generate consistent embedding ID from text
    private generateEmbeddingId(text: string): string {
        // Simple hash function for demo - use crypto.subtle.digest in production
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `embed_${Math.abs(hash)}_${this.modelConfig.modelName}`;
    }

    // Memory and performance monitoring
    getPerformanceMetrics(): {
        embeddingCacheSize: number;
        clusterCacheSize: number;
        wasmMemoryUsage: ReturnType<WebAssemblyAccelerator['getMemoryUsage']>;
        indexedDBUsage: ReturnType<TensorCache['getMemoryUsage']>;
    } {
        return {
            embeddingCacheSize: this.embeddingCache.size,
            clusterCacheSize: this.clusterCache.size,
            wasmMemoryUsage: this.wasmAccelerator.getMemoryUsage(),
            indexedDBUsage: this.tensorCache.getMemoryUsage()
        };
    }

    // Clean up resources
    async cleanup() {
        this.embeddingCache.clear();
        this.clusterCache.clear();
        this.wasmAccelerator.destroy();
        await this.tensorCache.clear();
    }

    // Export embeddings for analysis
    async exportEmbeddings(ids: string[]): Promise<Uint8Array> {
        const embeddings = await Promise.all(
            ids.map(async (id) => {
                const embedding = this.embeddingCache.get(id) ||
                    await this.deserializeEmbedding(
                        (await this.tensorCache.getTensor(id))!,
                        id
                    );

                return {
                    tensorId: id,
                    data: embedding.vector,
                    shape: [embedding.vector.length],
                    compressionLevel: this.modelConfig.compressionLevel
                };
            })
        );

        return this.wasmAccelerator.serializeTensorBatch(embeddings);
    }
}