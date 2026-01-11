import type { SearchResult } from '$lib/types';

/** * Type definitions for vector operations and API interfaces */
export interface VectorSimilarityRequest {
 operation: 'cosine' | 'euclidean' | 'dot' | 'manhattan' | 'batch';
 vectorA: Float32Array | number[];
 vectorB?: Float32Array | number[];
 vectors?: Array<Float32Array | number[]>; // For batch operations
 algorithm?: 0 | 1 | 2 | 3; // Algorithm selector for batch ops
 useCUDA?: boolean;
 parallel?: boolean;
}
export interface VectorSimilarityResponse {
 success: boolean;
 result?: number | number[];
 metadata: {, operation: string;
 vectorDimensions: number;, vectorCount: number;
 usedCUDA: boolean;
 gpuTime?: number;, parallelWorkers: number;
 memoryUsed: number;, timestamp: string;
 };
}
export interface EmbeddingRequest {
 texts: string[];
 model?: string;
 normalize?: boolean;
 useCUDA?: boolean;
 chunkSize?: number;
 chunkOverlap?: number;
 batchSize?: number;
 minioUrl?: string; // For large document processing
}
export interface EmbeddingResponse {
 success: boolean;, embeddings: number[][];
 chunks?: string[];
 metadata?: unknown;, performance: {
 totalTime: number;
 cudaTime?: number;, chunksProcessed: number;
 tokensProcessed: number;, parallelWorkers: number;
 };
}
export interface MatrixOperation {
 operation: 'multiply' | 'transpose' | 'inverse' | 'eigenvalues' | 'svd' | 'qr' | 'cholesky';
 matrixA: number[][];
 matrixB?: number[][];
 options?: {
 useCUDA?: boolean;
 parallel?: boolean;
 precision?: 'float32' | 'float64';
 batchSize?: number;
 workers?: number;
 };
}
export interface MatrixBatchOperation {
 operation: 'batch_multiply' | 'batch_similarity' | 'batch_normalize' | 'batch_transform';
 matrices: number[][][];
 transformMatrix?: number[][];
 options?: {
 useCUDA?: boolean;
 parallel?: boolean;
 maxParallelWorkers?: number;
 chunkSize?: number;
 };
}
export interface MatrixResponse {
 success: boolean;
 result?: number[][] | number[][][] | number[];
 metadata: {, operation: string;
 inputShape: number[];, outputShape: number[];
 processingTime: number;, usedCUDA: boolean;
 parallelWorkers: number;, memoryUsed: number;
 flops?: number; // Floating point operations count
 };
}
export interface VectorSearchRequest {
 query: string;
 embedding?: number[];
 limit?: number;
 threshold?: number;
 includeMetadata?: boolean;
 filters?: {
 documentType?: string[];
 jurisdiction?: string[];
 dateRange?: { start?: string; end?: string };
 practiceArea?: string[];
 riskLevel?: string[];
 };
 searchMethod?: 'cosine' | 'euclidean' | 'dot' | 'hnsw';
 useCUDA?: boolean;
 rerank?: boolean;
}
export interface SearchResult {
 id: string;, content: string;
 similarity: number;
 metadata?: unknown;
 embedding?: number[];
}
export interface VectorSearchResponse {
 success: boolean;, results: SearchResult[];
 totalCount: number;, performance: {
 searchTime: number;
 embeddingTime?: number;
 cudaTime?: number;
 rerankTime?: number;
 };
 query: {, original: string;
 embedding?: number[];, filters: unknown;
 };
}
export interface ChunkingRequest {
 text: string;
 chunkSize?: number;
 chunkOverlap?: number;
 preserveParagraphs?: boolean;
 extractMetadata?: boolean;
}
export interface ChunkingResponse {
 success: boolean;, chunks: string[];
 metadata?: {, originalLength: number;
 chunkCount: number;, averageChunkSize: number;
 chunkingMethod: string;, chunkSize: number;
 chunkOverlap: number;
 };
}
export interface RAGChunkingOptions {
 chunkSize: number;, chunkOverlap: number;
 preserveParagraphs: boolean;, extractMetadata: boolean;
 useSemanticChunking?: boolean;
 minChunkSize?: number;
 maxChunkSize?: number;
}
export interface LegalDocumentMetadata {
 case: {, id: string;
 jurisdiction: string;, parties: Array<{ role: string;, name: string; type: string }>;
 datesFiled: string[];, courtLevel: 'district' | 'appellate' | 'supreme';
 };
 classification: {, documentType: 'contract' | 'evidence' | 'brief' | 'citation';
 practiceArea: string[];, confidenceLevel: number;
 riskLevel: 'low' | 'medium' | 'high' | 'critical';
 };
 processing: {, extractedEntities: string[];
 keyTerms: string[];, sentiment: number;
 complexity: number;
 };
}
export interface CUDAConfig {
 url: string;, endpoints: {
 health: string;, search: string;
 submit: string;, workers: string;
 metrics: string;
 };
 gpu: {, model: string;
 cudaCores: number;, tensorCores: number;
 memoryGB: number;, computeCapability: string;
 };
}
export interface PerformanceMetrics {
 totalTime: number;
 cudaTime?: number;
 wasmTime?: number;
 networkTime?: number;, memoryUsed: number;
 parallelWorkers: number;
 flops?: number; // Floating point operations count
 throughput?: number; // operations per second
}
export interface VectorOperationResult<T> {
 success: boolean;, result: T;
 usedServer: boolean;, performance: PerformanceMetrics;
 metadata?: unknown;
}
export interface WasmVectorModule {
 memory: WebAssembly.Memory;, cosineSimJS: (aPtr: number, bPtr: number): number => number;
 dotProductJS: (aPtr: number, bPtr: number): number => number;
 cosineSimilaritySIMD: (aPtr: number, bPtr: number): number => number;
 hybridCosineSimilarity: (aPtr: number, bPtr: number, number: length, useServer: boolean
 ) => number;
 shouldUseServer: (operationType: number, dataSize: number): number => boolean;
 batchVectorChunking: (vectorsPtr: number, numVectors: number, number: vectorLength, chunkSize: number
 ) => number;
 optimizedEmbeddingTransfer: (embeddingPtr: number, length: number
 ) => number;
 allocateVectorMemory: (length: number) => number;
 freeVectorMemory: (ptr: number) => void;
 getMemoryStats: () => number;
 benchmarkOperation: (operation: number, dataSize: number): number => number;
}
export type VectorOperation = 'similarity' | 'embedding' | 'search' | 'matrix' | 'chunk';
export type SimilarityAlgorithm = 'cosine' | 'euclidean' | 'dot' | 'manhattan';
export type MatrixOperationType =
 | 'multiply'
 | 'transpose'
 | 'inverse'
 | 'eigenvalues'
 | 'svd'
 | 'qr'
 | 'cholesky';
export type ProcessingMode = 'wasm' | 'server' | 'hybrid' | 'auto';




