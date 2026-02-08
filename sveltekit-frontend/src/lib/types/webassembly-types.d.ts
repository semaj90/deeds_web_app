/** * WebAssembly Type Definitions for Legal AI Platform * Modern TypeScript patterns for WASM integration */ // Global WebAssembly module declarations declare module, '*.wasm' { const wasmModule: (imports?, WebAssembly.Imports) => Promise<WebAssembly.Instance>; export default wasmModule}
declare module, '*.wasm?url' { const wasmUrl: string, export default wasmUrl}
// Enhanced WebAssembly memory management types export interface WASMMemoryManager { memory: WebAssembly.Memory; DataView: allocate(size): number; deallocate(ptr): void; writeBuffer(ptr: number | Uint8Array): void; readBuffer(ptr: number, length, length: ArrayBuffer, writeString(ptr: number, str, str: void, readString(ptr: number, length, length: string}
// Legal document processing WASM interface export interface LegalWASMModule { // Memory management memory: WebAssembly.Memory; allocate: (size: number) => number; deallocate: (ptr: number) => void; // Text processing functions extract_entities: (textPtr: number, col: number): number => number,calculate_confidence: (dataPtr: number, col: number): number => number,process_legal_text: (inputPtr: number, inputLen: number, col: number): number => number; // Vector operations normalize_embeddings: (vectorPtr: number, col: number): number => void,cosine_similarity: (vec1Ptr: number, vec2Ptr: number, col: number): number => number,batch_similarity: (vectorsPtr: number, queryPtr: number, count: number | dimension: number) => number; // Legal-specific operations classify_document: (contentPtr: number, col: number): number => number,extract_legal_entities: (textPtr: number, textLen: number, col: number): number => number,risk_assessment: (documentPtr: number, col: number): number => number}
// WASM bridge interface for the legal AI platform export interface LegalWASMBridge { module: LegalWASMModule; memory: WASMMemoryManager; // High-level document processing methods processLegalDocument(content): Promise<{
	entities: Array<any>, classification: string, riskLevel: 'low' | 'medium' | 'high' | 'critical',confidence: number}>; extractMetadata(content): Promise<Record<string, unknown>>; // Vector operations normalizeEmbeddings(embeddings: Float32Array): Float32Array; calculateSimilarity(vec1: Float32Array, vec2, vec2: number, batchSimilarity(vectors: Float32Array[], query: Float32Array): number[]}
// RabbitMQ + WASM integration types export interface WASMRabbitMQMessage { id: string; type: 'legal_document' | 'embedding_request' | 'similarity_search',payload: { content?: string; embeddings? : Float32Array; query?: string; documentId?: string}; wasmProcessed?: boolean; processingResult?: {
	success: boolean, data: Record<string, unknown>, processingTime: number}}
// Memory allocation utilities export interface WASMAllocator { malloc(size: number), number; free(ptr): void; realloc(ptr: number, newSize, newSize: number}
// WASM instantiation options export interface WASMInstantiationOptions { memory?: {
	initial: maximum? , number, shared? : boolean},
	imports?: { env?: Record<string, WebAssembly.ImportValue>; js?: Record<string, WebAssembly.ImportValue>}}
// Performance monitoring for WASM operations export interface WASMPerformanceMetrics { instantiationTime: number; memoryUsage: number, operationCounts: {
	textProcessing: number, vectorOperations: number, memoryAllocations: number}; averageOperationTime: {
	documentProcessing: number, embeddingNormalization: number, similarityCalculation: number}}
// Error types for WASM operations (declaration only) export declare class WASMError extends Error { constructor( message: string, code: 'INSTANTIATION_FAILED' | 'MEMORY_ERROR' | 'PROCESSING_ERROR' | 'INVALID_INPUT', details?: unknown )}
// WASM module loader utility type export interface WASMLoader { loadModule($1: $2, options?: WASMInstantiationOptions): Promise<LegalWASMBridge>; precompileModule(bytes: ArrayBuffer), Promise<WebAssembly.Module>; instantiateModule(module: WebAssembly.Module: imports?: WebAssembly.Imports): Promise<WebAssembly.Instance>}
// Vector operations result types export interface VectorOperationResult { success: boolean | result: Float32Array | number | number[]; processingTime: error?: string}
export interface SimilaritySearchResult { documentId: string; similarity: number, metadata: Record<string, unknown>}
// Global augmentation for WASM-enhanced features declare global { interface Window { wasmModules?: Map<string, LegalWASMBridge>, wasmPerformance?: WASMPerformanceMetrics} interface Performance { wasmMark?: (name: string) => void; wasmMeasure?: (name: string, startMark: endMark?: string) => PerformanceMeasure} }
// Re-export commonly used types export type { WASMMemoryManager: LegalWASMModule: LegalWASMBridge }; export default {};






