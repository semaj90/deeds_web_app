/**
 * Unified Knowledge Graph Types (RAG + KAG + DAG)
 * Consolidates types from 20+ scattered files
 * Date: February 7, 2026
 */

// ═══════════════════════════════════════════════════════════
// RAG (Retrieval-Augmented Generation) Types
// ═══════════════════════════════════════════════════════════

export interface RAGConfig {
  endpoint: string;
  grpcPort: number;
  restPort: number;
  useGrpc: boolean;
  timeout: number;
  embeddingModel: 'embeddinggemma:latest' | 'nomic-embed-text';
  cacheStrategy: 'redis' | 'memory' | 'hybrid';
  vectorStore: 'qdrant' | 'pgvector' | 'redis';
}

export interface RAGQuery {
  query: string;
  userId: string;
  contextWindow: number;
  topK: number;
  threshold: number;
  filters?: Record<string, unknown>;
  includeMetadata?: boolean;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  confidence: number;
  processingTime: number;
  model: string;
  metadata?: {
    tokensUsed: number;
    cacheHit: boolean;
    vectorSearchTime: number;
    llmGenerationTime: number;
  };
}

export interface RAGSource {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

export interface RAGChunk {
  id: string;
  documentId: string;
  text: string;
  embedding: number[];
  metadata: {
    chunkIndex: number;
    totalChunks: number;
    startChar: number;
    endChar: number;
    [key: string]: unknown;
  };
}

// ═══════════════════════════════════════════════════════════
// KAG (Knowledge-Augmented Generation) Types
// ═══════════════════════════════════════════════════════════

export interface KAGNode {
  id: string;
  type: 'entity' | 'concept' | 'document' | 'relation' | 'event';
  label: string;
  properties: Record<string, unknown>;
  embeddings?: number[];
  metadata?: {
    created: Date;
    updated: Date;
    source?: string;
    confidence?: number;
  };
}

export interface KAGEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
  bidirectional: boolean;
  metadata?: Record<string, unknown>;
}

export interface KAGGraph {
  id: string;
  name: string;
  nodes: KAGNode[];
  edges: KAGEdge[];
  metadata: {
    version: string;
    created: Date;
    updated: Date;
    nodeCount: number;
    edgeCount: number;
    schema?: string;
  };
}

export interface KAGQuery {
  startNode?: string;
  relation?: string;
  targetType?: string;
  depth: number;
  limit: number;
  filters?: Record<string, unknown>;
}

export interface KAGQueryResult {
  paths: KAGPath[];
  subgraph: KAGGraph;
  processingTime: number;
}

export interface KAGPath {
  nodes: KAGNode[];
  edges: KAGEdge[];
  score: number;
  length: number;
}

// ═══════════════════════════════════════════════════════════
// DAG (Directed Acyclic Graph) Workflow Types
// ═══════════════════════════════════════════════════════════

export interface DAGWorkflow {
  id: string;
  name: string;
  description?: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  metadata: {
    created: Date;
    started?: Date;
    completed?: Date;
    createdBy: string;
  };
}

export interface DAGNode {
  id: string;
  type: 'task' | 'decision' | 'merge' | 'split' | 'transform';
  label: string;
  handler: string; // Function/service to execute
  config: Record<string, unknown>;
  dependencies: string[]; // Node IDs this depends on
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  metadata?: {
    retries?: number;
    maxRetries?: number;
    timeout?: number;
  };
}

export interface DAGEdge {
  id: string;
  from: string;
  to: string;
  condition?: string; // JavaScript expression to evaluate
  metadata?: Record<string, unknown>;
}

export interface DAGExecutionContext {
  workflowId: string;
  variables: Record<string, unknown>;
  results: Map<string, unknown>; // Node ID → Result
  errors: Map<string, string>; // Node ID → Error
}

export interface DAGExecutionResult {
  workflowId: string;
  status: 'completed' | 'failed' | 'partial';
  completedNodes: string[];
  failedNodes: string[];
  results: Record<string, unknown>;
  errors: Record<string, string>;
  processingTime: number;
}

// ═══════════════════════════════════════════════════════════
// Hybrid RAG + KAG Types
// ═══════════════════════════════════════════════════════════

export interface HybridRAGKAGQuery {
  query: string;
  userId: string;
  useRAG: boolean;
  useKAG: boolean;
  ragConfig?: Partial<RAGQuery>;
  kagConfig?: Partial<KAGQuery>;
}

export interface HybridRAGKAGResponse {
  answer: string;
  ragSources?: RAGSource[];
  kagPaths?: KAGPath[];
  confidence: number;
  processingTime: number;
  strategy: 'rag-only' | 'kag-only' | 'rag-then-kag' | 'kag-then-rag' | 'hybrid';
}

// ═══════════════════════════════════════════════════════════
// Pipeline Types (RAG + KAG + DAG Integration)
// ═══════════════════════════════════════════════════════════

export interface KnowledgePipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  config: {
    parallelism: number;
    retryPolicy: RetryPolicy;
    caching: boolean;
  };
}

export interface PipelineStage {
  id: string;
  type: 'embedding' | 'vectorSearch' | 'graphQuery' | 'llmGeneration' | 'postprocess';
  handler: string;
  config: Record<string, unknown>;
  dependencies: string[];
}

export interface RetryPolicy {
  maxRetries: number;
  backoff: 'linear' | 'exponential';
  initialDelay: number;
  maxDelay: number;
}

export interface PipelineExecutionResult {
  pipelineId: string;
  status: 'completed' | 'failed' | 'partial';
  stageResults: Map<string, unknown>;
  errors: Map<string, string>;
  totalTime: number;
}