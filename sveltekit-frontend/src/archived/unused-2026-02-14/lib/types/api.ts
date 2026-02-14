/**
 * API response and request types
 */

// Re-export Evidence types from data layer
export type { Evidence, ExtendedEvidence, NewEvidence } from '$lib/data/types';

export interface EvidenceAIAnalysis {
  validationScore?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  complexityLevel?: 'simple' | 'moderate' | 'complex' | 'highly_complex';
  summary?: string;
  relevanceScore?: number;
  keyFindings?: string[];
  legalImplications?: string[];
  recommendations?: string[];
  risks?: string[];
  tags?: string[];
  confidence?: number;
  analysisMetrics?: AnalysisMetrics;
  processingTime?: number;
  model?: string;
  analyzedAt?: string;
  version?: number;
  [key: string]: any;
}

export interface AnalysisMetrics {
  contentLength?: number;
  processingSteps?: number;
  confidenceDistribution?: Record<string, number>;
  qualityScore?: number;
  completenessScore?: number;
  accuracyIndicators?: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
	uptime: number;
  checks?: Record<string, boolean>;
}

export interface ChatMessage {
  id: string;
	content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date | string;
  sources?: any[];
  metadata?: {
    model?: string;
    temperature?: number;
    tokensUsed?: number;
    references?: string[];
    emotionalTone?: string;
    proactive?: boolean;
    provider?: string;
    confidence?: number;
    executionTime?: number;
    fromCache?: boolean;
  };
}

export interface AIResponse {
  answer: string;
	confidence: number;
  sources?: any[];
  metadata?: Record<string, any>;
}

/**
 * Case type for API layer.
 * Mirrors the Drizzle schema `cases` table shape.
 */
export interface Case {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  caseNumber?: string | null;
  jurisdiction?: string | null;
  userId?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  [key: string]: unknown;
}

/**
 * Error details type for structured error reporting.
 */
export interface ErrorDetails {
  message: string;
  code?: string | number;
  status?: number;
  details?: Record<string, unknown>;
  stack?: string;
  timestamp?: string;
}

/**
 * Chat request payload.
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  caseId?: string;
  context?: Record<string, unknown>;
}

/**
 * Chat response payload.
 */
export interface ChatResponse {
  message: ChatMessage;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Command search types for the command palette.
 */
export interface CommandSearchRequest {
  query: string;
  limit?: number;
  scope?: string[];
}

export interface CommandSearchResponse {
  results: Array<{
    id: string;
    title: string;
    description?: string;
    category: string;
    href?: string;
    score?: number;
  }>;
  total: number;
  executionTime: number;
}




