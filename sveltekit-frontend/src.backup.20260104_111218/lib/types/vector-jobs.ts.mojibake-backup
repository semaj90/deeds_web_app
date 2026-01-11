// TypeScript types for Vector Job Processing System // Redis Streams + CUDA Worker + XState integration types
export interface VectorJob {
  id: string;
  ownerType: 'evidence' | 'report' | 'case' | 'document';
  ownerId: string;
  event: 'upsert' | 'delete' | 'reembed' | 'cluster';
  vector?: number[];
  payload?: Record<string, unknown>;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt?: Date;
  attempts: number;
  maxAttempts: number;
  error?: string;
}
export interface VectorJobResult {
  jobId: string;
  status: 'pending' | 'success' | 'failed';
  result?: unknown;
  error?: string;
  progress?: number;
  metadata: {
    processingTimeMs: number;
    cudaUsed: boolean;
    webgpuUsed: boolean;
    vectorDimension: number;
    operationType: string;
    timestamp: number;
  };
}
export interface CUDAProcessingStatus {
  jobId: string;
  stage: 'initializing' | 'preprocessing' | 'computing' | 'postprocessing' | 'completed';
  progress: number; // 0-100
  currentOperation: string;
  estimatedTimeRemainingMs?: number;
  gpuUtilization?: number;
  memoryUsage?: number;
}
export interface WebGPUProcessingOptions {
  useFloat16: boolean;
  batchSize: number;
  workgroupSize: number;
  fallbackToWebGL: boolean;
}
export interface VectorOperationRequest {
  ownerType: string;
  ownerId: string;
  operation: string; // e.g., "embedding", "similarity_search", "generate"
  vector?: number[]; // Pre-computed vector for search
  data?: Record<string, unknown>; // Added data property
  options?: { priority?: 'low' | 'medium' | 'high'; useWebGPU?: boolean; [key: string]: unknown };
}
export interface VectorOperationResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queuePosition?: number;
  estimatedWaitTimeMs?: number;
  VectorJobResult?: VectorJobResult;
}
// Redis Streams specific types
export interface RedisStreamMessage {
  id: string | Record<string, string>;
  fields: Record<string, string>;
}
export interface RedisStreamGroup {
  name: string;
  consumers: RedisStreamConsumer[];
  pending: number;
  lastDeliveredId: string;
}
export interface RedisStreamConsumer {
  name: string;
  pending: number;
  idle: number;
}
// Outbox pattern types for reliable messaging
export interface VectorOutboxEntry {
  id: string;
  ownerType: string;
  ownerId: string;
  event: string;
  vector?: number[];
  payload?: Record<string, unknown>;
  attempts: number;
  processedAt?: Date;
  createdAt: Date;
}
// WebGPU types
export interface WebGPUDevice {
  device: GPUDevice;
  queue: GPUQueue;
  adapter: GPUAdapter;
  features: string[];
  limits: Record<string, number>;
  isAvailable: boolean;
}
export interface WebGPUComputeShader {
  module: GPUShaderModule;
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}
export interface WebGPUVectorOperation {
  inputBuffer: GPUBuffer;
  outputBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  workgroupCount: [number, number, number]; // Assuming 3D workgroup count
}
// WASM LLM types
export interface WASMLLMConfig {
  modelPath: string;
  tokenizer: string;
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  useGPU: boolean;
  memoryLimit: number;
}
export interface WASMLLMResponse {
  text: string;
  tokens: number;
  processingTimeMs: number;
  confidence: number;
  metadata: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
// Legal AI specific vector types
export interface LegalVectorEmbedding {
  id: string;
  documentId: string;
  caseId?: string;
  evidenceId?: string;
  text: string;
  embedding: number[];
  metadata: {
    documentType: 'contract' | 'case_law' | 'statute' | 'evidence' | 'brief';
    jurisdiction: string;
    practiceArea: string[];
    confidence: number;
    extractedAt: Date;
    modelVersion: string;
  };
}
export interface LegalSimilarityResult {
  sourceId: string;
  targetId: string;
  similarity: number;
  commonConcepts: string[];
  legalCitations: string[];
  relevantStatutes: string[];
  precedentStrength: 'strong' | 'moderate' | 'weak';
}
// Monitoring and metrics types
export interface VectorServiceMetrics {
  queueDepth: { embeddings: number; similarities: number; indexing: number; clustering: number };
  processingStats: {
    totalProcessed: number;
    averageProcessingTimeMs: number;
    successRate: number;
    errorRate: number;
  };
  resourceUsage: {
    cudaUtilization: number;
    webgpuUtilization: number;
    memoryUsage: number;
    redisConnections: number;
  };
  performance: {
    cudaOpsPerSecond: number;
    webgpuOpsPerSecond: number;
    vectorsPerSecond: number;
    throughputMBps: number;
  };
}
export interface VectorHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    redis: 'connected' | 'disconnected' | 'error';
    postgres: 'connected' | 'disconnected' | 'error';
    rabbitmq: 'connected' | 'disconnected' | 'error';
    cuda: 'available' | 'unavailable' | 'error';
    webgpu: 'available' | 'unavailable' | 'not_supported';
  };
  queues: { [queueName: string]: { depth: number; consumers: number; processingRate: number } };
  lastHealthCheck: Date;
}
// Error types for vector processing
export class VectorProcessingError extends Error {
  constructor(
    message: string,
    public jobId: string,
    public operation: string,
    public stage: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'VectorProcessingError';
  }
}
export class CUDAError extends VectorProcessingError {
  constructor(message: string, jobId: string, operation: string) {
    super(message, jobId, operation, 'cuda_processing', false);
    this.name = 'CUDAError';
  }
}
export class WebGPUError extends VectorProcessingError {
  constructor(message: string, jobId: string, operation: string) {
    super(message, jobId, operation, 'webgpu_processing', true);
    this.name = 'WebGPUError';
  }
}
export class RedisStreamError extends VectorProcessingError {
  constructor(message: string, jobId: string, operation: string) {
    super(message, jobId, operation, 'redis_streaming', true);
    this.name = 'RedisStreamError';
  }
}
