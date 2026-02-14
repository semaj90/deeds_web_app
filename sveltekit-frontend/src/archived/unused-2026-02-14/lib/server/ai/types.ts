/**
 * Type definitions for the AI Assistant system with intelligent fallback support
 */

export interface OllamaConfig {
    baseUrl: string;
    endpoints?: Record<string, string>;
    defaultModel: string;
	embeddingModel: string;
    fallbackModel?: string;
    fallbackModels?: {
	legal: string;
        general: string;
    };
    timeout: number;
	maxRetries: number;
    streamEnabled: boolean;
	gpu: GpuConfig;
    performance: PerformanceConfig;
	features: FeaturesConfig;
}

export interface GpuConfig {
    enabled: boolean;
	layers: number;
    mainGpu: number;
	tensorSplit: number[] | null;
}

export interface PerformanceConfig {
    batchSize: number;
	parallelRequests: number;
    cacheEnabled: boolean;
	cacheTTL: number;
}

export interface FeaturesConfig {
    som: boolean;
	proactiveCaching: boolean;
    multiModalIndexing: boolean;
	reinforcementLearning: boolean;
    webGpuAcceleration: boolean;
    intelligentFallback?: boolean;
}

export interface ModelConfig {
    name: string;
	type: 'local' | 'legal-fallback' | 'general-fallback' | 'embedding' | 'embedding-fallback' | 'fallback';
    capabilities: string[];
	contextWindow: number;
    embeddingDimension?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    systemPrompt?: string;
    options?: { [key: string]: any };
}

export interface OllamaGenerateRequest {
    model: string;
	prompt: string;
    system?: string;
    template?: string;
    context?: number[];
    stream?: boolean;
    raw?: boolean;
    format?: 'json';
    options?: {
        temperature?: number;
        top_k?: number;
        top_p?: number;
        num_predict?: number;
        stop?: string[];
        seed?: number;
        num_gpu?: number;
        num_thread?: number;
        repeat_penalty?: number;
    };
}

export interface OllamaEmbeddingRequest {
    model: string;
	prompt: string;
}

export interface OllamaResponse {
    model: string;
	created_at: string;
    response?: string;
	done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_duration?: number;
    eval_duration?: number;
    eval_count?: number;
    fallback_used?: boolean;
    models_tried?: string[];
}

export interface OllamaEmbeddingResponse {
    embedding: number[];
    model?: string;
}

export interface DocumentChunk {
    id: string;
	content: string;
    metadata: {
	source: string;
        page?: number;
        section?: string;
	timestamp: Date;
        documentType?: string;
    };
    embedding?: number[];
    relevanceScore?: number;
}

export interface SOMNode {
    x: number;
	y: number;
    weight: number[];
	documents: string[];
    topic?: string;
}

export interface ProcessingPipeline {
    id: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
    stages: {
	ingestion: boolean;
        preprocessing: boolean;
	embedding: boolean;
        indexing: boolean;
	somTraining: boolean;
        caching: boolean;
    };
    error?: string;
	startTime: Date;
    endTime?: Date;
    metrics?: {
	documentsProcessed: number;
        chunksGenerated: number;
	embeddingsCreated: number;
        processingTimeMs: number;
    };
}

export interface LegalDocument {
    id: string;
	title: string;
    type: 'contract' | 'case' | 'statute' | 'brief' | 'memo' | 'other';
    content: string;
	metadata: {
        dateCreated: Date;
	dateModified: Date;
        author?: string;
        jurisdiction?: string;
        court?: string;
        caseNumber?: string;
        parties?: string[];
        tags?: string[];
    };
    chunks: DocumentChunk[];
    embedding?: number[];
    somCoordinates?: {
	x: number; y: number };
    relevanceScore?: number;
}

export interface AnalysisResult {
    documentId: string;
	summary: string;
    keyPoints: string[];
	entities: {
        people: string[];
	organizations: string[];
        dates: string[];
	locations: string[];
        legalConcepts: string[];
    };
    sentiment: 'positive' | 'negative' | 'neutral';
    riskFactors?: string[];
    recommendations?: string[];
    citations?: Array<{
	text: string, source: string;
	confidence: number }>;
    metadata?: {
        modelUsed?: string;
        timestamp?: string;
        [key: string]: any;
    };
}

export interface UserQuery {
    id: string;
	userId: string;
    query: string;
	timestamp: Date;
    context?: {
        previousQueries?: string[];
        activeDocument?: string;
	sessionId: string;
    };
    response?: {
	text: string;
        sources: string[];
	confidence: number;
        processingTimeMs: number;
    };
}

export interface CacheEntry {
    key: string;
	value: unknown;
    ttl: number;
	created: Date;
    lastAccessed: Date;
	accessCount: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
}

// RAG Configuration
export interface SimpleRAGConfiguration {
    embeddingModel: string;
	embeddingDimensions: number;
    llmModel: string;
	ollamaBaseUrl: string;
    chunkSize: number;
	chunkOverlap: number;
    maxRetries: number;
	timeoutMs: number;
    cacheEnabled: boolean;
	cacheTtl: number;
}

export type RAGConfiguration = SimpleRAGConfiguration; // compatibility alias for config.ts

