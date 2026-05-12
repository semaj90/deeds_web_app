/**
 * Type definitions for LLM Self-Improvement System
 * Phase 72 - GRPO Learning with RAG+KAG
 */

// ============================================================================
// Error Types
// ============================================================================

export interface ErrorReport {
  file: string;
	line: number;
  column: number;
	code: string;
  message: string;
	severity: 'error' | 'warning' | 'hint';
  source: 'svelte-check' | 'tsc' | 'ast' | 'runtime' | 'cpp' | 'python' | 'go';
  category?: string;
  hash?: string;
  timestamp?: string;
  tool?: string;
}

export interface ErrorContext {
  text: string; // Error message
  ast?: ASTNode; // Code structure
  runtime?: StackTrace; // Stack trace if available
  visual?: Screenshot; // UI state if available
  fileContent: string; // Surrounding code
  embedding?: number[]; // 384-dim or 768-dim vector
}

export interface ASTNode {
  type: string;
	start: number;
  end: number;
  children?: ASTNode[];
  properties?: Record<string, any>;
}

export interface StackTrace {
  frames: StackFrame[];
	message: string;
}

export interface StackFrame {
  file: string;
	line: number;
  column: number;
	function: string;
}

export interface Screenshot {
  url: string;
	timestamp: string;
  width: number;
	height: number;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CachedResult {
  embedding: number[];
	fixStrategies: FixStrategy[];
  confidence: number;
	timestamp: number;
  fileHash: string;
	errorOutput: string;
}

export interface CacheEntry {
  key: string; // svelte-check: { file_path }
  hash: string;
  fileHash: string; // SHA-256 hash
  embedding: number[]; // Cached embedding
  fixStrategies: FixStrategy[]; // Cached strategies
  confidence: number; // Cached confidence
  ttl: number; // Time to live (7 days)
  createdAt: Date;
}

// ============================================================================
// Fix Strategy Types
// ============================================================================

export interface FixStrategy {
	id: string; // UUID
	description: string; // What the fix does
	code: string; // Actual code change
	applicablePatterns: string[]; // Error pattern IDs
	successRate: number; // 0-1
	confidence: number; // 0-1
	validationRules: ValidationRule[];
	appliedCount: number;
	lastApplied: Date;
	createdAt: Date;
}

export interface ValidationRule {
  type: 'ast' | 'type' | 'syntax';
  rule: string;
	required: boolean;
}

// ============================================================================
// RAG/KAG Types
// ============================================================================

export interface SimilarError {
  id: string;
	embedding: number[];
  similarity: number;
	fixStrategies: FixStrategy[];
  successRate: number;
	timestamp: number;
  errorReport: ErrorReport;
}

export interface ErrorRelationship {
  from: string;
	to: string;
  type: 'causes' | 'related_to' | 'fixed_by' | 'similar_to';
  weight: number;
}

// ============================================================================
// GRPO Types
// ============================================================================

export interface ErrorGroup {
  id: string;
	centroid: number[];
  members: string[];
	commonPattern: string;
}

export interface Experience {
  id: string; // UUID
  errorId: string; // Reference to error pattern
  strategyId: string; // Reference to fix strategy
  outcome: 'success' | 'failure';
  confidence: number;
  context: ErrorContext;
	toolsInvoked: string[]; // List of tools used
  humanIntervention: boolean;
  feedback?: string; // Human feedback if escalated
  timestamp: Date;
}

export interface PolicyState {
  version: number; // Policy version
  weights: number[]; // Neural network weights
  experienceCount: number; // Total experiences processed
  lastUpdate: Date;
	performance: {
    successRate: number;
	avgConfidence: number;
    escalationRate: number;
  };
}

// ============================================================================
// Error Pattern Types
// ============================================================================

export interface ErrorPattern {
  id: string; // UUID
  pattern: string; // Natural language description
  embedding: number[]; // 384-dim or 768-dim vector
  errorType: string; // 'type' | 'syntax' | 'runtime' | 'svelte'
  fixStrategies: FixStrategy[]; // Ranked list of fixes
  clusterMetadata: ClusterMetadata;
	successRate: number; // 0-1
	occurrences: number; // How many times seen
  lastSeen: Date;
	createdAt: Date;
}

export interface ClusterMetadata {
  clusterId: string;
	centroid: number[];
  size: number;
	commonFeatures: string[];
}

// ============================================================================
// Tool Invocation Types
// ============================================================================

export interface DiagnosticResult {
  tool: string;
	errors: ErrorReport[];
  warnings: ErrorReport[];
	timestamp: number;
}

export interface ASTAnalysis {
  nodes: ASTNode[];
	imports: string[];
  exports: string[];
	dependencies: string[];
  complexity: number;
}

// ============================================================================
// Escalation Types
// ============================================================================

export interface EscalationTicket {
  id: string;
	errorReport: ErrorReport;
  attemptedStrategies: FixStrategy[];
	confidence: number;
  toolResults: DiagnosticResult[];
	context: ErrorContext;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedTo?: string;
  resolution?: string;
	createdAt: Date;
  resolvedAt?: Date;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface SystemMetrics {
	errorDetectionRate: number;
	cacheHitRate: number;
	confidenceDistribution: {
	high: number;
		medium: number;
		low: number;
	};
	fixSuccessRate: number;
	escalationRate: number;
	policyUpdateFrequency: number;
	serviceAvailability: {
		redis: boolean;
		qdrant: boolean;
		neo4j: boolean;
		ollama: boolean;
		turboquant: boolean;
		reranker: boolean;
		bifrost: boolean;
		vlm: boolean;
	};
	performance: {
	embeddingGenerationTime: number; // ms
		vectorSearchLatency: number; // ms
		fixApplicationTime: number; // ms
		policyUpdateTime: number; // ms
	};
}

// ============================================================================
// JSONL Storage Types
// ============================================================================

export interface JSONLRecord {
	type: 'error' | 'fix' | 'experience' | 'pattern';
	data: ErrorReport | FixStrategy | Experience | ErrorPattern;
	timestamp: string;
	version: string;
}

// ============================================================================
// Route Consolidation Types
// ============================================================================

export interface RouteInfo {
	path: string;
	type: 'page' | 'layout' | 'server' | 'api';
	imports: string[];
	exports: string[];
	dependencies: string[];
	duplicates?: RouteInfo[];
	consolidationOpportunity?: string;
}

export interface ConsolidationRecommendation {
  routes: RouteInfo[];
	reason: string;
  impact: 'high' | 'medium' | 'low';
  migrationSteps: string[];
}

// ============================================================================
// Multi-Language Error Detection Types
// ============================================================================

export interface LanguageErrorDetector {
	language: 'typescript' | 'svelte' | 'cpp' | 'python' | 'go';
	tool: string;
	detect: () => Promise<ErrorReport[]>;
}

// ============================================================================
// ACE Prompt Engineering Types
// ============================================================================

export interface ACEPrompt {
	template: string;
	context: {
		errorReport: ErrorReport;
	similarErrors: SimilarError[];
		graphInsights: ErrorRelationship[];
	fewShotExamples: FixStrategy[];
	};
	confidence: number;
}

export interface ACEResponse {
  fixStrategy: FixStrategy;
	reasoning: string;
  confidence: number;
	alternativeStrategies: FixStrategy[];
}






// ============================================================================
// Service Configuration Types
// ============================================================================

export interface ServiceConfig {
	name: string;
	version: string;
	logLevel: 'debug' | 'info' | 'warn' | 'error';
	enabled: boolean;
	timeout?: number;
	retryAttempts?: number;
	maxRetries?: number;
	retryDelayMs?: number;
}

// ============================================================================
// LLM Types
// ============================================================================

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
	model: string;
	tokens: number;
	confidence?: number;
	finishReason?: string;
}
