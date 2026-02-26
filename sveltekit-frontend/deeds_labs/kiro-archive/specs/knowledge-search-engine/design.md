# Design Document: Knowledge Search Engine

## Overview

The Knowledge Search Engine provides semantic search over crawled documentation with AI-generated summaries, TF-IDF ranking, and full integration with the RAG+KAG pipeline. It enables contextual prompt engineering for LLM synthesis by combining:

- **Qdrant** - Primary vector store (768-dim embeddings via embeddinggemma)
- **PostgreSQL 17 + pgvector** - Hybrid search with SQL filters
- **MinIO** - Full document text storage (S3-compatible)
- **Redis** - Search result caching (1hr TTL)
- **MCP/FastMCP** - Agentic tool calling for ACE agent
- **Ollama** - Embedding generation and LLM synthesis
- **ts-morph** - TypeScript AST analysis for codebase indexing
- **Neo4j** - Knowledge graph for code relationships and error patterns
- **HMM Route Inference** - Probabilistic model for inferring missing routes from error patterns

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Knowledge Search Engine + A2A/ACP                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Agent Layer (A2A/ACP)                               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │ WebSearch   │  │    A2A      │  │    ACP      │  │   FastMCP   │        │ │
│  │  │   Agent     │  │  Protocol   │  │  Registry   │  │   Server    │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│         │                   │                   │                   │            │
│         ▼                   ▼                   ▼                   ▼            │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Ingestion Layer                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │   Crawler   │  │  Processor  │  │   Indexer   │  │  TF-IDF     │        │ │
│  │  │  (Phase 76) │  │  (Summary)  │  │  (Vectors)  │  │  Ranker     │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│         │                   │                   │                   │            │
│         ▼                   ▼                   ▼                   ▼            │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Storage Layer                                       │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │ │
│  │  │ Qdrant  │  │Postgres │  │  MinIO  │  │  Redis  │  │  Neo4j  │          │ │
│  │  │ Vectors │  │pgvector │  │  Text   │  │  Cache  │  │  Graph  │          │ │
│  │  │  768d   │  │  768d   │  │   S3    │  │  1hr    │  │  (KAG)  │          │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│         │                   │                   │                   │            │
│         ▼                   ▼                   ▼                   ▼            │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Query Layer                                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │  Semantic   │  │   Hybrid    │  │   Inverse   │  │    LLM      │        │ │
│  │  │   Search    │  │   Scorer    │  │   Ranking   │  │  Synthesis  │        │ │
│  │  │  (Cosine)   │  │ (70%+30%)   │  │  (TF-IDF)   │  │  (Gemma3)   │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│         │                                                                        │
│         ▼                                                                        │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         API Layer                                           │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │  REST API   │  │  MCP Tool   │  │  Search UI  │  │  A2A API    │        │ │
│  │  │ /api/know.. │  │  Port 3002  │  │  /knowledge │  │ /api/a2a/*  │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

Data Flow:
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User    │───▶│ Embed    │───▶│  Search  │───▶│  Rank    │───▶│Synthesize│
│  Query   │    │ (768d)   │    │ (Qdrant) │    │(TF-IDF)  │    │ (Gemma3) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │               │               │
                     ▼               ▼               ▼               ▼
              embeddinggemma   Cosine Sim      70%+30%        Context
                :latest         Top-K          Hybrid         Injection
```

## Components and Interfaces

### 1. KnowledgeIndexer

Responsible for processing crawled documents and storing in all backends.

```typescript
interface KnowledgeIndexer {
  // Index a single document
  indexDocument(doc: CrawledDocument): Promise<IndexResult>;

  // Batch index multiple documents
  indexBatch(docs: CrawledDocument[]): Promise<IndexResult[]>;

  // Reindex entire collection
  reindexAll(): Promise<ReindexStats>;

  // Delete document by ID
  deleteDocument(id: string): Promise<boolean>;
}

interface CrawledDocument {
  url: string;
  title: string;
  content: string;  // Full markdown content
  scrapedAt: Date;
  source: 'crawler' | 'manual' | 'api';
}

interface IndexResult {
  id: string;
  qdrantId: number;
  pgId: number;
  minioKey: string;
  summary: string;
  entities: string[];
  tags: string[];
  embedding: number[];  // 768-dim
  tfIdfVector: Map<string, number>;
}
```

### 2. KnowledgeSearcher

Handles semantic search with hybrid ranking.

```typescript
interface KnowledgeSearcher {
  // Semantic search with optional filters
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Get document by ID with full content
  getDocument(id: string): Promise<FullDocument | null>;

  // Get collection statistics
  getStats(): Promise<CollectionStats>;

  // Invalidate cache for query or all
  invalidateCache(queryHash?: string): Promise<void>;
}

interface SearchOptions {
  topK?: number;           // Default: 10
  threshold?: number;      // Default: 0.5
  filters?: SearchFilters;
  includeContent?: boolean; // Fetch from MinIO
  useCache?: boolean;       // Default: true
}

interface SearchFilters {
  tags?: string[];
  source?: string;
  dateRange?: { start: Date; end: Date };
  urlPattern?: string;
}

interface SearchResult {
  id: string;
  title: string;
  url: string;
  summary: string;
  tags: string[];
  scores: {
    semantic: number;    // Cosine similarity (0-1)
    tfidf: number;       // TF-IDF score (0-1)
    combined: number;    // 0.7*semantic + 0.3*tfidf
  };
  snippet?: string;      // Highlighted excerpt
  content?: string;      // Full content if requested
}
```

### 3. TfIdfRanker

Computes inverse document frequency rankings.

```typescript
interface TfIdfRanker {
  // Compute TF for a document
  computeTf(content: string): Map<string, number>;

  // Compute IDF across collection
  computeIdf(term: string): number;

  // Compute TF-IDF score for query against document
  score(query: string, docTfVector: Map<string, number>): number;

  // Update IDF cache when collection changes
  updateIdfCache(): Promise<void>;
}
```

### 4. MCPKnowledgeTool

FastMCP tool for agentic access.

```typescript
interface MCPKnowledgeTool {
  name: 'knowledge-search';
  description: 'Search crawled documentation for relevant context';

  parameters: {
    query: string;
    topK?: number;
    filters?: {
      tags?: string[];
      source?: string;
    };
  };

  execute(params: Parameters): Promise<MCPToolResult>;
}

interface MCPToolResult {
  success: boolean;
  results: SearchResult[];
  metadata: {
    queryTime: number;
    cacheHit: boolean;
    totalDocs: number;
  };
}
```

### 5. WebSearchAgent (Google A2A/ACP Integration)

Agentic web search using Google's Agent-to-Agent protocol for real-time documentation lookup.

```typescript
interface WebSearchAgent {
  // Search the web for documentation
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;

  // Fetch and process a URL
  fetchAndProcess(url: string): Promise<ProcessedDocument>;

  // A2A: Communicate with other agents
  sendToAgent(agentId: string, message: AgentMessage): Promise<AgentResponse>;

  // ACP: Register capabilities
  registerCapability(capability: AgentCapability): void;
}

interface WebSearchOptions {
  maxResults?: number;      // Default: 5
  siteFilter?: string[];    // e.g., ['svelte.dev', 'kit.svelte.dev']
  freshness?: 'day' | 'week' | 'month' | 'any';
  searchType?: 'documentation' | 'stackoverflow' | 'github';
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
  relevanceScore: number;
}

interface AgentCapability {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  handler: (input: unknown) => Promise<unknown>;
}

interface AgentMessage {
  type: 'query' | 'task' | 'result' | 'error';
  payload: unknown;
  correlationId: string;
  timestamp: Date;
}
```

### 6. A2AProtocolHandler

Google Agent-to-Agent protocol implementation for multi-agent coordination.

```typescript
interface A2AProtocolHandler {
  // Register this agent with the A2A network
  register(agentConfig: AgentConfig): Promise<string>;

  // Discover other agents by capability
  discoverAgents(capability: string): Promise<AgentInfo[]>;

  // Send task to another agent
  delegateTask(agentId: string, task: AgentTask): Promise<TaskResult>;

  // Handle incoming requests from other agents
  handleRequest(request: A2ARequest): Promise<A2AResponse>;
}

interface AgentConfig {
  name: string;
  version: string;
  capabilities: string[];
  endpoint: string;
  authToken?: string;
}

interface AgentTask {
  type: 'search' | 'analyze' | 'synthesize' | 'execute';
  input: unknown;
  constraints?: {
    maxTime?: number;
    maxTokens?: number;
    requiredSources?: string[];
  };
}

interface A2ARequest {
  method: 'GET' | 'POST';
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  agentId: string;
  signature: string;
}
```

### 7. ACPToolRegistry

Agentic Capabilities Protocol registry for dynamic tool discovery.

```typescript
interface ACPToolRegistry {
  // Register a tool with ACP
  registerTool(tool: ACPTool): void;

  // List all available tools
  listTools(): ACPTool[];

  // Get tool by name
  getTool(name: string): ACPTool | null;

  // Execute tool with validation
  executeTool(name: string, args: unknown): Promise<ToolResult>;

  // Generate OpenAPI spec for tools
  generateOpenAPISpec(): OpenAPISpec;
}

interface ACPTool {
  name: string;
  description: string;
  category: 'search' | 'database' | 'storage' | 'llm' | 'external';
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  examples: ToolExample[];
  handler: ToolHandler;
  rateLimit?: { requests: number; window: number };
}

// Pre-registered tools
const BUILTIN_TOOLS: ACPTool[] = [
  {
    name: 'qdrant_search',
    description: 'Semantic search in Qdrant vector store',
    category: 'search',
    // ...
  },
  {
    name: 'postgres_query',
    description: 'Execute SQL query on PostgreSQL 17',
    category: 'database',
    // ...
  },
  {
    name: 'minio_fetch',
    description: 'Fetch document from MinIO object storage',
    category: 'storage',
    // ...
  },
  {
    name: 'redis_cache',
    description: 'Get/set values in Redis cache',
    category: 'storage',
    // ...
  },
  {
    name: 'web_search',
    description: 'Search the web for documentation',
    category: 'external',
    // ...
  },
  {
    name: 'llm_synthesize',
    description: 'Generate text using LLM',
    category: 'llm',
    // ...
  }
];
```

### 8. KnowledgeAPI

REST API endpoints.

```typescript
// POST /api/knowledge/search
interface SearchRequest {
  query: string;
  topK?: number;
  filters?: SearchFilters;
  includeContent?: boolean;
  synthesize?: boolean;  // Generate LLM answer
  llmProvider?: 'ollama' | 'gemini' | 'claude';
}

// GET /api/knowledge/document/:id
interface DocumentResponse {
  id: string;
  title: string;
  url: string;
  content: string;  // Full markdown from MinIO
  summary: string;
  entities: string[];
  tags: string[];
  scrapedAt: string;
}

// GET /api/knowledge/stats
interface StatsResponse {
  totalDocuments: number;
  indexedVectors: number;
  collections: {
    qdrant: { points: number; status: string };
    postgres: { rows: number };
    minio: { objects: number; size: string };
  };
  lastIndexed: string;
}

// POST /api/knowledge/web-search (A2A Web Search)
interface WebSearchRequest {
  query: string;
  maxResults?: number;
  siteFilter?: string[];
  freshness?: 'day' | 'week' | 'month' | 'any';
  indexResults?: boolean;  // Auto-index found docs
}

// POST /api/a2a/register (A2A Agent Registration)
interface A2ARegisterRequest {
  agentName: string;
  capabilities: string[];
  endpoint: string;
  version: string;
}

// POST /api/a2a/discover (A2A Agent Discovery)
interface A2ADiscoverRequest {
  capability: string;
  maxAgents?: number;
}

// POST /api/a2a/delegate (A2A Task Delegation)
interface A2ADelegateRequest {
  targetAgent: string;
  task: {
    type: 'search' | 'analyze' | 'synthesize';
    input: unknown;
  };
  timeout?: number;
}

// GET /api/acp/tools (ACP Tool Registry)
interface ACPToolsResponse {
  tools: ACPTool[];
  version: string;
  openApiSpec: string;  // URL to OpenAPI spec
}

// POST /api/acp/execute (ACP Tool Execution)
interface ACPExecuteRequest {
  tool: string;
  args: unknown;
  correlationId?: string;
}
```

### 9. RouteInferenceEngine (HMM-like Route Detection)

Probabilistic inference of missing routes from error patterns using Hidden Markov Model concepts.

```typescript
interface RouteInferenceEngine {
  // Parse errors to extract route patterns
  parseErrors(errors: TypeScriptError[]): RoutePattern[];

  // Build transition probability matrix from error history
  buildTransitionMatrix(patterns: RoutePattern[]): TransitionMatrix;

  // Infer most likely missing files using Viterbi algorithm
  inferMissingFiles(pattern: RoutePattern): InferredFile[];

  // Generate scaffold code for inferred files
  generateScaffold(files: InferredFile[]): ScaffoldResult;
}

interface RoutePattern {
  importPath: string;           // e.g., "$lib/components/Button"
  expectedFiles: string[];      // ["+page.svelte", "+layout.svelte"]
  routeGroup?: string;          // e.g., "(app)"
  parentLayout?: string;        // Parent layout path
  errorCount: number;           // How many errors reference this
}

interface TransitionMatrix {
  states: string[];             // Route file types
  probabilities: number[][];    // P(state_j | state_i)
  initialProbabilities: number[]; // P(start at state_i)
}

interface InferredFile {
  path: string;                 // Full file path
  type: 'page' | 'layout' | 'server' | 'component';
  confidence: number;           // 0.0 - 1.0
  dependencies: string[];       // Required imports
  scaffoldTemplate: string;     // Template name to use
}

interface ScaffoldResult {
  files: GeneratedFile[];
  warnings: string[];
  rollbackPlan: RollbackStep[];
}

// HMM State definitions for SvelteKit routes
const ROUTE_STATES = [
  '+page.svelte',
  '+page.ts',
  '+page.server.ts',
  '+layout.svelte',
  '+layout.ts',
  '+layout.server.ts',
  '+server.ts',
  '+error.svelte'
];

// Emission probabilities: P(error_type | missing_file)
const EMISSION_PROBABILITIES = {
  'Cannot find module': { '+page.svelte': 0.4, '+layout.svelte': 0.3, '+server.ts': 0.2 },
  'is not a valid component': { '+page.svelte': 0.6, '+layout.svelte': 0.3 },
  'load function': { '+page.ts': 0.5, '+page.server.ts': 0.4 },
  'RequestHandler': { '+server.ts': 0.8 }
};
```

### 10. CodebaseIndexer (ts-morph AST Analysis)

Indexes source files using ts-morph for AST analysis with LLM summaries.

```typescript
interface CodebaseIndexer {
  // Index a single file with AST analysis
  indexFile(filePath: string): Promise<IndexedFile>;

  // Batch index directory
  indexDirectory(dirPath: string, options?: IndexOptions): Promise<IndexStats>;

  // Watch for file changes and re-index
  watchAndIndex(dirPath: string): FileWatcher;

  // Query indexed files
  searchCode(query: string, options?: CodeSearchOptions): Promise<CodeSearchResult[]>;

  // Get dependency graph for a file
  getDependencyGraph(filePath: string): Promise<DependencyGraph>;
}

interface IndexedFile {
  path: string;
  hash: string;                 // Content hash for change detection
  embedding: number[];          // 768-dim vector
  summary: string;              // LLM-generated summary
  ast: ASTMetadata;
  dependencies: string[];
  exports: ExportInfo[];
  indexedAt: Date;
}

interface ASTMetadata {
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  types: TypeInfo[];
  svelteComponents?: SvelteComponentInfo;
}

interface ImportInfo {
  moduleSpecifier: string;      // e.g., "$lib/stores/auth"
  namedImports: string[];       // e.g., ["authStore", "user"]
  defaultImport?: string;
  isTypeOnly: boolean;
}

interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'default';
  isAsync: boolean;
  parameters?: ParameterInfo[];
  returnType?: string;
}

interface FunctionInfo {
  name: string;
  isAsync: boolean;
  isExported: boolean;
  parameters: ParameterInfo[];
  returnType?: string;
  calls: string[];              // Functions this calls
  lineStart: number;
  lineEnd: number;
}

interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];           // Detected circular dependencies
}

interface GraphNode {
  id: string;                   // File path
  type: 'source' | 'component' | 'store' | 'service' | 'type';
  exports: string[];
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
  weight: number;               // Import frequency
}
```

### 11. ErrorCodeCorrelator

Links TypeScript/Svelte errors to specific code locations and suggests fixes.

```typescript
interface ErrorCodeCorrelator {
  // Parse error output from tsc/svelte-check
  parseErrors(output: string, source: 'tsc' | 'svelte-check'): ParsedError[];

  // Find AST node at error location
  findASTNode(error: ParsedError): ASTNode | null;

  // Search for similar errors in history
  findSimilarErrors(error: ParsedError): SimilarError[];

  // Generate fix suggestion
  suggestFix(error: ParsedError, context: CodeContext): FixSuggestion;

  // Apply fix and record outcome
  applyFix(fix: FixSuggestion): Promise<FixResult>;
}

interface ParsedError {
  file: string;
  line: number;
  column: number;
  code: string;                 // e.g., "TS2307", "svelte(missing-declaration)"
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: string;             // Classified category
}

interface SimilarError {
  error: ParsedError;
  similarity: number;           // 0.0 - 1.0
  fix?: FixSuggestion;
  fixSuccess?: boolean;
  fixConfidence: number;
}

interface FixSuggestion {
  id: string;
  description: string;
  changes: FileChange[];
  confidence: number;
  source: 'history' | 'llm' | 'rule';
  reasoning: string;
}

interface FileChange {
  file: string;
  type: 'insert' | 'replace' | 'delete';
  startLine: number;
  endLine: number;
  newContent: string;
}

interface FixResult {
  success: boolean;
  errorsRemaining: number;
  newErrors: ParsedError[];
  rollbackAvailable: boolean;
}
```

### 12. ContextualEngineeringService

Prevents repeated errors through learning and proactive warnings.

```typescript
interface ContextualEngineeringService {
  // Record successful fix for learning
  recordFix(error: ParsedError, fix: FixSuggestion, success: boolean): Promise<void>;

  // Check new code for known error patterns
  checkForPatterns(code: string, filePath: string): PatternWarning[];

  // Build context for LLM prompts
  buildContext(query: string, options?: ContextOptions): PromptContext;

  // Escalate recurring errors to human
  escalateIfNeeded(error: ParsedError): EscalationResult | null;
}

interface PatternWarning {
  pattern: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  suggestedFix?: string;
  historicalOccurrences: number;
}

interface PromptContext {
  relevantDocs: SearchResult[];
  errorHistory: SimilarError[];
  codeContext: CodeSnippet[];
  successfulFixes: FixSuggestion[];
  totalTokens: number;
}

interface EscalationResult {
  reason: string;
  errorCount: number;
  aggregatedContext: string;
  suggestedActions: string[];
}
```

### 13. ProductionValidator

Validates app readiness for production deployment.

```typescript
interface ProductionValidator {
  // Run all validation checks
  validate(): Promise<ValidationReport>;

  // Run specific check
  runCheck(checkName: string): Promise<CheckResult>;

  // Generate deployment readiness report
  generateReport(): Promise<DeploymentReport>;

  // Create codebase checkpoint
  createCheckpoint(): Promise<CheckpointResult>;
}

interface ValidationReport {
  passed: boolean;
  checks: CheckResult[];
  blockingErrors: ParsedError[];
  warnings: ParsedError[];
  score: number;                // 0-100 confidence score
}

interface CheckResult {
  name: string;
  passed: boolean;
  duration: number;
  errors: ParsedError[];
  warnings: ParsedError[];
}

interface DeploymentReport {
  ready: boolean;
  confidence: number;
  blockers: string[];
  recommendations: string[];
  checksRun: string[];
  timestamp: Date;
}

interface CheckpointResult {
  id: string;
  minioKey: string;
  files: number;
  size: number;
  createdAt: Date;
}

// Validation checks to run
const PRODUCTION_CHECKS = [
  'svelte-check',               // Zero Svelte errors
  'tsc',                        // Zero TypeScript errors
  'eslint',                     // Linting passes
  'vitest',                     // Tests pass
  'build',                      // Production build succeeds
  'routes',                     // No orphaned routes
  'imports',                    // No circular dependencies
];
```

## Data Models

### Qdrant Point Schema

```json
{
  "id": 1766236613282,
  "vector": [0.123, -0.456, ...],  // 768 dimensions
  "payload": {
    "url": "https://svelte.dev/docs/svelte/runes",
    "title": "Runes • Svelte Docs",
    "summary": "Svelte 5 introduces runes...",
    "entities": "Technologies: Svelte, JavaScript...",
    "tags": ["svelte", "svelte-5", "runes", "reactivity"],
    "source": "crawler",
    "scrapedAt": "2025-12-20T13:15:49.686Z",
    "contentLength": 31155,
    "format": "markdown",
    "minioKey": "phase76_knowledge_base/abc123.md",
    "tfIdfVector": {"svelte": 0.85, "runes": 0.72, ...}
  }
}
```

### PostgreSQL Schema

```sql
CREATE TABLE knowledge_documents (
  id SERIAL PRIMARY KEY,
  qdrant_id BIGINT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  entities JSONB,
  tags TEXT[],
  source TEXT DEFAULT 'crawler',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  content_length INTEGER,
  minio_key TEXT,
  embedding vector(768),
  tfidf_vector JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_embedding ON knowledge_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_knowledge_tags ON knowledge_documents USING GIN (tags);
CREATE INDEX idx_knowledge_url_hash ON knowledge_documents (url_hash);
```

### MinIO Object Structure

```
knowledge-docs/
├── phase76_knowledge_base/
│   ├── abc123.md           # Full document content
│   ├── def456.md
│   └── ghi789.md
└── metadata/
    └── collection-stats.json
```

### Redis Cache Keys

```
kb:search:{sha256(query)}     # Search results (TTL: 1hr)
kb:doc:{id}                   # Document content (TTL: 24hr)
kb:stats                      # Collection stats (TTL: 5min)
kb:idf:{term}                 # IDF values (TTL: 1hr)
codebase:index:state          # Index state (TTL: none)
codebase:file:{hash}          # Indexed file cache (TTL: 24hr)
hmm:transition:{pattern}      # Transition matrix cache (TTL: 1hr)
errors:similar:{hash}         # Similar error cache (TTL: 1hr)
fixes:history:{error_code}    # Fix history by error code (TTL: 24hr)
```

### Codebase Index Schema (Qdrant)

```json
{
  "collection": "codebase_index",
  "id": 1766300000001,
  "vector": [0.123, -0.456, ...],  // 768 dimensions
  "payload": {
    "path": "src/lib/services/auth.ts",
    "hash": "sha256:abc123...",
    "summary": "Authentication service with Lucia integration...",
    "type": "service",
    "imports": ["$lib/db", "lucia", "@lucia-auth/adapter-drizzle"],
    "exports": ["authStore", "login", "logout", "getSession"],
    "functions": ["login", "logout", "validateSession", "createSession"],
    "classes": [],
    "dependencies": ["src/lib/db/index.ts", "src/lib/stores/user.ts"],
    "lineCount": 245,
    "indexedAt": "2025-12-20T15:30:00.000Z"
  }
}
```

### Error Patterns Schema (Qdrant)

```json
{
  "collection": "error_patterns",
  "id": 1766300000002,
  "vector": [0.234, -0.567, ...],  // 768 dimensions (error message embedding)
  "payload": {
    "code": "TS2307",
    "message": "Cannot find module '$lib/components/Button'",
    "file": "src/routes/+page.svelte",
    "line": 5,
    "category": "import-error",
    "occurrences": 3,
    "fixes": [
      {
        "id": "fix-001",
        "description": "Create Button.svelte component",
        "success": true,
        "confidence": 0.92
      }
    ],
    "firstSeen": "2025-12-19T10:00:00.000Z",
    "lastSeen": "2025-12-20T14:00:00.000Z"
  }
}
```

### Neo4j Graph Schema (Code Relationships)

```cypher
// Node types
(:SourceFile {path, hash, type, summary})
(:Function {name, file, isAsync, isExported})
(:Class {name, file, isExported})
(:Type {name, file, kind})
(:Error {code, message, category})
(:Fix {id, description, confidence})

// Relationship types
(:SourceFile)-[:IMPORTS {namedImports, isTypeOnly}]->(:SourceFile)
(:Function)-[:CALLS]->(:Function)
(:Class)-[:EXTENDS]->(:Class)
(:Class)-[:IMPLEMENTS]->(:Type)
(:Error)-[:OCCURS_IN]->(:SourceFile)
(:Error)-[:FIXED_BY {success, timestamp}]->(:Fix)
(:Error)-[:SIMILAR_TO {similarity}]->(:Error)
```

### HMM Transition Matrix Storage (Redis)

```json
{
  "key": "hmm:transition:sveltekit_routes",
  "states": ["+page.svelte", "+page.ts", "+page.server.ts", "+layout.svelte", "+layout.ts", "+layout.server.ts", "+server.ts"],
  "matrix": [
    [0.1, 0.3, 0.2, 0.2, 0.1, 0.05, 0.05],
    [0.4, 0.1, 0.2, 0.1, 0.1, 0.05, 0.05],
    ...
  ],
  "initial": [0.3, 0.15, 0.15, 0.2, 0.1, 0.05, 0.05],
  "updatedAt": "2025-12-20T15:00:00.000Z"
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Embedding Dimension Consistency
*For any* document indexed, the generated embedding SHALL have exactly 768 dimensions matching the embeddinggemma:latest model output.
**Validates: Requirements 1.1, 4.4**

### Property 2: Search Results Ordering
*For any* search query returning multiple results, the results SHALL be sorted in descending order by combined score (0.7*semantic + 0.3*tfidf).
**Validates: Requirements 1.3, 3.3**

### Property 3: Search Result Schema Completeness
*For any* search result returned, the response SHALL contain all required fields: id, title, url, summary, and scores object with semantic, tfidf, and combined values.
**Validates: Requirements 1.4, 3.4**

### Property 4: Summary Generation and Storage Round-Trip
*For any* document indexed, storing the summary in Qdrant and MinIO then retrieving it SHALL return identical content.
**Validates: Requirements 2.3, 5.3**

### Property 5: TF-IDF Formula Correctness
*For any* term t in the collection, the IDF value SHALL equal log(N / df(t)) where N is total documents and df(t) is documents containing t.
**Validates: Requirements 3.2**

### Property 6: Hybrid Score Calculation
*For any* search result, the combined score SHALL equal exactly 0.7 * semantic_score + 0.3 * tfidf_score.
**Validates: Requirements 3.3**

### Property 7: Redis Cache Key Format
*For any* cached search query, the Redis key SHALL match the pattern kb:search:{sha256_hash} where hash is the SHA-256 of the query string.
**Validates: Requirements 6.2**

### Property 8: Cache Hit Behavior
*For any* repeated search query within TTL, the second request SHALL return cached results without making a Qdrant API call.
**Validates: Requirements 6.3**

### Property 9: MinIO Object Key Format
*For any* document stored in MinIO, the object key SHALL match the pattern {collection}/{url_hash}.md.
**Validates: Requirements 5.2**

### Property 10: Tag Extraction and Filtering
*For any* document with extracted entities, the tags array SHALL be populated and filtering by any tag SHALL return only documents containing that tag.
**Validates: Requirements 9.1, 9.3, 9.4**

### Property 11: API Response Schema Validation
*For any* POST /api/knowledge/search request with valid JSON body, the response SHALL contain results array with SearchResult schema.
**Validates: Requirements 8.1**

### Property 12: PostgreSQL-Qdrant Embedding Parity
*For any* document indexed in both stores, the embedding vector in PostgreSQL SHALL be identical to the vector in Qdrant.
**Validates: Requirements 4.4**

### Property 13: A2A Agent Registration
*For any* agent registration request with valid config, the A2A handler SHALL return a unique agent ID and store the agent in the registry.
**Validates: Requirements 7.1**

### Property 14: ACP Tool Schema Validation
*For any* ACP tool execution, the input SHALL be validated against the tool's inputSchema before execution.
**Validates: Requirements 7.2**

### Property 15: Web Search Result Indexing
*For any* web search with indexResults=true, all returned results SHALL be automatically indexed into Qdrant with valid embeddings.
**Validates: Requirements 2.1, 1.1**

### Property 16: LLM Synthesis Context Injection
*For any* search with synthesize=true, the LLM prompt SHALL include the top-K search results as context before the user query.
**Validates: Requirements 2.1**

### Property 17: A2A Task Delegation Round-Trip
*For any* delegated task to a registered agent, the response SHALL include the original correlationId and task result within the timeout period.
**Validates: Requirements 7.3**

### Property 18: HMM Route Pattern Parsing
*For any* "Cannot find module" error, the Route_Inference_Engine SHALL extract a valid RoutePattern with importPath and expectedFiles populated.
**Validates: Requirements 11.1**

### Property 19: Transition Matrix Probability Sum
*For any* row in the transition probability matrix, the sum of probabilities SHALL equal 1.0 (within floating point tolerance).
**Validates: Requirements 11.2**

### Property 20: Viterbi Inference Confidence
*For any* inferred missing file with confidence >= 0.8, the file path SHALL be a valid SvelteKit route file pattern (+page.svelte, +layout.svelte, +server.ts, etc.).
**Validates: Requirements 11.3, 11.5**

### Property 21: AST Import Extraction
*For any* TypeScript file with import statements, the Codebase_Indexer SHALL extract all imports with correct moduleSpecifier and namedImports.
**Validates: Requirements 12.1, 12.2**

### Property 22: Dependency Graph Acyclicity Detection
*For any* codebase with circular dependencies, the Codebase_Indexer SHALL detect and report all cycles in the dependency graph.
**Validates: Requirements 12.4**

### Property 23: Codebase Index Round-Trip
*For any* indexed source file, querying by file path SHALL return the same embedding, summary, and AST metadata that was stored.
**Validates: Requirements 13.1, 13.2, 13.3**

### Property 24: File Change Detection
*For any* modified source file, the Codebase_Indexer SHALL detect the change via content hash comparison and trigger re-indexing.
**Validates: Requirements 13.4**

### Property 25: Error Location AST Mapping
*For any* parsed TypeScript error with file, line, and column, the ErrorCodeCorrelator SHALL find the corresponding AST node or return null.
**Validates: Requirements 14.2**

### Property 26: Similar Error Retrieval
*For any* error with similarity >= 0.8 to a historical error, the retrieved similar error SHALL have the same error code.
**Validates: Requirements 14.3**

### Property 27: Fix Recording and Retrieval
*For any* recorded successful fix, querying for similar errors SHALL return that fix with confidence > 0.
**Validates: Requirements 15.1, 14.4**

### Property 28: Pattern Warning Consistency
*For any* code pattern that caused errors 3+ times, the ContextualEngineeringService SHALL generate a PatternWarning when that pattern appears in new code.
**Validates: Requirements 15.2, 15.4**

### Property 29: Production Validation Completeness
*For any* validation run, the ProductionValidator SHALL execute all checks in PRODUCTION_CHECKS and report results for each.
**Validates: Requirements 16.1, 16.2**

### Property 30: Checkpoint Creation and Retrieval
*For any* created checkpoint, the minioKey SHALL be valid and retrievable from MinIO with matching file count.
**Validates: Requirements 16.5**

## Error Handling

| Error Condition | Handling Strategy |
|-----------------|-------------------|
| Qdrant unavailable | Return 503 with retry-after header |
| PostgreSQL unavailable | Fallback to Qdrant-only search |
| MinIO unavailable | Return cached content from Redis, or summary only |
| Redis unavailable | Proceed without caching, log warning |
| Embedding generation fails | Retry 3x with exponential backoff, then fail |
| MCP timeout (>30s) | Return partial results with timeout flag |
| Rate limit exceeded | Return 429 with X-RateLimit-Reset header |

## Testing Strategy

### Unit Tests
- TfIdfRanker.computeTf() with various document lengths
- TfIdfRanker.computeIdf() with edge cases (term in all docs, term in no docs)
- Cache key generation with special characters
- Tag extraction from entities string

### Property-Based Tests (fast-check)
- **Property 1**: Generate random text, verify embedding is 768-dim array of floats
- **Property 2**: Generate random search results, verify sorted by combined score
- **Property 5**: Generate random term frequencies, verify IDF formula
- **Property 6**: Generate random scores, verify hybrid calculation
- **Property 7**: Generate random queries, verify cache key format
- **Property 9**: Generate random URLs, verify MinIO key format

### Integration Tests
- End-to-end indexing: crawl → process → store → search → retrieve
- Cache invalidation: index new doc → verify cache cleared
- Hybrid search: verify PostgreSQL and Qdrant return consistent results
- MCP tool: verify ACE agent can call knowledge-search tool

### Test Configuration
- Property tests: minimum 100 iterations per property
- Use fast-check library for TypeScript property-based testing
- Tag each property test with: `**Feature: knowledge-search-engine, Property {N}: {description}**`
