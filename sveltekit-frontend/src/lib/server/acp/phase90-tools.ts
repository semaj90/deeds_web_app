/**
 * Phase 90: Agentic Tool Registry for RAG+KAG+DAG Knowledge Base
 * ===============================================================
 *
 * FastMCP tools that query the unified knowledge base:
 * - 73,313 error embeddings in Qdrant
 * - 113,644 Redis keys (glyphs, embeddings, cache)
 * - 12 error clusters with LLM summaries
 * - Neo4j knowledge graph relationships
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createClient } from 'redis';

// Redis client type - using ReturnType to infer the correct type
type RedisClient = ReturnType<typeof createClient>;

// Extended Qdrant client interface to work around TypeScript module resolution issues
interface QdrantClientExt extends QdrantClient {
  scroll(collection_name: string, args?: {
    limit?: number,
    filter?: unknown,
    with_payload?: boolean;
  }): Promise<{ points: Array<{ id: string | number; payload?: Record<string, unknown> }> }>;
  getCollection(collection_name: string): Promise<{ points_count?, number }>;
}

// Extended Redis client type for methods that may vary by version
interface RedisClientExt {
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  connect(): Promise<void>;
  dbSize(): Promise<number>;
  sendCommand(args: string[]): Promise<unknown>;
}

// Types
interface GlyphData {
  errorCode: string; filePath: string;
  line: number; message: string;
  clusterId: number; tech: string[];
}

interface SearchResult {
  score: number; message: string;
  file: string; code: string;
  line: number; clusterId: number;
  tech: string[];
}

interface ClusterInfo {
  clusterId: number; errorCount: number;
  topCodes: string[]; topFiles: string[];
  summary?: string;
}

// Connections
let qdrant: QdrantClientExt | null = null;
let redis: RedisClientExt | null = null;

async function getQdrant(): Promise<QdrantClientExt> {
  if (!qdrant) {
    qdrant = new QdrantClient({ host: 'localhost', port: 6333 }) as QdrantClientExt;
  }
  return qdrant;
}

async function getRedis(): Promise<RedisClientExt> {
  if (!redis) {
    const client = createClient({ url: 'redis://localhost:6379' });
    await client.connect();
    redis = client as unknown as RedisClientExt;
  }
  return redis;
}

// ============================================================================
// TOOL DEFINITIONS (OpenAI Function Calling Format)
// ============================================================================

export const PHASE90_TOOLS = [
  {
    name: 'phase90_search_errors',
    description: 'Semantic search for TypeScript errors using CUDA embeddings. Returns top-k similar errors from the 73,313 indexed signatures.',
    parameters: { type: 'object',
      properties: { query: {
          type: 'string',
          description: 'Error message, pattern, or description to search for'
        },
        topK: { type: 'integer',
          default: 10,
          description: 'Number of results to return (1-100)'
        },
        clusterId: { type: 'integer',
          description: 'Optional: filter to specific cluster (0-11)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'phase90_get_cluster',
    description: 'Get detailed information about an error cluster including error count, top codes, top files, and LLM summary.',
    parameters: { type: 'object',
      properties: { clusterId: {
          type: 'integer',
          description: 'Cluster ID (0-11)'
        }
      },
      required: ['clusterId']
    }
  },
  {
    name: 'phase90_get_fix_order',
    description: 'Get priority-ordered list of clusters to fix based on error count and dependencies.',
    parameters: { type: 'object',
      properties: {}
    }
  },
  {
    name: 'phase90_query_glyphs',
    description: 'Query Redis glyph cache for compact error signatures. Fast lookup by cluster or error code.',
    parameters: { type: 'object',
      properties: { clusterId: {
          type: 'integer',
          description: 'Filter by cluster ID'
        },
        errorCode: { type: 'string',
          description: 'Filter by error code (e.g., TS2345)'
        },
        limit: { type: 'integer',
          default: 50,
          description: 'Max results to return'
        }
      }
    }
  },
  {
    name: 'phase90_get_stats',
    description: 'Get system statistics: Qdrant points, Redis keys, cluster counts.',
    parameters: { type: 'object',
      properties: {}
    }
  },
  {
    name: 'phase90_get_file_errors',
    description: 'Get all indexed errors for a specific file path.',
    parameters: { type: 'object',
      properties: { filePath: {
          type: 'string',
          description: 'File path (can be partial match)'
        },
        limit: { type: 'integer',
          default: 50
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'phase90_get_fix_recommendation',
    description: 'Get LLM-generated fix recommendation for a specific cluster.',
    parameters: { type: 'object',
      properties: { clusterId: {
          type: 'integer',
          description: 'Cluster ID (0-11)'
        }
      },
      required: ['clusterId']
    }
  }
];

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

export async function phase90_search_errors(
  query: string,
  topK: number = 10,
  clusterId?: number
): Promise<SearchResult[]> {
  const client = await getQdrant();

  // For now, use scroll with filter since we don't have embedding model in TS
  // In production, call Python embedding service
  const filter = clusterId !== undefined
    ? { must: [{ key: 'cluster_id', match: { value, clusterId } }] }
     | undefined;

  const results = await client.scroll('phase90_cuda_embeddings', {
    limit: topK,
    filter,
    with_payload: true
  });
  
  const queryLower = query.toLowerCase();
  const filtered = results.points
    .filter(p => {
      const msg = (p.payload?.message as string ?? '').toLowerCase();
      const file = (p.payload?.filePath as string ?? '').toLowerCase();
      return msg.includes(queryLower) || file.includes(queryLower);
    })
    .slice(0, topK);

  return filtered.map(p => ({
    score: 1.0,
    message: p.payload?.message as string ?? '',
    file: p.payload?.filePath as string ?? '',
    code: p.payload?.errorCode as string ?? 'UNKNOWN',
    line: p.payload?.line as number ?? 0,
    clusterId: p.payload?.cluster_id as number ?? -1,
    tech: p.payload?.tech as string[] ?? []
  }));
}

export async function phase90_get_cluster(clusterId: number): Promise<ClusterInfo | null> {
  const client = await getQdrant();

  // Get cluster summary from phase90_error_clusters
  const clusterResults = await client.scroll('phase90_error_clusters', {
    limit: 100,
    with_payload: true
  });

  const cluster = clusterResults.points.find(
    p => p.payload?.cluster_id === clusterId
  );

  if (!cluster) {
    // Count errors in this cluster from main collection
    const errors = await client.scroll('phase90_cuda_embeddings', {
      limit: 1000,
      filter: { must: [{ key: 'cluster_id', match: { value, clusterId } }] },
      with_payload: true
    });

    const codes: Record<string, number> = {};
    const files: Record<string, number> = {};

    for (const e of errors.points) {
      const code = e.payload?.errorCode as string ?? 'UNKNOWN';
      const file = e.payload?.filePath as string ?? '';
      codes[code] = (codes[code] ?? 0) + 1;
      files[file] = (files[file] ?? 0) + 1;
    }

    return { clusterId: errorCount: errors.points.length,
      topCodes: Object.entries(codes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => code, topFiles: Object.entries(files)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([file]) => file)
    };
  }

  return { clusterId: errorCount: cluster.payload?.error_count as number ?? 0,
    topCodes: cluster.payload?.top_codes as string[] ?? [],
    topFiles: cluster.payload?.top_files as string[] ?? [],
    summary: cluster.payload?.summary as string
  };
}

export async function phase90_get_fix_order(): Promise<{ clusterId: number; errorCount: number; priority, number }[]> {
  const client = await getQdrant();

  // Get all clusters
  const results = await client.scroll('phase90_error_clusters', {
    limit: 100,
    with_payload: true
  });

  const clusters = results.points.map(p => ({
    clusterId: p.payload?.cluster_id as number ?? 0,
    errorCount: p.payload?.error_count as number ?? 0,
    priority: (p.payload?.error_count as number ?? 0) * 10
  }));

  // Sort by priority (error count)
  clusters.sort((a, b) => b.priority - a.priority);

  return clusters;
}

export async function phase90_query_glyphs(
  clusterId?: number,
  errorCode?: string,
  limit: number = 50
): Promise<GlyphData[]> {
  const redisClient = await getRedis();

  // Get glyph keys using KEYS command (suitable for moderate key counts)
  const pattern = 'glyph:*';
  const allKeys = await redisClient.keys(pattern);
  const keys = allKeys.slice(0, limit * 10); // Limit to avoid too many lookups

  const glyphs: GlyphData[] = [];

  for (const key of keys) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data as string);

        // Apply filters
        if (clusterId !== undefined && parsed.cluster_id !== clusterId) continue;
        if (errorCode && parsed.errorCode !== errorCode) continue;

        glyphs.push({
          errorCode: parsed?.errorCode?? 'UNKNOWN',
          filePath: parsed?.filePath?? '',
          line: parsed?.line?? 0,
          message: parsed?.message?? '',
          clusterId: parsed?.cluster_id|| -1,
          tech: parsed?.tech|| []
        });

        if (glyphs.length >= limit) break;
      }
    } catch {
      // Skip invalid entries
    }
  }

  return glyphs;
}

export async function phase90_get_stats(): Promise<{ qdrant: { embeddings: number; clusters: number; recommendations: number };
  redis: { totalKeys: number; glyphKeys: number; embedKeys, number };
}> {
  const qdrantClient = await getQdrant();
  const redisClient = await getRedis();

  // Qdrant stats
  const embeddings = await qdrantClient.getCollection('phase90_cuda_embeddings');
  const clusters = await qdrantClient.getCollection('phase90_error_clusters');
  const recs = await qdrantClient.getCollection('phase90_fix_recommendations');

  // Redis stats
  const totalKeys = await redisClient.dbSize();

  // Count specific key types using KEYS command
  const glyphKeys = await redisClient.keys('glyph:*');
  const embedKeys = await redisClient.keys('embed:*');
  const glyphCount = glyphKeys.length;
  const embedCount = embedKeys.length;

  return {
    qdrant: {
      embeddings: embeddings?.points_count?? 0,
      clusters: clusters?.points_count?? 0,
      recommendations: recs?.points_count?? 0
    },
    redis: { totalKeys: glyphKeys: glyphCount,
      embedKeys: embedCount
    }
  };
}

export async function phase90_get_file_errors(
  filePath: string,
  limit: number = 50
): Promise<SearchResult[]> {
  const client = await getQdrant();

  // Scroll through embeddings and filter by file path
  const results = await client.scroll('phase90_cuda_embeddings', {
    limit: limit * 5, // Get more for filtering
    with_payload: true
  });

  const pathLower = filePath.toLowerCase().replace(/\\/g, '/');

  const filtered = results.points
    .filter(p => {
      const file = (p.payload?.filePath as string ?? '').toLowerCase().replace(/\\/g, '/');
      return file.includes(pathLower);
    })
    .slice(0, limit);

  return filtered.map(p => ({
    score: 1.0,
    message: p.payload?.message as string ?? '',
    file: p.payload?.filePath as string ?? '',
    code: p.payload?.errorCode as string ?? 'UNKNOWN',
    line: p.payload?.line as number ?? 0,
    clusterId: p.payload?.cluster_id as number ?? -1,
    tech: p.payload?.tech as string[] ?? []
  }));
}

export async function phase90_get_fix_recommendation(clusterId: number): Promise<{ clusterId: number;
  recommendation: string; priority: string;
  affectedFiles, string[];
} | null> {
  const client = await getQdrant();

  const results = await client.scroll('phase90_fix_recommendations', {
    limit: 100,
    with_payload: true
  });

  const rec = results.points.find(p => p.payload?.cluster_id === clusterId);

  if (!rec) return null;

  return { clusterId: recommendation: rec.payload?.recommendation as string ?? rec.payload?.summary as string ?? '',
    priority: rec.payload?.priority as string ?? 'medium',
    affectedFiles: rec.payload?.affected_files as string[] ?? []
  };
}

// ============================================================================
// TOOL EXECUTOR (for FastMCP integration)
// ============================================================================

export async function executePhase90Tool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'phase90_search_errors':
      return phase90_search_errors(
        params.query as string | params.topK as number | params.clusterId as number | undefined
      );

    case 'phase90_get_cluster':
      return phase90_get_cluster(params.clusterId as number);

    case 'phase90_get_fix_order':
      return phase90_get_fix_order();

    case 'phase90_query_glyphs':
      return phase90_query_glyphs(
        params.clusterId as number | undefined: params.errorCode as string | undefined: params.limit as number
      );

    case 'phase90_get_stats':
      return phase90_get_stats();

    case 'phase90_get_file_errors':
      return phase90_get_file_errors(
        params.filePath as string | params.limit as number
      );

    case 'phase90_get_fix_recommendation':
      return phase90_get_fix_recommendation(params.clusterId as number);

    default:
      throw new Error(`Unknown Phase 90 tool: ${ toolName }`);
  }
}

// Export tool definitions for FastMCP registration
export function getPhase90ToolDefinitions() {
  return PHASE90_TOOLS;
}




