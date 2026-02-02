/**
 * XState Types for Go Microservice Integration
 */

// Base machine context
export interface BaseMachineContext {
  userId?: string;
  sessionId?: string;
  error?: string;
  retryCount?: number;
}

// AI Processing Context
export interface AIProcessingContext extends BaseMachineContext {
  task?: AITask;
  result?: AITaskResult;
  progress?: number;
  provider?: string;
  confidence?: number;
}

export interface AITask {
  id: string;
  type: 'parse' | 'som-train' | 'cuda-infer' | 'embed' | 'analyze';
  payload: unknown;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration?: number;
}

export interface AITaskResult {
  taskId: string;
  success: boolean;
  result: unknown;
  duration?: number;
  metrics?: {
    processingTime: number;
    memoryUsed: string;
    throughput: number;
  };
}

// Document Processing Context
export interface DocumentContext extends BaseMachineContext {
  document?: DocumentInfo;
  extractedFields?: ExtractedField[];
  ocrResult?: OCRResult;
  processingStage: 'upload' | 'ocr' | 'extraction' | 'validation' | 'complete';
}

export interface DocumentInfo {
  id: string;
  filename: string;
  type: 'pdf' | 'image' | 'text';
  size?: number;
  content?: string;
}

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  type: 'text' | 'date' | 'number' | 'email' | 'phone';
}

export interface OCRResult {
  text: string;
  confidence: number;
  processingTime: number;
}

// Go Microservice Context
export interface GoMicroserviceContext extends BaseMachineContext {
  endpoint?: string;
  request?: GoServiceRequest;
  response?: GoServiceResponse;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  healthCheck?: {
    lastCheck: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime?: number;
  };
}

export interface GoServiceRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface GoServiceResponse {
    status: number;
    data: Record<string, unknown>;
    headers: Record<string, string>;
    duration: number;
}

// RAG Context
export interface RAGContext extends BaseMachineContext {
  query?: RAGQuery;
  results?: RAGResult[];
  searchStage?: 'analyzing' | 'searching' | 'ranking' | 'synthesizing' | 'complete';
  enhancedMode: boolean;
}

// Placeholder types for RAGQuery and RAGResult to prevent errors
export interface RAGQuery {
    text: string;
    filters?: Record<string, unknown>;
}

export interface RAGResult {
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
}
