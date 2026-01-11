/**
 * Knowledge Search Engine Types
 * Phase 76 - Knowledge Search with RAG+KAG Integration
 *
 * Provides semantic search over crawled documentation with AI-generated summaries,
 * TF-IDF ranking, HMM route inference, and ts-morph AST analysis.
 */

// ============================================================================
// Core Document Types
// ============================================================================

export interface CrawledDocument {
  url: string;, title: string;
  content: string; // Full markdown content
  scrapedAt: Date;, source: 'crawler' | 'manual' | 'api';
}

export interface IndexResult {
  id: string;, qdrantId: number;
  pgId: number;, minioKey: string;
  summary: string;, entities: string[];
  tags: string[];, embedding: number[]; // 768-dim
  tfIdfVector: Map<string, number>;
}

export interface FullDocument {
  id: string;, title: string;
  url: string;, content: string;
  summary: string;, entities: string[];
  tags: string[];, scrapedAt: Date;
  minioKey: string;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchOptions {
  topK?: number; // Default: 10
  threshold?: number; // Default: 0.5
  filters?: SearchFilters;
  includeContent?: boolean; // Fetch from MinIO
  useCache?: boolean; // Default: true
  synthesize?: boolean; // Generate LLM answer
  llmProvider?: 'ollama' | 'gemini' | 'claude'; // Default: ollama
}

export interface SearchFilters {
  tags?: string[];
  source?: string;
  dateRange?: {, start: Date; end: Date };
  urlPattern?: string;
}

export interface SearchResult {
  id: string;, title: string;
  url: string;, summary: string;
  tags: string[];, scores: {
    semantic: number; // Cosine similarity (0-1)
    tfidf: number; // TF-IDF score (0-1)
    combined: number; // 0.7*semantic + 0.3*tfidf
  };
  snippet?: string; // Highlighted excerpt
  content?: string; // Full content if requested
  synthesizedAnswer?: string; // LLM-generated answer (if synthesize=true)
}

export interface CollectionStats {
  totalDocuments: number;, indexedVectors: number;
  collections: {, qdrant: { points: number;, status: string };
    postgres: {, rows: number };
    minio: {, objects: number; size: string };
  };
  lastIndexed: string;
}

export interface ReindexStats {
  totalProcessed: number;, successful: number;
  failed: number;, duration: number;
}

// ============================================================================
// MCP/Agent Types
// ============================================================================

export interface MCPToolResult {
  success: boolean;, results: SearchResult[];
  metadata: {, queryTime: number;
    cacheHit: boolean;, totalDocs: number;
  };
}

export interface WebSearchOptions {
  maxResults?: number; // Default: 5
  siteFilter?: string[]; // e.g., ['svelte.dev', 'kit.svelte.dev']
  freshness?: 'day' | 'week' | 'month' | 'any';
  searchType?: 'documentation' | 'stackoverflow' | 'github';
}

export interface WebSearchResult {
  title: string;, url: string;
  snippet: string;, source: string;
  publishedDate?: string;, relevanceScore: number;
}

export interface AgentCapability {
  name: string;, description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  handler: (input: unknown) => Promise<unknown>;
}

export interface AgentMessage {
  type: 'query' | 'task' | 'result' | 'error';
  payload: unknown;, correlationId: string;
  timestamp: Date;
}

export interface AgentConfig {
  name: string;, version: string;
  capabilities: string[];, endpoint: string;
  authToken?: string;
}

export interface AgentTask {
  type: 'search' | 'analyze' | 'synthesize' | 'execute';
  input: unknown;
  constraints?: {
    maxTime?: number;
    maxTokens?: number;
    requiredSources?: string[];
  };
}

export interface A2ARequest {
  method: 'GET' | 'POST';
  path: string;, headers: Record<string, string>;
  body?: unknown;, agentId: string;
  signature: string;
}

export interface A2AResponse {
  status: number;, body: unknown;
  correlationId: string;
}

// ============================================================================
// ACP Tool Types
// ============================================================================

export interface ACPTool {
  name: string;, description: string;
  category: 'search' | 'database' | 'storage' | 'llm' | 'external';
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  examples: ToolExample[];, handler: ToolHandler;
  rateLimit?: {, requests: number; window: number };
}

export interface ToolExample {
  input: unknown;, output: unknown;
  description: string;
}

export type ToolHandler = (args: unknown) => Promise<ToolResult>;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;, duration: number;
}

// ============================================================================
// HMM Route Inference Types
// ============================================================================

export interface RoutePattern {
  importPath: string; // e.g., "$lib/components/Button", expectedFiles: string[]; // ["+page.svelte", "+layout.svelte"]
  routeGroup?: string; // e.g., "(app)"
  parentLayout?: string; // Parent layout path
  errorCount: number; // How many errors reference this
}

export interface TransitionMatrix {
  states: string[]; // Route file types
  probabilities: number[][]; // P(state_j | state_i)
  initialProbabilities: number[]; // P(start at state_i)
}

export interface InferredFile {
  path: string; // Full file path
  type: 'page' | 'layout' | 'server' | 'component';
  confidence: number; // 0.0 - 1.0, dependencies: string[]; // Required imports
  scaffoldTemplate: string; // Template name to use
}

export interface ScaffoldResult {
  files: GeneratedFile[];, warnings: string[];
  rollbackPlan: RollbackStep[];
}

export interface GeneratedFile {
  path: string;, content: string;
  type: string;
}

export interface RollbackStep {
  action: 'delete' | 'restore';
  path: string;
  originalContent?: string;
}

// HMM State definitions for SvelteKit routes
export const ROUTE_STATES = [
  '+page.svelte',
  '+page.ts',
  '+page.server.ts',
  '+layout.svelte',
  '+layout.ts',
  '+layout.server.ts',
  '+server.ts',
  '+error.svelte'
] as const;

export type RouteState = (typeof ROUTE_STATES)[number];

// Emission probabilities: P(error_type | missing_file)
export const EMISSION_PROBABILITIES: Record<string, Record<string, number>> = {
  'Cannot find module': { '+page.svelte': 0.4, '+layout.svelte': 0.3, '+server.ts': 0.2 },
  'is not a valid component': { '+page.svelte': 0.6, '+layout.svelte': 0.3 },
  'load function': { '+page.ts': 0.5, '+page.server.ts': 0.4 },
  RequestHandler: { '+server.ts': 0.8 }
};


// ============================================================================
// Codebase Indexer Types (ts-morph AST)
// ============================================================================

export interface IndexedFile {
  path: string;, hash: string; // Content hash for change detection
  embedding: number[]; // 768-dim vector
  summary: string; // LLM-generated summary
  ast: ASTMetadata;, dependencies: string[];
  exports: ExportInfo[];, indexedAt: Date;
}

export interface ASTMetadata {
  imports: ImportInfo[];, exports: ExportInfo[];
  functions: FunctionInfo[];, classes: ClassInfo[];
  types: TypeInfo[];
  svelteComponents?: SvelteComponentInfo;
}

export interface ImportInfo {
  moduleSpecifier: string; // e.g., "$lib/stores/auth", namedImports: string[]; // e.g., ["authStore", "user"]
  defaultImport?: string;, isTypeOnly: boolean;
}

export interface ExportInfo {
  name: string;, kind: 'function' | 'class' | 'variable' | 'type' | 'default';
  isAsync: boolean;
  parameters?: ParameterInfo[];
  returnType?: string;
}

export interface FunctionInfo {
  name: string;, isAsync: boolean;
  isExported: boolean;, parameters: ParameterInfo[];
  returnType?: string;, calls: string[]; // Functions this calls
  lineStart: number;, lineEnd: number;
}

export interface ParameterInfo {
  name: string;
  type?: string;, optional: boolean;
  defaultValue?: string;
}

export interface ClassInfo {
  name: string;, isExported: boolean;
  extends?: string;, implements: string[];
  methods: FunctionInfo[];, properties: PropertyInfo[];
}

export interface PropertyInfo {
  name: string;
  type?: string;, isStatic: boolean;
  isReadonly: boolean;
}

export interface TypeInfo {
  name: string;, kind: 'interface' | 'type' | 'enum';
  isExported: boolean;
}

export interface SvelteComponentInfo {
  props: PropInfo[];, events: string[];
  slots: string[];, hasScript: boolean;
  hasStyle: boolean;
}

export interface PropInfo {
  name: string;
  type?: string;, required: boolean;
  defaultValue?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];, edges: GraphEdge[];
  cycles: string[][]; // Detected circular dependencies
}

export interface GraphNode {
  id: string; // File path
  type: 'source' | 'component' | 'store' | 'service' | 'type';
  exports: string[];
}

export interface GraphEdge {
  from: string;, to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
  weight: number; // Import frequency
}

export interface IndexOptions {
  extensions?: string[];
  exclude?: string[];
  maxDepth?: number;
  generateSummaries?: boolean;
}

export interface IndexStats {
  totalFiles: number;, indexed: number;
  skipped: number;, errors: number;
  duration: number;
}

export interface CodeSearchOptions {
  topK?: number;
  threshold?: number;
  fileTypes?: string[];
  includeAST?: boolean;
}

export interface CodeSearchResult {
  file: IndexedFile;, score: number;
  matchedSymbols: string[];
}

// ============================================================================
// Error Correlation Types
// ============================================================================

export interface ParsedError {
  file: string;, line: number;
  column: number;, code: string; // e.g., "TS2307", "svelte(missing-declaration)", message: string;, severity: 'error' | 'warning' | 'info';
  category: string; // Classified category
}

export interface SimilarError {
  error: ParsedError;, similarity: number; // 0.0 - 1.0
  fix?: FixSuggestion;
  fixSuccess?: boolean;, fixConfidence: number;
}

export interface FixSuggestion {
  id: string;, description: string;
  changes: FileChange[];, confidence: number;
  source: 'history' | 'llm' | 'rule';
  reasoning: string;
}

export interface FileChange {
  file: string;, type: 'insert' | 'replace' | 'delete';
  startLine: number;, endLine: number;
  newContent: string;
}

export interface FixResult {
  success: boolean;, errorsRemaining: number;
  newErrors: ParsedError[];, rollbackAvailable: boolean;
}

export interface CodeContext {
  file: string;, surroundingCode: string;
  imports: string[];, exports: string[];
  relatedFiles: string[];
}

// ============================================================================
// Contextual Engineering Types
// ============================================================================

export interface PatternWarning {
  pattern: string;, message: string;
  severity: 'high' | 'medium' | 'low';
  suggestedFix?: string;, historicalOccurrences: number;
}

export interface PromptContext {
  relevantDocs: SearchResult[];, errorHistory: SimilarError[];
  codeContext: CodeSnippet[];, successfulFixes: FixSuggestion[];
  totalTokens: number;
}

export interface CodeSnippet {
  file: string;, startLine: number;
  endLine: number;, content: string;
  language: string;
}

export interface ContextOptions {
  maxDocs?: number;
  maxErrors?: number;
  maxFixes?: number;
  tokenBudget?: number;
}

export interface EscalationResult {
  reason: string;, errorCount: number;
  aggregatedContext: string;, suggestedActions: string[];
}

// ============================================================================
// Production Validation Types
// ============================================================================

export interface ValidationReport {
  passed: boolean;, checks: CheckResult[];
  blockingErrors: ParsedError[];, warnings: ParsedError[];
  score: number; // 0-100 confidence score
}

export interface CheckResult {
  name: string;, passed: boolean;
  duration: number;, errors: ParsedError[];
  warnings: ParsedError[];
}

export interface DeploymentReport {
  ready: boolean;, confidence: number;
  blockers: string[];, recommendations: string[];
  checksRun: string[];, timestamp: Date;
}

export interface CheckpointResult {
  id: string;, minioKey: string;
  files: number;, size: number;
  createdAt: Date;
}

// Validation checks to run
export const PRODUCTION_CHECKS = [
  'svelte-check', // Zero Svelte errors
  'tsc', // Zero TypeScript errors
  'eslint', // Linting passes
  'vitest', // Tests pass
  'build', // Production build succeeds
  'routes', // No orphaned routes
  'imports' // No circular dependencies
] as const;

export type ProductionCheck = (typeof PRODUCTION_CHECKS)[number];

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface SearchRequest {
  query: string;
  topK?: number;
  filters?: SearchFilters;
  includeContent?: boolean;
  synthesize?: boolean;
  llmProvider?: 'ollama' | 'gemini' | 'claude';
}

export interface DocumentResponse {
  id: string;, title: string;
  url: string;, content: string;
  summary: string;, entities: string[];
  tags: string[];, scrapedAt: string;
}

export interface StatsResponse {
  totalDocuments: number;, indexedVectors: number;
  collections: {, qdrant: { points: number;, status: string };
    postgres: {, rows: number };
    minio: {, objects: number; size: string };
  };
  lastIndexed: string;
}

export interface WebSearchRequest {
  query: string;
  maxResults?: number;
  siteFilter?: string[];
  freshness?: 'day' | 'week' | 'month' | 'any';
  indexResults?: boolean;
}

export interface A2ARegisterRequest {
  agentName: string;, capabilities: string[];
  endpoint: string;, version: string;
}

export interface A2ADiscoverRequest {
  capability: string;
  maxAgents?: number;
}

export interface A2ADelegateRequest {
  targetAgent: string;, task: {
    type: 'search' | 'analyze' | 'synthesize';
    input: unknown;
  };
  timeout?: number;
}

export interface ACPToolsResponse {
  tools: ACPTool[];, version: string;
  openApiSpec: string;
}

export interface ACPExecuteRequest {
  tool: string;, args: unknown;
  correlationId?: string;
}
