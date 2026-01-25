// src/lib/types/index.ts
export interface CanvasState {
  id: string;
  fabricJSON?: any;
  metadata?: Record<string, unknown>;
}

export type MultiDimArray = {
  shape: number[]; data: Float32Array | number[];
  layout?: string;
  cacheKey?: string;
  timestamp?: number;
};

export interface Report {
  id: string; title: string;
  summary?: string;
  reportType?: string; createdAt: string | Date;
  wordCount?: number;
  estimatedReadTime?: number;
  status?: 'draft' | 'published' | 'archived' | string;
  tags?: string[];
  content?: string;
  userId?: string;
  isFavorite?: boolean;
  sourceUri?: string;
  updatedAt?: string;
}

export interface Message {
  id: string; content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date | string;
  metadata?: Record<string, unknown>;
}

/**
 * Central type export hub for all API response types
 *
 * Three Comprehensive Type Definitions:
 * 1. DATABASE RESPONSE TYPES - All db.query() operations
 * 2. ADMIN API TYPES - Health checks, cluster status, metrics
 * 3. WORKER/CLUSTER TYPES - Background workers and file uploads
 */

// ============================================================================
// ENDPOINT 1: DATABASE RESPONSE TYPES
// ============================================================================
export type {
    AnalysisResult, AnalysisResultListResult, AnalysisResultQueryResult,
    // Batch operations
    BatchQueryResult, Case, CaseListResult, CaseMetadata,
    // Domain-specific query results
    CaseQueryResult, ChainOfCustodyRecord, ChatMessage, ChatMessageListResult, ChatMessageMetadata, ChatMessageQueryResult, CreateQueryResult, DBCase, DBEvidence,
    // Health checks
    DatabaseHealthResponse, DeleteQueryResult, Document, DocumentListResult, DocumentQueryResult, Evidence, EvidenceAnalysis, EvidenceListResult, EvidenceMetadata, EvidenceQueryResult, HealthCheck, ListQueryResult, PaginationInfo,
    // Query response types
    QueryResult, Transaction, UpdateQueryResult,
    // Core entity types
    User, UserListResult, UserQueryResult, VectorSearchQueryResult,
    // Vector search types
    VectorSearchResult
} from './database.js';

// ============================================================================
// ENDPOINT 2: ADMIN API RESPONSE TYPES
// ============================================================================
export type {
    // Admin actions
    AdminActionResponse,
    // Configuration
    AdminConfigResponse, AdminConfiguration, AdminHealth, AdminHealthData,
    // Health checks
    AdminHealthResponse, AdminStatus,
    // Admin status
    AdminStatusResponse, AuditLog, AuditLogPagination,
    // Audit logs
    AuditLogResponse, CPUMetrics, CacheClearResponse, CacheConfig,
    // Cache status
    CacheStatus, DatabaseConfig, DatabaseMaintenanceResponse, DatabaseQueryStats,
    // Database status
    DatabaseStatus, DiskMetrics, GPUConfig, IndexInfo, MemoryMetrics, MessageQueueConfig,
    // Message queue status
    MessageQueueStatus, NetworkMetrics, QueueInfo, SecurityConfig, ServiceHealth, ServiceHealthStatus, ServiceRestartResponse, ServiceStatus, StorageConfig,
    // System metrics
    SystemMetrics, VectorStoreConfig,
    // Vector store status
    VectorStoreStatus
} from './admin.js';

// ============================================================================
// ENDPOINT 3: WORKER/CLUSTER STATE TYPES
// ============================================================================
export type {
    AutotagJob,
    // Autotag worker
    AutotagWorkerStatus,
    // Job queues
    BackgroundJob,
    // Background workers
    BackgroundWorkerStatus, CPUUsage,
    // Cluster commands
    ClusterCommandResponse,
    // Cluster events
    ClusterEvent, ClusterEventStreamResponse, ClusterMetadata, ClusterRestartResponse, ClusterStatus, ClusterStatusResponse, EmbeddingJob,
    // Embedding worker
    EmbeddingWorkerStatus, FileProcessingProgress, FileProcessingStage, FileUploadBatchResponse, FileUploadInfo,
    // File upload & processing
    FileUploadJob, FileUploadResponse, JobBatchResponse, JobQueueStats, JobStatusResponse, OCRJob,
    // OCR worker
    OCRWorkerStatus, ProcessInfo,
    // Process types
    ProcessMemory,
    // Cluster status
    Worker, WorkerHealthCheckResponse, WorkerMetrics, WorkerPool, WorkerScaleResponse
} from './cluster.js';

// Replace wildcard re-export of: './search' (causes duplicate top-level symbols)
// and keep top-level re-exports from './api.js'.
export * from './api.js';

// Export the search module as a namespaced export to avoid duplicate top-level exports
// Usage elsewhere: import type { search } from '$lib/types'; or `import type { LegalDocument } from '$lib/types/search'`
export * as search from './search.js';

// Generic Utility Types
export * from './generics.js';

// External Services Types
export type {
    MinIOClient, MinIOConfig,
    Neo4jClient, Neo4jConfig,
    OllamaClient, OllamaConfig,
    PgVectorClient, PostgresConfig,
    QdrantClient, QdrantConfig,
    QdrantSearchResult, QdrantVectorPayload,
    RedisCacheService, RedisConfig,
    ServiceEnvironment, ServiceUrls
} from './external-services.js';

export interface Case {
  // core
  id: string;
  title?: string;
  description?: string;
  // form-related fields (added so components can access them safely)
  caseNumber?: string;
  name?: string;
  incidentDate?: string | Date | null;
  location?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'open' | 'active' | 'pending' | 'closed' | 'archived';
  category?: string;
  dangerScore?: number;
  estimatedValue?: number | string | null;
  jurisdiction?: string;
  leadProsecutor?: string;
  // team / tags / metadata
  assignedTeam?: string[];
  assignedTo?: string[]; // legacy alias
  tags?: string[];
  metadata?: Record<string, unknown>;
}



