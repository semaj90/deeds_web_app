import type { SearchResult as BaseSearchResult } from '$lib/types';

// Legal AI System Type Definitions

export interface LegalCase {
  id: string;
  caseNumber: string;
  title: string;
  description?: string;
  status: 'active' | 'pending' | 'closed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidentialityLevel: number;
  createdAt: Date;
  updatedAt: Date;
  assignedAttorney?: string;
  client?: string;
  jurisdiction?: string;
  courtName?: string;
  documents?: LegalDocument[];
}

export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  documentType:
    | 'motion'
    | 'brief'
    | 'contract'
    | 'evidence'
    | 'correspondence'
    | 'pleading'
    | 'other';
  caseId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  lastModified?: Date;
  createdAt: Date;
  updatedAt: Date;
  confidentialityLevel: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AIInsights {
  documentId: string;
  analysisType: 'FULL_COMPLIANCE_CHECK' | 'QUICK_SCAN' | 'ENTITY_EXTRACTION';
  findings: string[];
  entities: LegalEntity[];
  complianceChecks: ComplianceCheck[];
  riskAssessment: RiskAssessment;
  keyPhrases: string[];
  sentimentScore: number;
  summary: string;
  confidence: number;
  processingTime: number;
  analyzedAt: Date;
}

export interface LegalEntity {
  type:
    | 'CASE_NUMBER'
    | 'COURT_NAME'
    | 'JUDGE_NAME'
    | 'ATTORNEY'
    | 'LEGAL_CITATION'
    | 'DATE'
    | 'DOLLAR_AMOUNT'
    | 'STATUTE_REFERENCE'
    | 'PERSON'
    | 'ORGANIZATION';
  value: string;
  confidence: number;
  position: { start: number; end: number };
  context?: string;
  normalizedValue?: string;
}

export interface ComplianceCheck {
  rule: string;
  description: string;
  passed: boolean;
  confidence: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: string;
  recommendation?: string;
}

export interface RiskAssessment {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: RiskFactor[];
  recommendations: string[];
  mitigationSteps?: string[];
}

export interface RiskFactor {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  impact: string;
  likelihood: number;
}

export interface LegalAnalysis {
  document: LegalDocument;
  insights: AIInsights;
  complianceChecks: ComplianceCheck[];
  riskAssessment: RiskAssessment;
  analyzedAt: Date;
}

export interface AIAnalysisResult {
  documentId: string;
  analysisType: string;
  results: {
    summary?: string;
    entities?: LegalEntity[];
    complianceChecks?: ComplianceCheck[];
    riskFactors?: RiskFactor[];
    keyPhrases?: string[];
    sentimentScore?: number;
    findings?: string[];
  };
  processingTime: number;
  error?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: 'CASE' | 'DOCUMENT' | 'USER' | 'SYSTEM';
  entityId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'attorney' | 'paralegal' | 'client' | 'guest';
  clearanceLevel: number;
  permissions: string[];
  lastLoginAt?: Date;
  createdAt: Date;
  isActive: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  totalRequests: number;
  averageResponseTime: number;
  cacheSize: number;
  hitRate: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: ServiceStatus;
    ai: ServiceStatus;
    cache: ServiceStatus;
    search: ServiceStatus;
  };
  metrics: {
    totalCases: number;
    totalDocuments: number;
    pendingAnalyses: number;
    systemLoad: number;
  };
  lastChecked: Date;
}

export interface ServiceStatus {
  status: 'online' | 'offline' | 'degraded';
  responseTime: number;
  lastChecked: Date;
  error?: string;
}

export interface ProcessingResult {
  success: boolean;
  processedData?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AIModelConfig {
  modelName: string;
  endpoint: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retryAttempts: number;
  capabilities: string[];
}

export interface SearchQuery {
  query: string;
  filters: {
    caseStatus?: string[];
    documentType?: string[];
    dateRange?: { start: Date; end: Date };
    priority?: string[];
    confidentialityLevel?: number;
  };
  sortBy?: 'relevance' | 'date' | 'priority' | 'title';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  aggregations?: Record<string, unknown>;
  query: SearchQuery;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
    processingTime: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface DocumentProcessingJob {
  id: string;
  documentId: string;
  type: 'analysis' | 'ocr' | 'classification' | 'extraction';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  retryCount: number;
}

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  lastModified: Date;
  content?: string | ArrayBuffer;
}

export interface SystemNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  userId?: string;
  read: boolean;
  persistent: boolean;
  createdAt: Date;
  expiresAt?: Date;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: string;
  style: 'primary' | 'secondary' | 'destructive';
}

export interface AppConfig {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
  database: {
    host: string;
    port: number;
    name: string;
  };
  ai: {
    enabled: boolean;
    models: AIModelConfig[];
    cache: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
    };
  };
  security: {
    jwtSecret: string;
    sessionTimeout: number;
    maxLoginAttempts: number;
    passwordMinLength: number;
  };
  features: {
    documentAnalysis: boolean;
    realTimeChat: boolean;
    auditLogging: boolean;
    encryption: boolean;
  };
}

export interface SystemEvent {
  type: 'CASE_UPDATED' | 'DOCUMENT_ANALYZED' | 'USER_ACTION' | 'SYSTEM_ALERT';
  payload: unknown;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

export interface CourtInfo {
  name: string;
  jurisdiction: string;
  address: string;
  phone?: string;
  website?: string;
  judges?: string[];
}

export interface LegalPrecedent {
  caseTitle: string;
  citation: string;
  year: string;
  court: string;
  relevance: string;
  summary: string;
}

export interface ContractClause {
  title: string;
  content: string;
  type: 'liability' | 'payment' | 'termination' | 'confidentiality' | 'other';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestions?: string[];
}
