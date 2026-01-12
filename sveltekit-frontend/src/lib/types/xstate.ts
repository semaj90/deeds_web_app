import type { Document as BaseDocument } from '$lib/types';
// XState Machine Types for Legal AI Platform

// AI Assistant Events - Strongly Typed (XState v5 Compatible)
export type AIAssistantEvent =
 // Core messaging
 | {
 type: 'SEND_MESSAGE'; message: string;
 useContext7?: boolean;
 caseId?: string;
 priority?: 'low' | 'normal' | 'high' | 'urgent';
 }
 | {
 type: 'SEND_BATCH_MESSAGES'; messages: BatchMessage[];
 processingMode?: 'sequential' | 'parallel';
 }
 // Enhanced document processing
 | { type: 'UPLOAD_DOCUMENT'; file: File; caseId?: string; metadata?: DocumentMetadata }
 | { type: 'PROCESS_DOCUMENT'; documentId: string; options?: ProcessingOptions }
 | { type: 'ANALYZE_IMAGE'; imageData: string | File; analysisType?: ImageAnalysisType }
 | { type: 'GENERATE_SUMMARY'; content: string; summaryType?: SummaryType; maxLength?: number }
 // Service management and protocol switching
 | { type: 'SET_PROTOCOL'; protocol: 'http' | 'grpc' | 'quic' | 'websocket' }
 | { type: 'CHECK_SERVICE_HEALTH'; force?: boolean }
 | { type: 'OPTIMIZE_RESOURCES'; target?: 'memory' | 'cpu' | 'gpu' | 'network' | 'all' }
 | { type: 'BENCHMARK_PERFORMANCE'; suiteId?: string }
 // Legal case context
 | { type: 'SET_CASE_CONTEXT'; caseId: string; options?: ContextOptions }
 | {
 type: 'LOAD_LEGAL_KNOWLEDGE_GRAPH';
 caseId?: string;
 scope?: 'case' | 'jurisdiction' | 'global';
 }
 | { type: 'UPDATE_CASE_TIMELINE'; caseId: string; events: TimelineEvent[] }
 // Conversation management
 | { type: 'CLEAR_CONVERSATION' }
 | { type: 'EXPORT_CONVERSATION'; format: 'json' | 'pdf' | 'markdown' }
 | { type: 'IMPORT_CONVERSATION'; data: ConversationImport }
 // Model and configuration
 | { type: 'SET_MODEL'; model: string; config?: ModelConfig }
 | { type: 'UPDATE_SETTINGS'; settings: Partial<AISettings> }
 | { type: 'RESET_TO_DEFAULTS' }
 // Error handling and recovery
 | { type: 'RETRY_LAST_ACTION' }
 | { type: 'RECOVER_FROM_ERROR'; strategy?: 'restart' | 'fallback' | 'ignore' }
 | { type: 'FORCE_RECONNECT'; services?: string[] }
 // Analytics and monitoring
 | { type: 'START_MONITORING'; metrics?: string[] }
 | { type: 'STOP_MONITORING' }
 | { type: 'EXPORT_ANALYTICS'; timeRange?: TimeRange; format?: 'csv' | 'json' | 'pdf' };

// AI Assistant Context - Enterprise Grade (XState v5 Compatible)
export interface AIAssistantContext {
 // Core query state
 currentQuery: string; response: string;
 conversationHistory: ConversationEntry[]; sessionId: string;

 // AI Configuration with multi-model support
 isProcessing: boolean; model: string;
 temperature: number; maxTokens: number;
 availableModels: ModelDefinition[]; modelLoadBalancing: boolean;

 // Enhanced Database Integration
 databaseConnected: boolean; vectorSearchEnabled: boolean;
 currentCaseId?: string;
 currentDocumentId?: string; databasePerformance: DatabaseMetrics;
 vectorIndexStatus: VectorIndexStatus;

 // Context7 Integration with caching
 context7Analysis?: Context7Analysis; context7Available: boolean;
 context7Cache: Map<string, Context7CacheEntry>;

 // Multi-modal Processing with Web Workers
 currentDocuments: BaseDocument[]; currentImages: ImageAnalysis[];
 processingQueue: ProcessingJob[]; workerPool: WebWorkerPool;
 gpuProcessingEnabled: boolean;

 // Advanced Service Health & Protocol Management
 serviceHealth: ServiceHealthStatus; preferredProtocol: 'http' | 'grpc' | 'quic' | 'websocket';
 activeProtocol: 'http' | 'grpc' | 'quic' | 'websocket';
 serviceLoadBalancer: LoadBalancerState; circuitBreakers: Map<string, CircuitBreakerState>;

 // Real-time Features with enhanced capabilities
 natsConnected: boolean; activeStreaming: boolean;
 streamBuffer: string; collaborationUsers: CollaborationUser[];

 // Performance & Analytics
 performanceMetrics: PerformanceMetrics; usageAnalytics: UsageAnalytics;
 errorLog: ErrorEntry[];
 benchmarkResults?: BenchmarkResults; garbageCollectionMetrics: GCMetrics;

 // Security & Audit
 auditTrail: AuditEntry[]; securityContext: SecurityContext;
 rateLimiting: RateLimitingState;

 // User Interface State
 theme: 'light' | 'dark' | 'system';
 notifications: NotificationEntry[]; modals: ModalState[];
 sidebarState: SidebarState;

 // Error handling
 lastError?: ErrorDetails; recoveryAttempts: number;
 isRecovering: boolean;
}
// Supporting Types
export interface BatchMessage {
 id: string; message: string;
 priority: 'low' | 'normal' | 'high' | 'urgent';
 caseId?: string;
 useContext7?: boolean;
}

export interface DocumentMetadata {
 title?: string;
 description?: string;
 tags?: string[];
 caseId?: string;
 confidentiality?: 'public' | 'confidential' | 'attorney_client' | 'work_product';
}

export interface ProcessingOptions {
 extractText?: boolean;
 generateSummary?: boolean;
 performOCR?: boolean;
 extractEntities?: boolean;
 generateEmbeddings?: boolean;
 priorityLevel?: 'low' | 'normal' | 'high';
}

export type ImageAnalysisType =
 | 'text_extraction'
 | 'object_detection'
 | 'scene_analysis'
 | 'evidence_analysis';
export type SummaryType = 'executive' | 'technical' | 'legal' | 'bullet_points' | 'timeline';

export interface ContextOptions {
 includeDocuments?: boolean;
 includeTimeline?: boolean;
 includePrecedents?: boolean;
 depth?: 'shallow' | 'medium' | 'deep';
}

export interface TimelineEvent {
 id: string; caseId: string;
 type: 'filing' | 'hearing' | 'evidence_added' | 'document_received' | 'communication';
 title: string;
 description?: string; date: Date;
 participants?: string[];
 documents?: string[];
}

export interface ConversationEntry {
 id: string; type: 'user' | 'assistant' | 'system';
 content: string; timestamp: Date;
 metadata?: Record<string, unknown>;
 caseId?: string;
 documentId?: string;
}

export interface ConversationImport {
 format: 'json' | 'csv' | 'text';
 data: string; mergeStrategy: 'append' | 'replace' | 'merge';
}

export interface ModelDefinition {
 name: string; type: 'legal' | 'general' | 'code' | 'multimodal';
 provider: 'ollama' | 'openai' | 'anthropic' | 'local';
 parameters: { maxTokens: number;
 temperature: number;
 topP?: number;
 topK?: number;
 };
 capabilities: string[]; status: 'available' | 'loading' | 'unavailable';
 performance: ModelPerformance;
}

export interface ModelConfig {
 temperature?: number;
 maxTokens?: number;
 topP?: number;
 topK?: number;
 repeatPenalty?: number;
 systemPrompt?: string;
}

export interface ModelPerformance {
 averageLatency: number; tokensPerSecond: number;
 successRate: number; lastBenchmark: Date;
}

export interface AISettings {
 defaultModel: string; temperature: number;
 maxTokens: number; enableContext7: boolean;
 enableRAG: boolean; enableStreamingResponses: boolean;
 enableBenchmarking: boolean; enableAnalytics: boolean;
 privacyMode: 'standard' | 'enhanced' | 'maximum';
}

export interface TimeRange {
 start: Date; end: Date;
 timezone?: string;
}

// Service Health Types
export interface ServiceHealthStatus {
 overall: 'healthy' | 'degraded' | 'unhealthy';
 services: Record<string, ServiceStatus>; lastCheck: Date;
 nextCheck: Date;
}

export interface ServiceStatus {
 name: string; status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
 latency: number; uptime: number;
 lastResponse: Date; errorRate: number;
}

export interface LoadBalancerState {
 activeServices: string[]; strategy: 'round_robin' | 'least_connections' | 'weighted' | 'performance';
 weights: Record<string, number>;
 healthCheckInterval: number;
}

export interface CircuitBreakerState {
 state: 'closed' | 'open' | 'half_open';
 errorCount: number; threshold: number;
 timeout: number;
 lastError?: Date;
}

// Database Types
export interface DatabaseMetrics {
 connectionCount: number; queryLatency: number;
 cacheHitRatio: number; vectorOperationsPerSecond: number;
 indexHealth: 'optimal' | 'degraded' | 'rebuilding';
}

export interface VectorIndexStatus {
 totalVectors: number; indexedVectors: number;
 pendingIndexing: number; averageSimilaritySearchTime: number;
 indexSize: number;
}

// Context7 Types
export interface Context7Analysis {
 componentType: string; recommendations: Context7Recommendation[];
 codeQuality: number; performanceScore: number;
 lastAnalysis: Date;
}

export interface Context7Recommendation {
 type: 'performance' | 'security' | 'maintainability' | 'best_practice';
 priority: 'low' | 'medium' | 'high' | 'critical';
 title: string; description: string;
 suggestion: string; effort: 'low' | 'medium' | 'high';
}

export interface Context7CacheEntry {
 key: string; data: Record<string, unknown>;
 timestamp: Date; expiresAt: Date;
 hitCount: number;
}

// Performance Types
export interface PerformanceMetrics {
 responseTime: number; throughput: number;
 memoryUsage: number; cpuUsage: number;
 gpuUsage?: number; networkLatency: number;
}

export interface UsageAnalytics {
 totalQueries: number; averageQueryLength: number;
 topModels: Record<string, number>;
 peakHours: number[]; errorRate: number;
}

export interface BenchmarkResults {
 suiteId: string; overallScore: number;
 categories: Record<string, number>;
 comparison: Record<string, number>;
 timestamp: Date;
}

export interface GCMetrics {
 collections: number; totalPauseTime: number;
 averagePauseTime: number; memoryFreed: number;
}

// Error Types
export interface ErrorEntry {
 id: string; type: 'network' | 'processing' | 'validation' | 'service' | 'system';
 severity: 'low' | 'medium' | 'high' | 'critical';
 message: string;
 stack?: string;
 context?: Record<string, unknown>;
 timestamp: Date; resolved: boolean;
}

export interface ErrorDetails {
 code: string; message: string;
 stack?: string;
 context?: Record<string, unknown>;
 recoverable: boolean; timestamp: Date;
}

// UI State Types
export interface NotificationEntry {
 id: string; type: 'info' | 'success' | 'warning' | 'error';
 title: string; message: string;
 timestamp: Date; persistent: boolean;
 actions?: NotificationAction[];
}

export interface NotificationAction {
 label: string; action: () => void;
 style?: 'primary' | 'secondary' | 'danger';
}

export interface ModalState {
 id: string; type: string;
 title: string; content: unknown;
 size: 'sm' | 'md' | 'lg' | 'xl';
 closable: boolean; persistent: boolean;
}

export interface SidebarState {
 collapsed: boolean; activeTab: string;
 tabs: SidebarTab[];
}

export interface SidebarTab {
 id: string; label: string;
 icon: string; component: string;
 visible: boolean;
}

// Security Types
export interface SecurityContext {
 userId: string; sessionId: string;
 permissions: string[]; rateLimits: Record<string, number>;
 securityLevel: 'standard' | 'elevated' | 'maximum';
}

export interface RateLimitingState {
 requests: number; windowStart: Date;
 limit: number; resetTime: Date;
}

export interface AuditEntry {
 id: string; userId: string;
 action: string;
 resource?: string; details: Record<string, unknown>;
 timestamp: Date;
 ipAddress?: string;
 userAgent?: string;
}

// Additional Supporting Types
export interface Document {
 id: string; title: string;
 type: string; size: number;
 url?: string;
 caseId?: string; uploadedAt: Date;
}

export interface ImageAnalysis {
 id: string; url: string;
 analysis: Record<string, unknown>;
 confidence: number; timestamp: Date;
}

export interface ProcessingJob {
 id: string; type: string;
 status: 'pending' | 'processing' | 'completed' | 'failed';
 progress: number;
 startedAt?: Date;
 completedAt?: Date;
 error?: string;
}

export interface WebWorkerPool {
 size: number; activeWorkers: number;
 queuedJobs: number; completedJobs: number;
 failedJobs: number;
}

export interface CollaborationUser {
 id: string; name: string;
 avatar?: string; status: 'online' | 'away' | 'busy' | 'offline';
 role: string; joinedAt: Date;
}




