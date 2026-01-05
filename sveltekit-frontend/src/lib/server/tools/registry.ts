/**
 * ACE Tool Registry
 *
 * JSON Schema-driven tool registration with:
 * - Runtime validation (Zod)
 * - TypeScript types
 * - Handler execution
 * - Permission management
 */

import { z } from 'zod';

// ============================================================================
// Generated Types from JSON Schemas
// ============================================================================

// scan_repo types
export const ScanRepoPatternSchema = z.object({
  pattern: z.string().min(1),
  type: z.enum(['regex', 'literal', 'glob']),
  name: z.string().optional(),
  category: z.enum(['error', 'todo', 'import', 'function', 'class', 'type']).optional()
});

export const ScanRepoRequestSchema = z.object({
  run_id: z.string().min(8),
  patterns: z.array(ScanRepoPatternSchema).min(1).max(50),
  paths: z.array(z.string()).min(1),
  excludes: z.array(z.string()).default(['node_modules', '.git', 'dist']),
  options: z.object({
    caseSensitive: z.boolean().default(false),
    maxResults: z.number().min(1).max(10000).default(1000),
    includeLineNumbers: z.boolean().default(true),
    includeContext: z.number().min(0).max(10).default(2)
  }).optional()
});

export type ScanRepoRequest = z.infer<typeof ScanRepoRequestSchema>;

// langextract_batch types
export const LangExtractDocSchema = z.object({
  url: z.string().url(),
  text_ref: z.string().min(8),
  title: z.string().optional(),
  source: z.enum(['minio', 'postgres', 'qdrant', 'file']).optional()
});

export const LangExtractBatchRequestSchema = z.object({
  run_id: z.string().min(8),
  docs: z.array(LangExtractDocSchema).min(1).max(200),
  schema: z.object({
    entities: z.array(z.enum(['library', 'function', 'class', 'component', 'prop', 'event', 'error', 'type', 'interface'])),
    relations: z.array(z.enum(['imports', 'extends', 'depends_on', 'deprecated_by', 'introduced_in', 'exports', 'implements']))
  }),
  options: z.object({
    model: z.string().default('gemma3-legal:latest'),
    temperature: z.number().min(0).max(2).default(0.1),
    timeout_ms: z.number().min(1000).max(300000).default(30000)
  }).optional()
});

export type LangExtractBatchRequest = z.infer<typeof LangExtractBatchRequestSchema>;

// cluster_tag types
export const ClusterTagRequestSchema = z.object({
  run_id: z.string().min(8),
  collection: z.string().min(1),
  dimensions: z.number().min(8).max(4096).default(768),
  algorithm: z.enum(['dbscan', 'hdbscan', 'kmeans', 'som']).default('hdbscan'),
  options: z.object({
    min_cluster_size: z.number().min(2).default(5),
    eps: z.number().min(0.01).max(10).default(0.3),
    n_clusters: z.number().min(2).max(1000).optional(),
    use_gpu: z.boolean().default(true),
    batch_size: z.number().min(100).max(50000).default(10000)
  }).optional(),
  tag_config: z.object({
    generate_summaries: z.boolean().default(true),
    model: z.string().default('gemma3-legal:latest'),
    update_qdrant: z.boolean().default(true)
  }).optional()
});

export type ClusterTagRequest = z.infer<typeof ClusterTagRequestSchema>;

// kb_search types
export const KBSearchRequestSchema = z.object({
  run_id: z.string().min(8),
  query: z.string().min(1).max(10000),
  embedding: z.array(z.number()).min(8).max(4096).optional(),
  collections: z.array(z.string()).default(['ace_errors', 'legal_docs']),
  filters: z.object({
    document_type: z.array(z.string()).optional(),
    jurisdiction: z.string().optional(),
    date_range: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional()
    }).optional(),
    tags: z.array(z.string()).optional()
  }).optional(),
  options: z.object({
    limit: z.number().min(1).max(100).default(10),
    threshold: z.number().min(0).max(1).default(0.5),
    include_vectors: z.boolean().default(false),
    rerank: z.boolean().default(true),
    hybrid: z.boolean().default(true)
  }).optional()
});

export type KBSearchRequest = z.infer<typeof KBSearchRequestSchema>;

// chunk_embed types
export const ChunkEmbedDocSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().optional()
});

export const ChunkEmbedRequestSchema = z.object({
  run_id: z.string().min(8),
  documents: z.array(ChunkEmbedDocSchema).min(1).max(1000),
  chunking: z.object({
    strategy: z.enum(['fixed', 'semantic', 'recursive', 'sentence']).default('recursive'),
    chunk_size: z.number().min(50).max(8000).default(512),
    overlap: z.number().min(0).max(500).default(50),
    separators: z.array(z.string()).optional()
  }).optional(),
  embedding: z.object({
    model: z.string().default('embeddinggemma:latest'),
    dimensions: z.number().min(8).max(4096).default(768),
    batch_size: z.number().min(1).max(100).default(32),
    normalize: z.boolean().default(true)
  }).optional(),
  storage: z.object({
    collection: z.string().default('embeddings'),
    upsert: z.boolean().default(true),
    include_metadata: z.boolean().default(true)
  }).optional()
});

export type ChunkEmbedRequest = z.infer<typeof ChunkEmbedRequestSchema>;

// crawl_docs types
export const CrawlUrlSchema = z.object({
  url: z.string().url(),
  depth: z.number().min(0).max(5).default(1),
  follow_links: z.boolean().default(false),
  priority: z.number().min(1).max(10).default(5)
});

export const CrawlDocsRequestSchema = z.object({
  run_id: z.string().min(8),
  urls: z.array(CrawlUrlSchema).min(1).max(500),
  parsing: z.object({
    extract_code: z.boolean().default(true),
    extract_tables: z.boolean().default(true),
    extract_images: z.boolean().default(false),
    clean_html: z.boolean().default(true),
    selectors: z.object({
      content: z.string().optional(),
      exclude: z.array(z.string()).optional()
    }).optional()
  }).optional(),
  options: z.object({
    timeout_ms: z.number().min(1000).max(60000).default(10000),
    max_concurrent: z.number().min(1).max(20).default(5),
    user_agent: z.string().optional(),
    respect_robots: z.boolean().default(true),
    cache_ttl_hours: z.number().min(0).max(720).default(24)
  }).optional(),
  storage: z.object({
    store_raw: z.boolean().default(false),
    store_parsed: z.boolean().default(true),
    minio_bucket: z.string().default('crawled-docs')
  }).optional()
});

export type CrawlDocsRequest = z.infer<typeof CrawlDocsRequestSchema>;

// ============================================================================
// Tool Result Types
// ============================================================================

export interface ToolResult<T = unknown> {
  success: boolean;
  run_id: string;
  tool: string;
  data?: T;
  error?: string;
  duration_ms: number;
  timestamp: string;
}

export interface ScanRepoResult {
  matches: Array<{
    file: string;
    line: number;
    column?: number;
    content: string;
    pattern_name?: string;
    context?: string[];
  }>;
  total_matches: number;
  files_scanned: number;
}

export interface LangExtractResult {
  extractions: Array<{
    doc_url: string;
    entities: Array<{ type: string; name: string; confidence: number }>;
    relations: Array<{ type: string; source: string; target: string; confidence: number }>;
  }>;
  total_entities: number;
  total_relations: number;
}

export interface ClusterTagResult {
  clusters: Array<{
    id: number;
    size: number;
    centroid_id: string;
    summary?: string;
    tags: string[];
  }>;
  total_clusters: number;
  noise_points: number;
}

export interface KBSearchResult {
  results: Array<{
    id: string;
    score: number;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  total_results: number;
}

// ============================================================================
// Tool Registry
// ============================================================================

export type ToolPermission = 'read_files' | 'write_files' | 'network' | 'gpu' | 'database';

export interface ToolDefinition<TRequest, TResult> {
  name: string;
  description: string;
  schema: z.ZodSchema<TRequest>;
  permissions: ToolPermission[];
  handler: (request: TRequest) => Promise<ToolResult<TResult>>;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition<any, any>>();

  register<TRequest, TResult>(tool: ToolDefinition<TRequest, TResult>): void {
    this.tools.set(tool.name, tool);
    console.log(`✅ Registered tool: ${tool.name}`);
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute<TRequest, TResult>(
    name: string,
    rawArgs: unknown
  ): Promise<ToolResult<TResult>> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        run_id: '',
        tool: name,
        error: `Tool '${name}' not found. Available: ${this.list().join(', ')}`,
        duration_ms: 0,
        timestamp: new Date().toISOString()
      };
    }

    const startTime = Date.now();

    // Validate request
    const parseResult = tool.schema.safeParse(rawArgs);
    if (!parseResult.success) {
      return {
        success: false,
        run_id: (rawArgs as any)?.run_id || '',
        tool: name,
        error: `Validation failed: ${parseResult.error.message}`,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }

    try {
      const result = await tool.handler(parseResult.data);
      return {
        ...result,
        duration_ms: Date.now() - startTime
      };
    } catch (err) {
      return {
        success: false,
        run_id: parseResult.data.run_id,
        tool: name,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  getSchema(name: string): z.ZodSchema | undefined {
    return this.tools.get(name)?.schema;
  }

  getPermissions(name: string): ToolPermission[] {
    return this.tools.get(name)?.permissions || [];
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

// ============================================================================
// Export for FastMCP integration
// ============================================================================

export function getToolDefinitions(): Array<{
  name: string;
  description: string;
  permissions: ToolPermission[];
}> {
  return toolRegistry.list().map(name => {
    const tool = toolRegistry.get(name)!;
    return {
      name: tool.name,
      description: tool.description,
      permissions: tool.permissions
    };
  });
}
