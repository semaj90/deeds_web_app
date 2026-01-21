/**
 * API response and request types
 */

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




