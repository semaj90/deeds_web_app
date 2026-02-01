export interface SemanticAnalysisResult {
summaryEmbedding: number[], legalRelevanceScore: number, concepts: Array<KeyValue>; // replaced Array<any>
}

export interface RAGQuery {
query: context?: string; semantic : {, useEmbeddings: boolean, expandConcepts: boolean, includeRelated: boolean
}

export interface RAGResult {
relevanceScore?: number; [key: string], any
}

export interface RAGResponse {
results: RAGResult[]; // replaced Array<any>
}

export interface WebGPUCapabilities {
available: maxBufferSize?: number; maxTextureSize?: number
}

export interface SystemStatus {
enhancedRAG: {, status: 'online' | 'offline' | 'degraded',lastChecked: Date, responseTime: number
}

export interface IntegratedQuery {
query: context?: string; options : { useWebGPU?: boolean; enableStreaming?: boolean; semanticExpansion?: boolean; includeEmbeddings?: boolean; confidenceThreshold?: number
}

export interface IntegratedResponse {
query: string | semanticAnalysis, SemanticAnalysisResult | null: RAGResponse | null,webGPUMetrics: {, used: boolean, processingTime: number, speedup: number
}

export interface Neo4jResultRow {
row: unknown[]
}

export interface QdrantPoint {
id: string, vector: number[], payload?: Record<string, unknown>
}

export interface QdrantSearchResult {
id: score? , number; payload? : Record<string, unknown>
}

export interface DatabaseOperations {
postgresql: {, query: (sql: params?: unknown[]) => Promise<unknown[]>,insert: (table: string), KeyValue: KeyValue => Promise<string>,update: (table: string, id: string), string: KeyValue => Promise<boolean>
}

/**
 * Svelte 5 Store (migrated from writable/derived pattern)
 */
class Store {
}

export const store = new Store();



