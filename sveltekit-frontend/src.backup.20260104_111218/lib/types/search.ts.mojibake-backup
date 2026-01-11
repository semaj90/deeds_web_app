/**
 * Search and Vector Types
 * Core types for pgvector search, embeddings, and retrieval
 */

/**
 * Search result from pgvector semantic search
 */
export interface SearchResult {
  id: string;
  title: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

/**
 * Summary response from RAG system
 */
export interface SummaryResponse {
  summary: string;
  keyPoints: string[];
  metadata: {
    documentsProcessed: number;
    processingTime: number;
    lambda: number;
    sentenceCount?: number; // Added for MMR compatibility
  };
  sources?: string[]; // Added for enhanced functionality
}

export interface SummaryRequest {
  documents: LegalDocument[];
  maxSentences?: number;
  lambda?: number;
  type?: string;
}

export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemStatus {
  database: boolean;
  qdrant: boolean;
  embeddings: boolean;
  vectorSearch: boolean;
  redis?: boolean;
  ollama?: boolean;
  gpu?: boolean;
  cuda?: boolean;
  minio?: boolean;
  neo4j?: boolean;
  rabbitmq?: boolean;
  elasticsearch?: boolean;
  langchain?: boolean;
}

export interface TestResults {
  query: string;
  results: SearchResult[];
  timestamp: Date;
  performance: {
    duration: number;
    documentsSearched: number;
  };
  error?: unknown;
}

export interface TensorOperation {
  type: string;
  data: unknown;
  shape?: number[];
}

export interface MetricData {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

// GPU-specific types
export interface GPUChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  embedding?: number[];
  metadata?: {
    model?: string;
    processingTime?: number;
    gpuUsed?: boolean;
    tokenCount?: number;
  };
}

export interface GPUProcessingStatus {
  gpuAvailable: boolean;
  cudaVersion?: string;
  gpuMemory?: {
    total: number;
    used: number;
    free: number;
  };
  activeJobs: number;
  queueLength: number;
}

export interface StreamingResponse {
  type: 'chunk' | 'complete' | 'error';
  content?: string;
  error?: string;
  metadata?: {
    tokensGenerated?: number;
    processingTimeMs?: number;
  };
}
export interface VectorSearchQueryResult {
  success: true;
  results: SearchResult[];
  query: string;
  topK: number;
  responseTime: number;
  timestamp: string;
  metadata?: {
    modelUsed?: string;
    indexType?: string;
  };
}
