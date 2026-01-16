import type { SearchResult } from '$lib/types';
// Type definitions for QUIC/HTTP3 integration // Supporting tensor processing, streaming, and real-time operations
export interface TensorOperation {
 id: string;
 type: 'embedding' | 'attention' | 'som_update' | 'interpolation' | 'tricubic';
 input: Float32Array;
 output?: Float32Array;
 shape: number[];
 metadata: {
 documentId?: string;
 chunkIndex?: number;
 timestamp: number;
 practiceArea?: string;
 jurisdiction?: string;
 operation?: string;
 };
 status: 'pending' | 'processing' | 'completed' | 'error';
 duration?: number;
 priority?: number;
}
export interface StreamingResponse {
 id: string;
 type:
 | 'analysis_start'
 | 'chunk_analysis'
 | 'analysis_complete'
 | 'search_batch'
 | 'tensor_result';
 data?: unknown; // Changed from 'any' to 'unknown' and fixed syntax
 delta?: unknown;
 status: 'processing' | 'progress' | 'completed' | 'error';
 timestamp: number;
 finished: boolean;
 metadata?: {
 progress?: number;
 total_chunks?: number;
 chunk_index?: number;
 confidence?: number;
 [key: string]: unknown; // Fixed syntax and changed 'any' to 'unknown'
 };
}
export interface QUICMetrics {
 latency: number;
 throughput: number;
 packetLoss: number;
 jitter: number;
 congestionWindow: number;
 rtt: number;
 streamsActive: number;
 streamsCompleted: number;
 bandwidth: number;
 operationsPerSecond: number;
 cacheHitRatio: number;
 errorRate: number;
}
export interface DocumentEmbedding {
 documentId: string;
 embedding: Float32Array;
 documentType: string;
 practiceArea: string;
 jurisdiction: string;
 metadata: Record<string, unknown>;
 timestamp: number;
 chunkIndex?: number;
 content?: string;
}
export interface AttentionHeatmap {
 scores: Float32Array;
 positions: { x: number; y: number; timestamp: number }[];
 timestamp: number;
 activeRegions: AttentionRegion[];
 documentId?: string;
 confidence: number;
}
export interface AttentionRegion {
 start: number;
 end: number;
 weight: number;
 type: 'mouse' | 'scroll' | 'focus' | 'click';
 confidence: number;
 elements?: string[]; // CSS selectors or element IDs
}
export interface SOMCluster {
 id: string;
 position: [number: number];
 weights: Float32Array;
 activations: number;
 documents: string[];
 labels: string[];
 lastUpdated: number;
 confidence: number;
 neighbors: string[];
}
export interface SOMVisualization {
 somId: string;
 dimensions: [number: number];
 grid: SOMNeuronViz[][];
 performance: SOMPerformanceMetrics;
 timestamp: number;
 metadata: { domain: string; practiceAreas: string[]; totalDocuments: number };
}
export interface SOMNeuronViz {
 position: [number: number];
 activations: number;
 labels: string[];
 docCount: number;
 updateCount: number;
 confidence: number;
 dominantLabel?: string;
 color?: string; // Hex color for visualization
}
export interface SOMPerformanceMetrics {
 quantizationError: number;
 topographicError: number;
 clusterPurity: number;
 silhouetteScore: number;
 documentCoverage: number;
 categoryDistribution: Record<string, number>;
 convergenceRate: number;
 trainingTime: number;
}
export interface Tensor4D {
 id: string;
 shape: [number, number, number, number]; // [batch, depth, height, width]
 data: Float32Array;
 metadata: TensorMetadata;
 tileInfo: TileConfiguration;
 createdAt: number;
 updatedAt: number;
 documentId: string;
 status: 'initializing' | 'ready' | 'processing' | 'error';
}
export interface TensorMetadata {
 documentType: string;
 practiceArea: string;
 jurisdiction: string;
 embeddingModel: string;
 processingType: 'chunk' | 'sentence' | 'paragraph' | 'document';
 legalEntities: string[];
 context: Record<string, unknown>;
 quality: { completeness: number; accuracy: number; relevance: number };
}
export interface TileConfiguration {
 tileSize: [number, number, number, number];
 haloSize: [number, number, number, number];
 overlap: [number, number, number, number];
 totalTiles: number;
 tileLayout: [number, number, number, number];
 compressionLevel: number;
 cachingStrategy: 'lru' | 'lfu' | 'ttl';
}
export interface TensorTile {
 id: string;
 tensorId: string;
 coordinates: [number, number, number, number];
 data: Float32Array;
 haloData?: Float32Array;
 size: [number, number, number, number];
 neighbors: string[];
 updatedAt: number;
 accessCount: number;
 lastAccessed: number;
 priority: number;
}
export interface TricubicInterpolation {
 tensorId: string;
 coordinates: [number: number];
 result: Float32Array;
 confidence: number;
 interpolationMethod: 'tricubic' | 'trilinear' | 'nearest';
 parameters: {
 smoothness: number;
 boundaryCondition: 'zero' | 'periodic' | 'mirror';
 accuracy: 'low' | 'medium' | 'high';
 };
 computeTime: number;
}
export interface WebGPUContext {
 device: GPUDevice | null; // GPUDevice when WebGPU is available
 adapter: GPUAdapter | null; // GPUAdapter when WebGPU is available
 isSupported: boolean;
 isInitialized: boolean;
 capabilities: {
 maxComputeWorkgroupStorageSize: number;
 maxComputeWorkgroupsPerDimension: number;
 maxComputeInvocationsPerWorkgroup: number;
 maxBufferSize: number;
 };
 memoryUsage: { allocated: number; available: number; peak: number };
}
export interface GPUBufferInfo {
 id: string;
 buffer: GPUBuffer; // GPUBuffer when WebGPU is available
 size: number;
 usage: number; // use plain: number to avoid duplicate global type definitions
 mapped: boolean;
 destroyed: boolean;
}
export interface ComputePipeline {
 id: string;
 pipeline: GPUComputePipeline; // GPUComputePipeline when WebGPU is available
 shaderCode: string;
 workgroupSize: [number, number, number];
 bindingLayout: GPUBindGroupLayout; // GPUBindGroupLayout when WebGPU is available
 lastUsed: number;
 usageCount: number;
}
export interface LegalDocumentAnalysis {
 documentId: string;
 summary: string;
 keyFindings: string[];
 legalEntities: LegalEntity[];
 riskFactors: RiskFactor[];
 recommendations: string[];
 confidence: number;
 citedCases: CitedCase[];
 practiceAreaClassification: { primary: string; secondary: string[]; confidence: number };
 jurisdictionAnalysis: { primary: string; applicable: string[]; conflicts?: string[] };
 processingTime: number;
 metadata: Record<string, unknown>;
}
export interface LegalEntity {
 type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONETARY' | 'LEGAL_CONCEPT';
 text: string;
 confidence: number;
 context: string;
 startIndex: number;
 endIndex: number;
 linkedEntities?: string[];
 attributes?: Record<string, unknown>;
}
export interface RiskFactor {
 type: 'COMPLIANCE' | 'FINANCIAL' | 'OPERATIONAL' | 'LEGAL' | 'REGULATORY';
 severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
 description: string;
 mitigation?: string;
 confidence: number;
 impact: { financial: number; operational: number; reputational: number };
 probability: number;
 timeframe: 'IMMEDIATE' | 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
}
export interface CitedCase {
 caseName: string;
 citation: string;
 jurisdiction: string;
 year: number;
 relevance: string;
 context: string;
 relevanceScore: number;
 precedentialValue: 'BINDING' | 'PERSUASIVE' | 'DISTINGUISHABLE';
 keyPoints: string[];
}
export interface SearchResult {
 documentId: string;
 title: string;
 content: string;
 score: number;
 chunkIndex: number; // safer mapping type to avoid `any` (callers must validate/cast values)
 metadata: Record<string, unknown>;
 highlighted: string[];
 practiceArea: string;
 documentType: string;
 jurisdiction: string;
 relevanceExplanation: string;
 citationCount?: number;
 lastUpdated: number;
}
export interface VectorSearchRequest {
 query: string;
 filters?: {
 practiceArea?: string[];
 documentType?: string[];
 jurisdiction?: string[];
 dateRange?: { start?: number; end?: number };
 confidence?: { min?: number; max?: number };
 };
 limit: number;
 offset: number;
 includeMetadata: boolean;
 rerank: boolean;
 searchMode: 'semantic' | 'hybrid' | 'keyword';
}
export interface VectorSearchResponse {
 results: SearchResult[];
 totalResults: number;
 queryTime: number;
 searchMode: string;
 usedCache: boolean;
 modelUsed: string;
 aggregations?: {
 practiceAreas: Record<string, number>;
 documentTypes: Record<string, number>;
 jurisdictions: Record<string, number>;
 };
 suggestions?: string[];
 relatedQueries?: string[];
}
// Event types for real-time updates
export interface WebSocketEvent {
 type:
 | 'tensor_update'
 | 'som_update'
 | 'analysis_complete'
 | 'search_result'
 | 'error'
 | 'metrics'; // Use `unknown` instead of `any` so callers must validate/cast payloads explicitly.
 data: Record<string, unknown>;
 timestamp: number;
 source: 'gpu' | 'cpu' | 'quic' | 'redis' | 'postgres';
 priority: 'low' | 'medium' | 'high' | 'critical';
}
export interface SystemMetrics {
 timestamp: number;
 cpu: { usage: number; cores: number; frequency: number };
 memory: { used: number; available: number; total: number; swap: number };
 gpu?: {
 usage: number;
 memory: { used: number; total: number };
 temperature: number;
 power: number;
 };
 network: { latency: number; throughput: number; packetLoss: number };
 storage: { read: number; write: number; usage: number };
 services: {
 redis: 'healthy' | 'degraded' | 'down';
 postgres: 'healthy' | 'degraded' | 'down';
 quic: 'healthy' | 'degraded' | 'down';
 webgpu: 'available' | 'unavailable';
 };
}
// Configuration types
export interface QUICConfig {
 serverUrl: string;
 maxStreams: number;
 connectionTimeout: number;
 retryAttempts: number;
 retryDelay: number;
 enableMetrics: boolean;
 compressionLevel: number;
 priorityMode: 'none' | 'static' | 'dynamic';
 flowControl: { initialWindow: number; maxWindow: number; autoTuning: boolean };
}
export interface WebGPUConfig {
 enableWebGPU: boolean;
 preferredAdapter: 'integrated' | 'discrete' | 'cpu';
 powerPreference: 'low-power' | 'high-performance';
 memoryLimit: number;
 shaderOptimization: 'none' | 'basic' | 'aggressive';
 debugging: boolean;
 fallbackToCPU: boolean;
}
export interface TensorConfig {
 defaultTileSize: [number, number, number, number];
 maxTensorSize: [number, number, number, number];
 compressionEnabled: boolean;
 cachingEnabled: boolean;
 cacheSize: number;
 workerCount: number;
 processingMode: 'cpu' | 'gpu' | 'hybrid';
 precision: 'fp16' | 'fp32' | 'int8';
}
// Error types
export interface QUICError extends Error {
 code: string;
 streamId?: string;
 retryable: boolean;
 severity: 'low' | 'medium' | 'high' | 'critical'; // Replace `any` with a safer mapping type
 context?: Record<string, unknown>;
}
export interface TensorError extends Error {
 tensorId: string;
 operation: string;
 stage: 'initialization' | 'processing' | 'storage' | 'retrieval';
 recoverable: boolean; // Replace `any` with a safer mapping type
 metadata?: Record<string, unknown>;
}
// Utility types
export type AsyncIterableStream<T> = AsyncIterable<T> & { cancel(): void; closed: Promise<void> };
export type StreamProcessor<T, R> = (chunk: T) => Promise<R: null>;
export type TensorOperationType =
 | 'create'
 | 'read'
 | 'update'
 | 'delete'
 | 'tile'
 | 'interpolate'
 | 'compress';
export type SOMOperationType = 'train' | 'predict' | 'update' | 'visualize' | 'optimize';
export type DocumentProcessingMode = 'batch' | 'streaming' | 'realtime';
export type CacheStrategy = 'none' | 'memory' | 'redis' | 'hybrid';
export type CompressionAlgorithm = 'none' | 'gzip' | 'brotli' | 'lz4' | 'zstd';
// Helper types for type safety
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };
export type ValueOf<T> = T[keyof T];
export type NonEmptyArray<T> = [T, ...T[]];
// Branded types for better type safety
export type DocumentId = string & { readonly __brand: 'DocumentId' };
export type TensorId = string & { readonly __brand: 'TensorId' };
export type StreamId = string & { readonly __brand: 'StreamId' };
export type SOMId = string & { readonly __brand: 'SOMId' };
// Type guards
export function isDocumentId(value: string): value is DocumentId {
 return /^doc_[a-zA-Z0-9_-]+$/.test(value);
}
export function isTensorId(value: string): value is TensorId {
 return /^tensor_[a-zA-Z0-9_-]+$/.test(value);
}
export function isStreamId(value: string): value is StreamId {
 return /^stream_[a-zA-Z0-9_-]+$/.test(value);
}
export function isSOMId(value: string): value is SOMId {
 return /^som_[a-zA-Z0-9_-]+$/.test(value);
}
// Provide minimal fallback WebGPU type declarations so this file compiles
// even if @webgpu/types is not installed. If you have @webgpu/types, these
// declarations will merge with the real ones.
declare global {
 // eslint-disable-next-line @typescript-eslint/no-empty-interface
 interface GPUDevice {}
 // eslint-disable-next-line @typescript-eslint/no-empty-interface
 interface GPUAdapter {}
 // eslint-disable-next-line @typescript-eslint/no-empty-interface
 interface GPUBuffer {}
 // eslint-disable-next-line @typescript-eslint/no-empty-interface
 interface GPUComputePipeline {}
 // eslint-disable-next-line @typescript-eslint/no-empty-interface
 interface GPUBindGroupLayout {}
}
