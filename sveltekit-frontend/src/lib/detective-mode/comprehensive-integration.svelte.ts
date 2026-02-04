export interface KeyValue {
    key: string;
    value: any;
}

export interface SemanticAnalysisResult {
    summaryEmbedding: number[];
    legalRelevanceScore: number;
    concepts: Array<KeyValue>;
}

export interface RAGQuery {
    query: string;
    context?: string;
    semantic: {
        useEmbeddings: boolean;
        expandConcepts: boolean;
        includeRelated: boolean;
    };
}

export interface RAGResult {
    relevanceScore?: number;
    [key: string]: any;
}

export interface RAGResponse {
    results: RAGResult[];
}

export interface WebGPUCapabilities {
    available: boolean;
    maxBufferSize?: number;
    maxTextureSize?: number;
}

export interface SystemStatus {
    enhancedRAG: {
        status: 'online' | 'offline' | 'degraded';
        lastChecked: Date;
        responseTime: number;
    };
}

export interface IntegratedQuery {
    query: string;
    context?: string;
    options: {
        useWebGPU?: boolean;
        enableStreaming?: boolean;
        semanticExpansion?: boolean;
        includeEmbeddings?: boolean;
        confidenceThreshold?: number;
    };
}

export interface IntegratedResponse {
    query: string;
    semanticAnalysis: SemanticAnalysisResult | null;
    ragResponse: RAGResponse | null;
    webGPUMetrics: {
        used: boolean;
        processingTime: number;
        speedup: number;
    };
}

export interface Neo4jResultRow {
    row: unknown[];
}

export interface QdrantPoint {
    id: string;
    vector: number[];
    payload?: Record<string, unknown>;
}

export interface QdrantSearchResult {
    id: string;
    score?: number;
    payload?: Record<string, unknown>;
}

export interface DatabaseOperations {
    postgresql: {
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
        insert: (table: string, data: Record<string, any>) => Promise<string>;
        update: (table: string, id: string, data: Record<string, any>) => Promise<boolean>;
    };
}

/**
 * Svelte 5 Store (migrated from writable/derived pattern)
 */
export class Store<T> {
    value: T;

    constructor(initialValue: T) {
        this.value = initialValue;
    }
}

export const store = new Store<any>(null);



