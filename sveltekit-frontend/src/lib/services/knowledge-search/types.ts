/**
 * Knowledge Search Engine Types
 * Phase 76 - Knowledge Search with RAG+KAG Integration
 */

// ============================================================================
// Core Document Types
// ============================================================================

export interface CrawledDocument {
  url: string;
	title: string;
  content: string;
	scrapedAt: Date;
  source: 'crawler' | 'manual' | 'api';
}

export interface IndexResult {
  id: string;
	qdrantId: number;
  pgId: number;
	minioKey: string;
  summary: string;
	entities: string[];
  tags: string[];
	embedding: number[];
  tfIdfVector: Map<string, number>;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchOptions {
  topK?: number;
  threshold?: number;
  filters?: SearchFilters;
  includeContent?: boolean;
  useCache?: boolean;
  synthesize?: boolean;
  llmProvider?: 'ollama' | 'gemini' | 'claude';
}

export interface SearchFilters {
  tags?: string[];
  source?: string;
  dateRange?: {
	start: Date; end: Date };
  urlPattern?: string;
}

export interface SearchResult {
  id: string;
	title: string;
  url: string;
	summary: string;
  tags: string[];
	scores: {
    semantic: number;
	tfidf: number;
    combined: number;
  };
  snippet?: string;
  content?: string;
  synthesizedAnswer?: string;
}

// ============================================================================
// ACP Tool Types
// ============================================================================

export interface ACPTool {
  name: string;
	description: string;
  category: 'search' | 'database' | 'storage' | 'llm' | 'external' | 'code' | 'fix' | 'error-analysis';
  inputSchema: any;
	outputSchema: any;
  examples: ToolExample[];
	handler: (args: any, options?: { dryRun?: boolean }) => Promise<ToolResult>;
}

export interface ToolExample {
  input: any;
	output: any;
  description: string;
}

export interface ToolResult {
  success: boolean;
  kind?: 'result' | 'plan';
  data?: any;
  error?: string;
	duration: number;
}

export interface ToolPlanStep {
  action: string;
  target: string;
  detail?: string;
}

// ============================================================================
// Full Document Types
// ============================================================================

export interface FullDocument {
  id: string;
  title: string;
  url: string;
  content: string;
  summary: string;
  entities: string[];
  tags: string[];
  scrapedAt: Date;
  minioKey: string;
}

export interface CollectionStats {
  totalDocuments: number;
  indexedVectors: number;
  collections: {
    qdrant: { points: number; status: string };
    postgres: { rows: number };
    minio: { objects: number; size: string };
  };
  lastIndexed: string;
}

export interface SearchRequest {
  query: string;
  topK?: number;
  filters?: SearchFilters;
  includeContent?: boolean;
  synthesize?: boolean;
  llmProvider?: 'ollama' | 'gemini' | 'claude';
}

export interface ReindexStats {
  totalProcessed: number;
  successful: number;
  duration: number;
}
