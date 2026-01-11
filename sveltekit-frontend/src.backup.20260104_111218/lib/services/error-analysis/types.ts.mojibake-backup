/**
 * Core types for error analysis system
 */

export interface Error {
  id: string;
  file: string;
  line: number;
  column: number;
  message: string;
  type: 'typescript' | 'svelte';
  severity: 'error' | 'warning';
  code?: string;
  embedding?: number[];
  clusterId?: string;
  status: 'new' | 'analyzing' | 'fixed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Embedding {
  errorId: string;
  vector: number[];
  model: string;
  createdAt: Date;
}

export interface Pattern {
  id: string;
  filePath: string;
  lineNumber: number;
  code: string;
  errorType: string;
  similarity: number;
  embedding?: number[];
}

export interface Analysis {
  errorId: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
  relatedErrors: string[];
  context: string;
  createdAt: Date;
}

export interface LLMPrompt {
  id: string;
  errorId: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LLMResponse {
  text: string;
  tokens: number;
  model: string;
  timestamp: Date;
}

export interface Diff {
  id: string;
  errorId: string;
  file: string;
  original: string;
  modified: string;
  context: string;
  explanation: string;
  lineStart: number;
  lineEnd: number;
  status: 'pending' | 'applied' | 'validated' | 'failed';
  createdAt: Date;
  appliedAt?: Date;
}

export interface Cluster {
  id: string;
  errors: Error[];
  rootCause: string;
  impact: number;
  commonFix?: string;
  createdAt: Date;
}

export interface ACEContext {
  sessionId: string;
  errorAnalysis: Analysis[];
  fixesApplied: Diff[];
  metrics: Metrics;
  timestamp: Date;
}

export interface Metrics {
  totalErrors: number;
  errorsFixed: number;
  successRate: number;
  averageConfidence: number;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: 'analyze' | 'fix' | 'validate';
  details: Record<string, any>;
}

export interface AuditFilter {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  user?: string;
  limit?: number;
  offset?: number;
}

export interface ServiceConfig {
  ollamaUrl: string;
  qdrantUrl: string;
  postgresUrl: string;
  maxRetries: number;
  retryDelayMs: number;
  contextLines: number;
}
