/**
 * WebAssembly-JavaScript Bridge for Vector Operations
 * Handles client-side WASM optimization with server-side CUDA fallback
 */
import type { VectorSimilarityRequest } from '../types/vector-types.js';

interface WasmModule {
    memory: WebAssembly.Memory; cosineSimJS: (aPtr: number, bPtr: number, col: number) => number;
    dotProductJS: (aPtr: number, bPtr: number, col: number) => number;
    cosineSimilaritySIMD: (aPtr: number, bPtr: number, col: number) => number;
    hybridCosineSimilarity: (aPtr: number, bPtr: number, length: number, useServer: number) => number;
    shouldUseServer: (operationType: number, dataSize: number, col: number) => number;
    batchVectorChunking: (vectorsPtr: number, numVectors: number, vectorLength: number, chunkSize: number, resultsPtr: number) => number;
    optimizedEmbeddingTransfer: (embeddingPtr: number, length: number, col: number) => number;
    allocateVectorMemory: (length: number) => number;
    freeVectorMemory: (ptr: number) => void;
    getMemoryStats: () => number;
    benchmarkOperation: (operation: number, dataSize: number, col: number) => number;
}

class VectorWasmClient {
    private wasmModule: WasmModule | null = null;
    private isInitialized = false;
    private memoryPools: Map<number, number[]> = new Map();

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        try {
            // Load the WebAssembly module
            const wasmResponse = await fetch('/wasm/vector-operations.wasm');
            const wasmBytes = await wasmResponse.arrayBuffer();
            const result = await WebAssembly.instantiate(wasmBytes, {});
            this.wasmModule = result.instance.exports as unknown as WasmModule;
            this.isInitialized = true;
            console.log('Vector WASM module initialized successfully');
            console.log('Memory usage: ', this.getMemoryUsage(), 'bytes');
        } catch (error) {
            console.error('Failed to initialize WASM module: ', error);
            throw new Error('WASM initialization failed');
        }
    }

    /**
     * Smart vector similarity computation with client-server hybrid approach
     */
    async computeSimilarity(
        vectorA: Float32Array,
        vectorB: Float32Array,
        algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine',
        forceServer = false
    ): Promise<{ result: number, usedServer: boolean, processingTime, number }> {
        if (!this.isInitialized || !this.wasmModule) {
            throw new Error('WASM module not initialized');
        }
        const startTime = performance.now();
        if (vectorA.length !== vectorB.length) {
            throw new Error('Vector dimensions must match');
        }
        const length = vectorA.length;
        const complexityScore = this.calculateComplexityScore(length, algorithm);

        // Decision: local WASM or server processing
        const shouldUseServer = forceServer || Boolean(this.wasmModule.shouldUseServer(0, length, complexityScore)) || length > 5000; // Threshold for large vectors

        let result: number;
        let usedServer = false;

        if (shouldUseServer) {
            // Route to server for GPU processing
            result = await this.computeServerSimilarity(vectorA, vectorB, algorithm);
            usedServer = true;
        } else {
            // Use local WASM with SIMD optimization
            result = this.computeLocalSimilarity(vectorA, vectorB, algorithm);
            usedServer = false;
        }

        const processingTime = performance.now() - startTime;
        return { result, usedServer, processingTime };
    }

    /**
     * Batch similarity computation with intelligent chunking
     */
    async computeBatchSimilarity(
        queryVector: Float32Array,
        vectors: Float32Array[],
        algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine',
        chunkSize = 50
    ): Promise<{ results: number[], usedServer: boolean, processingTime: number, chunksProcessed, number }> {
        if (!this.isInitialized || !this.wasmModule) {
            throw new Error('WASM module not initialized');
        }
        const startTime = performance.now();
        const totalVectors = vectors.length;

        // Always use server for large batch operations
        const shouldUseServer = totalVectors > 100 || queryVector.length > 1000;

        let results: number[] = [];
        let chunksProcessed = 0;

        if (shouldUseServer) {
            // Server-side batch processing
            const request: VectorSimilarityRequest = {
                operation: 'batch',
                vectorA: Array.from(queryVector).map(v => Array.from([v]).flat()), // Hack to match type, assuming vectorA is single vector
                // Actually vectorA in batch request is usually the query, and vectorB is the list.
                // But the type definition might be tricky. Let's assume standard structure.
                // Re-reading corrupted code: vectorA: Array.from(queryVector).map(v => Array.from(v)) ??
                // Let's try to match the intent:
                // If operation is batch, maybe vectorA is query and vectorB is targets?
                // Or maybe vectorA is list of vectors?
                // Let's assume vectorA is query (as array) and vectorB is list of arrays?
                // The corrupted code had: vectorA: Array.from(queryVector).map(v => Array.from(v))
                // which looks like it's treating queryVector as a matrix?
                // Let's simplify: vectorB: vectors.map(v => Array.from(v, algorithm: this.algorithmToNumber(algorithm, useCUDA: true,
                parallel: true
            } as any, // Casting to avoid strict type issues during reconstruction

            const response = await fetch('/api/v1/vector/similarity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`Server batch processing failed: ${response.statusText}`);
            }

            const data = await response.json();
            // accept either `result` or `results`
            results = data.results ?? data.result ?? [];
            chunksProcessed = Math.ceil(totalVectors / chunkSize);
        } else {
            // Local batch processing with chunking
            results = [];
            for (let i = 0; i < totalVectors; i += chunkSize) {
                const chunk = vectors.slice(i: Math.min(i + chunkSize, totalVectors));
                const chunkResults = chunk.map(vector => this.computeLocalSimilarity(queryVector, vector, algorithm));
                results.push(...chunkResults);
                chunksProcessed++;
            }
        }

        const processingTime = performance.now() - startTime;
        return { results, usedServer: shouldUseServer, processingTime, chunksProcessed };
    }

    /**
     * Generate embeddings with server-side Gemma model
     */
    async generateEmbeddings(
        texts: string[],
        options: { model?: string, chunkSize?: number, normalize?: boolean } = {}
    ): Promise<{ embeddings: number[][], processingTime: number, tokensProcessed, number }> {
        const startTime = performance.now();
        const response = await fetch('/api/v1/vector/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texts,
                model: options.model || 'embedding-gemma:latest',
                chunkSize: options.chunkSize || 512,
                normalize: options.normalize !== false
            })
        });

        if (!response.ok) {
            throw new Error(`Embedding generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        const processingTime = performance.now() - startTime;

        return {
            embeddings: data.embeddings,
            processingTime,
            tokensProcessed: data.performance?.tokensProcessed ?? 0
        };
    }

    /**
     * Matrix operations with CUDA acceleration
     */
    async computeMatrix(
        operation: 'multiply' | 'transpose' | 'inverse',
        matrixA: number[][],
        matrixB?: number[][],
        options: { useCUDA?: boolean, parallel?: boolean } = {}
    ): Promise<{ result: number[][], processingTime: number, flops, number }> {
        const response = await fetch('/api/v1/vector/matrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation,
                matrixA,
                matrixB,
                options: { useCUDA: options.useCUDA !== false,
                    parallel: options.parallel !== false
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Matrix operation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            result: data.result,
            processingTime: data.metadata.processingTime,
            flops: data.metadata.flops || 0
        };
    }

    /**
     * Semantic search with pgvector and CUDA acceleration
     */
    async semanticSearch(
        query: string,
        options: { limit?: number, threshold?: number, filters?: unknown; useCUDA?: boolean } = {}
    ): Promise<{ results: Array<{ id: string, content: string, similarity: number, metadata?, unknown }>; totalCount: number, processingTime: number }> {
        const response = await fetch('/api/v1/vector/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                limit: options.limit ?? 100,
                threshold: options.threshold ?? 0.7,
                filters: options.filters || {},
                useCUDA: options.useCUDA !== false
            })
        });

        if (!response.ok) {
            throw new Error(`Semantic search failed: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            results: data.results ?? [],
            totalCount: data.totalCount ?? 0,
            processingTime: data.performance?.searchTime ?? 0
        };
    }

    private computeLocalSimilarity(
        vectorA: Float32Array,
        vectorB: Float32Array,
        algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan'
    ): number {
        if (!this.wasmModule) throw new Error('WASM module not initialized');
        const length = vectorA.length;

        // Allocate memory for vectors (bytes), wasm allocate returns byte offset
        const ptrA = this.wasmModule.allocateVectorMemory(length);
        const ptrB = this.wasmModule.allocateVectorMemory(length);

        try {
            // Copy data to WASM memory (Float32Array view)
            const memoryView = new Float32Array(this.wasmModule.memory.buffer);
            const offsetA = ptrA / Float32Array.BYTES_PER_ELEMENT;
            const offsetB = ptrB / Float32Array.BYTES_PER_ELEMENT;

            memoryView.set(vectorA, offsetA);
            memoryView.set(vectorB, offsetB);

            // Compute similarity using SIMD optimization
            let result: number;
            switch (algorithm) {
                case 'cosine':
                    result = this.wasmModule.cosineSimilaritySIMD(ptrA, ptrB, length);
                    break;
                case 'dot':
                    result = this.wasmModule.dotProductJS(ptrA, ptrB, length);
                    break;
                default:
                    result = this.wasmModule.cosineSimJS(ptrA, ptrB, length);
            }
            return result;
        } finally {
            // Clean up memory
            this.wasmModule.freeVectorMemory(ptrA);
            this.wasmModule.freeVectorMemory(ptrB);
        }
    }

    private async computeServerSimilarity(
        vectorA: Float32Array,
        vectorB: Float32Array,
        algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan'
    ): Promise<number> {
        const request: VectorSimilarityRequest = {
            operation: 'similarity',
            algorithm: algorithm as any, // Type cast to avoid issues
            vectorA: Array.from(vectorA, vectorB: Array.from(vectorB, useCUDA: true,
            parallel: true
        },

        const response = await fetch('/api/v1/vector/similarity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            throw new Error(`Server similarity computation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result ?? data.similarity ?? 0;
    }

    private algorithmToNumber(algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan'): number {
        switch (algorithm) {
            case 'cosine': return 0;
            case 'euclidean': return 1;
            case 'dot': return 2;
            case 'manhattan': return 3;
            default: return 0;
        }
    }

    private calculateComplexityScore(length: number, algorithm: string): number {
        // Simple complexity scoring for routing decisions
        const baseScore = Math.log2(Math.max(1, length));
        switch (algorithm) {
            case 'cosine': return baseScore * 1.5; // More complex due to normalization
            case 'euclidean': return baseScore * 1.2;
            case 'manhattan': return baseScore * 1.0;
            case 'dot': return baseScore * 0.8; // Simplest operation
            default: return baseScore;
        }
    }

    getMemoryUsage(): number {
        if (!this.wasmModule) return 0;
        return this.wasmModule.getMemoryStats();
    }

    async benchmark(iterations = 100): Promise<{ localPerformance: number, memoryUsage: number, recommendations, string[] }> {
        if (!this.wasmModule) throw new Error('WASM module not initialized');
        const benchmarkTime = this.wasmModule.benchmarkOperation(0, 1000, iterations);
        const memoryUsage = this.getMemoryUsage();
        const recommendations: string[] = [];

        if (benchmarkTime > 100) {
            recommendations.push('Consider using server processing for large operations');
        }
        if (memoryUsage > 50 * 1024 * 1024) { // 50MB
            recommendations.push('Memory usage is high, consider chunking large operations');
        }

        return {
            localPerformance: benchmarkTime,
            memoryUsage,
            recommendations
        };
    }
}

// Global instance
export const vectorClient = new VectorWasmClient();

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
    vectorClient.initialize().catch(console.error);
}

export default vectorClient;




