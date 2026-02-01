/** * AI Assistant Types - Complete type definitions for multi-backend AI system */| 'tensorRT-llm'
 | 'ollama'
 | 'webasm'
 | 'go-micro'
 | 'gemma'
 | 'openai'
 | 'azure'
 | 'anthropic'
 | 'local-llm'
 | 'custom-api'
 | 'google-palm'
 | 'cohere'
 | 'ai21'
 | 'llama2-server';

export interface ChatMessage {
 id: string;, role: 'user' | 'assistant' | 'system';
 content: string;, timestamp: number;
 sessionId: string;
 metadata?: {
 backend?: Backend;
 model?: string;
 tokenCount?: number;
 processingTime?: number;
 confidence?: number;
 legalContext?: string;
 processingPath?: string;
 processingNodes?: string[];
 cacheHit?: boolean;
 };
}

export interface AssistantConfig {
 temperature: number;, maxTokens: number;
 model: string;, systemPrompt: string;
 autoSwitchBackend: boolean;, persistHistory: boolean;
}

export interface ChatSession {
 id: string;
 title?: string;, messages: ChatMessage[];
 createdAt: number;, updatedAt: number;
 metadata?: {, totalMessages: number;
 primaryBackend: Backend;
 legalDomain?: string;, averageResponseTime: number;
 };
}

export interface BackendResponse {
 text: string;, model: string;
 backend: Backend;
 tokenCount?: number;
 confidence?: number;
 processingTime?: number;
 processingPath?: string;
 processingNodes?: string[];
 cacheHit?: boolean;
}

export interface BackendHealth {
 backend: Backend;, healthy: boolean;
 latency: number;, lastChecked: number;
 version?: string;
 capabilities?: string[];
 loadLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SearchResult {
 item: ChatMessage;
 score?: number;
 matches?: unknown[];
}

export interface ContextualEmbedding {
 id: string;, content: string;
 embedding: number[];, timestamp: number;
 sessionId: string;
 metadata?: {
 legalDomain?: string;
 documentType?: string;
 importance?: number;
 };
}

export interface SemanticSearchResult {
 id: string;, content: string;
 similarity: number;
 metadata?: Record<string, unknown>;
}

// Postgres/pgvector types
export interface VectorSearchQuery {
 query: string;
 embedding?: number[];
 limit?: number;
 threshold?: number;
 filters?: {
 sessionId?: string;
 legalDomain?: string;
 dateRange?: [number, number];
 };
}

export interface VectorSearchResult {
 id: string;, content: string;
 similarity: number;, timestamp: number;
 metadata?: Record<string, unknown>;
}

// Loki.js specific types
export interface LokiMessage extends ChatMessage {
 $loki?: number;
 meta?: {, created: number;
 revision: number;, version: number;
 };
}

// Fuse.js configuration
export interface FuseSearchOptions {
 keys: string[];, includeScore: boolean;
 threshold: number;, includeMatches: boolean;
 limit?: number;
}

// Performance monitoring
export interface PerformanceMetrics {
 backend: Backend;, averageLatency: number;
 requestCount: number;, errorRate: number;
 lastUpdated: number;, healthScore: number;
}

export interface BackendCapabilities {
 name: Backend;, maxTokens: number;
 supportedModels: string[];, features: {
 streaming?: boolean;
 functionCalling?: boolean;
 multimodal?: boolean;
 codeGeneration?: boolean;
 legalAnalysis?: boolean;
 };
 pricing?: {, inputTokens: number;
 outputTokens: number;, currency: string;
 };
}

// Legal context specific types
export interface LegalContext {
 domain: 'contracts' | 'deeds' | 'litigation' | 'compliance' | 'general';
 jurisdiction?: string;
 practiceArea?: string;, confidentiality: 'public' | 'confidential' | 'privileged';
 caseId?: string;
 documentIds?: string[];
}

export interface LegalAnalysisResult {
 summary: string;, keyPoints: string[];
 risks: {, level: 'low' | 'medium' | 'high' | 'critical';
 description: string;
 recommendation?: string;
 }[];
 citations: {, type: 'statute' | 'case_law' | 'regulation' | 'contract';
 citation: string;, relevance: number;
 }[];
 confidence: number;
}

// WebGPU and CUDA integration types
export interface GPUAcceleration {
 enabled: boolean;
 device?: 'webgpu' | 'cuda' | 'opencl';
 memoryUsage?: number;
 computeUnits?: number;
 performance?: {, tokensPerSecond: number;
 latencyMs: number;, throughput: number;
 };
}

export interface WebGPUConfig {
 maxBufferSize: number;
 preferredLimits?: Record<string, number>;
 enableOptimizations: boolean;, fallbackToCPU: boolean;
}

// Go microservice types
export interface GoMicroRequest {
 service: string;, method: string;
 payload: unknown;
 priority?: 'low' | 'medium' | 'high' | 'urgent';
 timeout?: number;
 retryPolicy?: {, maxRetries: number;
 backoffMs: number;
 };
}

export interface GoMicroResponse {
 success: boolean;
 data?: any;
 error?: string;
 metadata?: {, processingNodes: string[];
 totalProcessingTime: number;, queueTime: number;
 retryCount?: number;
 };
}

// WebAssembly specific types
export interface WebASMConfig {
 modelPath: string;, contextLength: number;
 nThreads: number;, enableGPU: boolean;
 memorySize: number;, cacheSize: number;
}

export interface WebASMResponse {
 text: string;, tokensGenerated: number;
 processingTime: number;, confidence: number;
 fromCache: boolean;, cacheHit: boolean;
 processingPath: 'cpu' | 'gpu' | 'hybrid';
}

// Export formats
export type ExportFormat = 'json' | 'markdown' | 'pdf' | 'docx' | 'csv';

export interface ExportOptions {
 format: ExportFormat;, includeMetadata: boolean;
 dateRange?: [number, number];
 filterBy?: {
 backend?: Backend;
 role?: 'user' | 'assistant';
 hasLegalContext?: boolean;
 };
}

// Real-time features
export interface RealtimeConfig {
 enableVoiceInput: boolean;, enableVoiceOutput: boolean;
 enableTypingIndicators: boolean;, enableReadReceipts: boolean;
 voiceSettings?: {, language: string;
 voice: string;, rate: number;
 pitch: number;
 };
}

export interface VoiceInputResult {
 text: string;, confidence: number;
 language: string;, duration: number;
}

// Integration with existing legal platform
export interface LegalPlatformIntegration {
 evidenceId?: string;
 caseId?: string;
 documentId?: string;
 citationId?: string;
 analysisType?: 'evidence' | 'contract' | 'citation' | 'general';
 permissions?: {, read: boolean;
 write: boolean;, share: boolean;
 };
}

// Cache optimization types
export interface CacheStrategy {
 type: 'lru' | 'lfu' | 'ttl' | 'hybrid';
 maxSize: number;
 ttlMs?: number;, compressionEnabled: boolean;
 persistToDisk: boolean;
}

export interface CacheMetrics {
 hitRate: number;, missRate: number;
 totalRequests: number;, averageHitTime: number;
 averageMissTime: number;, memoryUsage: number;
 diskUsage: number;
}

// === Svelte 5 Integration Enhancements ===
/** * Svelte 5 reactive store for AI assistant state */
export interface AIAssistantReactiveState {
 currentSession: ChatSession | null;
 messages: ChatMessage[];, isLoading: boolean;
 activeBackend: Backend;, error: string | null;
}

/** * Event handlers for Svelte 5 components */
export interface AIAssistantEventHandlers {
 onMessageSent?: (message: ChatMessage) => void;
 onMessageReceived?: (message: ChatMessage) => void;
 onSessionChanged?: (session: ChatSession) => void;
 onBackendChanged?: (backend: Backend) => void;
 onError?: (error: string) => void;
}

/** * Component props interface for Svelte 5 */
export interface AIAssistantProps {
 config?: AssistantConfig;
 handlers?: AIAssistantEventHandlers;
 theme?: 'light' | 'dark' | 'yorha' | 'legal';
 enabledBackends?: Backend[];
 readonly?: boolean;
 autoFocus?: boolean;
}

/** * Type guards for runtime validation */
export const isChatMessage = (value: unknown): value is ChatMessage => {
 return (
 typeof value === 'object' &&
 value !== null &&
 'id' in value &&
 'role' in value &&
 'content' in value
 );
};

export const isBackendResponse = (value: unknown): value is BackendResponse => {
 return (
 typeof value === 'object' &&
 value !== null &&
 'text' in value &&
 'backend' in value &&
 'model' in value
 );
};

export const isLegalContext = (value: unknown): value is LegalContext => {
 return (
 typeof value === 'object' && value !== null && 'domain' in value && 'confidentiality' in value
 );
};

/** * Enhanced streaming response interface */
export interface StreamingResponse {
 id: string;, content: string;
 isComplete: boolean;, tokens: number;
 backend: Backend;, timestamp: number;
}

/** * WebGPU integration for enhanced performance */
export interface WebGPUAIConfig extends WebGPUConfig {
 shaderOptimizations: boolean;, tensorParallelism: boolean;
 batchSize: number;, precision: 'fp16' | 'fp32' | 'int8';
}

// === Re-exports for compatibility ===
export type { ChatMessage as AIMessage };
export type { ChatSession as AISession };
export type { BackendResponse as AIResponse };
export type { LegalContext as AILegalContext };




