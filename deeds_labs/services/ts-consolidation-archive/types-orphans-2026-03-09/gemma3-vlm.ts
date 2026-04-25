/**
 * Gemma3 VLM (Vision-Language Model) Types
 * For gemma3-legal:latest model integration
 * Date: February 7, 2026
 */

export interface Gemma3VLMConfig {
  modelPath: string;
  ollamaEndpoint: string;
  model: 'gemma3-legal:latest';
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  gpuLayers: number; // Number of layers to offload to GPU
}

export interface VLMImageInput {
  imageData: string | ArrayBuffer | Blob;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/tiff' | 'application/pdf';
  width: number;
  height: number;
  dpi?: number; // For scanned documents
  metadata?: {
    fileName?: string;
    fileSize?: number;
    source?: string;
  };
}

export interface VLMAnalysisRequest {
  image: VLMImageInput;
  prompt: string;
  mode: 'ocr' | 'description' | 'legal-analysis' | 'entity-extraction' | 'classification' | 'qa';
  context?: string;
  options?: {
    language?: string;
    enhanceQuality?: boolean;
    structuredOutput?: boolean;
  };
}

export interface VLMAnalysisResponse {
  text: string;
  entities?: VLMEntity[];
  structuredData?: Record<string, unknown>;
  confidence: number;
  processingTime: number;
  metadata: {
    model: string;
    tokensUsed: number;
    imageProcessingTime: number;
    llmGenerationTime: number;
  };
}

export interface VLMEntity {
  type: 'person' | 'organization' | 'location' | 'date' | 'legal-term' | 'citation' | 'signature' | 'seal';
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page?: number; // For multi-page documents
  };
  confidence: number;
  metadata?: Record<string, unknown>;
}

// Legal Document Specific Types

export interface LegalDocumentVLMAnalysis {
  documentType: 'contract' | 'pleading' | 'evidence' | 'correspondence' | 'other';
  parties: VLMEntity[];
  dates: VLMEntity[];
  citations: VLMEntity[];
  signatures: VLMEntity[];
  seals: VLMEntity[];
  keyTerms: string[];
  summary: string;
  confidence: number;
}

export interface VLMContractAnalysis extends LegalDocumentVLMAnalysis {
  clauses: ContractClause[];
  obligations: ContractObligation[];
  conditions: ContractCondition[];
  effectiveDate?: Date;
  expirationDate?: Date;
}

export interface ContractClause {
  id: string;
  type: string;
  text: string;
  page: number;
  boundingBox: VLMEntity['boundingBox'];
  importance: 'critical' | 'high' | 'medium' | 'low';
}

export interface ContractObligation {
  party: string;
  obligation: string;
  deadline?: Date;
  conditions?: string[];
}

export interface ContractCondition {
  type: 'precedent' | 'subsequent' | 'concurrent';
  description: string;
  satisfied: boolean | null;
}

// Batch Processing

export interface VLMBatchRequest {
  images: VLMImageInput[];
  prompt: string;
  mode: VLMAnalysisRequest['mode'];
  parallelism: number;
}

export interface VLMBatchResponse {
  results: VLMAnalysisResponse[];
  totalProcessingTime: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ index: number, error: string }>;
}

// Streaming

export interface VLMStreamingRequest extends VLMAnalysisRequest {
  stream: true;
}

export interface VLMStreamChunk {
  type: 'text' | 'entity' | 'metadata' | 'complete';
  data: string | VLMEntity | Record<string, unknown>;
  index: number;
  done: boolean;
}

// Cache Integration

export interface VLMCacheKey {
  imageHash: string;
  prompt: string;
  mode: string;
  model: string;
}

export interface VLMCachedResult {
  key: VLMCacheKey;
  result: VLMAnalysisResponse;
  cachedAt: Date;
  ttl: number;
}
