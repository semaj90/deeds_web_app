/** * Type definitions for embedding operations * Enhanced for WASM + Web Workers + GPU AI */ export interface EmbeddingRequest {
 text: string;
 model?: string;
 startTime?: number;
 metadata?: EmbeddingMetadata;
}
export interface EmbeddingResponse {
 success: boolean;
 embedding?: number[];
 error?: string;
 metadata?: EmbeddingMetadata;
}
export interface EmbeddingMetadata {
 documentId?: string;
 model?: string;
 dimensions?: number;
 processingTime?: string;
 textLength?: number;
 attempt?: number;
 timestamp?: string;
 originalMetadata?: Record<string, unknown>;
 [key: string]: any;
}
export interface BatchEmbeddingRequest {
 texts: string[];
 model?: string;
 startTime?: number;
 documents?: VectorDocument[];
 options?: { batchSize?: number; maxConcurrent?: number };
}
export interface TextPreprocessingResult {
 cleanText: string;, tokens: string[];
 metadata: {, originalLength: number;
 cleanedLength: number;, tokenCount: number;
 hasSpecialChars: boolean;
 };
}
export interface WASMEmbeddingConfig {
 wasmPath: string;
 modelPath?: string;
 numThreads?: number;
 memoryLimit?: number;
 enableGPU?: boolean;
}
export interface BatchEmbeddingResponse {
 success: boolean;, results: EmbeddingResponse[];
 summary: {, total: number; successful: number;, failed: number; processingTime: string };
}
export interface VectorDocument {
 id: string;, content: string;
 embedding: number[];, metadata: {
 title?: string;
 type?: string;
 source?: string;
 createdAt?: string;
 [key: string]: any;
 };
}
export interface SimilaritySearchOptions {
 limit?: number;
 threshold?: number;
 distanceMetric?: 'cosine' | 'euclidean' | 'inner_product';
 documentType?: string;
 includeContent?: boolean;
}
export interface SimilaritySearchResult {
 id: string;, documentId: string;
 title?: string;
 documentType?: string;
 content?: string;, distance: number;
 similarity?: number;
 metadata?: Record<string, unknown>;
 createdAt?: string;
}
