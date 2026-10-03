import { z } from 'zod';

const utf8Encoder = new TextEncoder();

/** Input ceilings for the read-only MCP surfaces covered by ORF-7. */
export const GRAPH_EXPAND_NEIGHBORHOOD_MAX_SEEDS = 8;
export const GRAPH_EXPAND_TEXT_MAX_CHARS = 512;
export const GRAPH_EXPAND_REF_MAX_CHARS = 1024;
export const GRAPH_ANALYSIS_PATH_MAX_CHARS = 1024;
export const GRAPH_ANALYSIS_MAX_HOPS = 3;
export const GRAPH_SHORTEST_PATH_MAX_HOPS = 10;
export const PACKET_SEARCH_FILTER_MAX_CHARS = 1024;
export const PACKET_SEARCH_TEXT_MAX_CHARS = 512;
export const PACKET_DENSE_VECTOR_DIMENSIONS = 768;
export const PACKET_DENSE_MAX_TAGS = 64;
export const PACKET_DENSE_TAG_MAX_CHARS = 128;
export const PACKET_DENSE_FILTER_MAX_CHARS = 1024;
export const MCP_READ_MAX_OUTPUT_BYTES = 128 * 1024;
export const MCP_UPSTREAM_JSON_MAX_BYTES = 256 * 1024;
export const MCP_UPSTREAM_READ_TIMEOUT_MS = 5_000;
export const GRAPH_EXPAND_NEO4J_TIMEOUT_MS = 5000;
export const GRAPH_EXPAND_ERROR_MAX_CHARS = 500;
export const PACKET_SEARCH_STATEMENT_TIMEOUT_MS = 2000;
export const PACKET_SEARCH_CLIENT_TIMEOUT_MS = 3000;
export const ATLAS_COVERAGE_STATEMENT_TIMEOUT_MS = 2500;
export const ATLAS_GRAPH_PAGERANK_MAX_OFFSET = 100_000;
export const GRAPH_PAGERANK_NODE_TYPE_MAX_CHARS = 64;
export const FEATURE_EVIDENCE_TUPLES_MAX = 16;
export const FEATURE_EVIDENCE_STATEMENT_TIMEOUT_MS = 2000;
export const FEATURE_DOCUMENT_ID_MAX_CHARS = 256;
export const FEATURE_DOCUMENT_READ_STATEMENT_TIMEOUT_MS = 2500;
export const FEATURE_DOCUMENT_MANIFEST_MAX_BYTES = 256 * 1024;
export const FEATURE_DOCUMENT_DIRECTORY_MAX_ENTRIES = 256;
export const ATLAS_CONTEXT_QUERY_MAX_CHARS = 512;
export const ATLAS_CONTEXT_PATH_MAX_CHARS = 1024;
export const ATLAS_CONTEXT_CHUNK_ID_MAX_CHARS = 256;
export const ATLAS_CONTEXT_SOURCE_REF_MAX_CHARS = 1024;
export const TRACE_SEARCH_QUERY_MAX_CHARS = 512;
export const TRACE_SEARCH_INTENT_MAX_ITEMS = 8;
export const TRACE_SEARCH_INTENT_MAX_CHARS = 64;
export const TURBOVEC_RANK_QUERY_MAX_CHARS = 512;
export const TURBOVEC_RANK_SOURCE_REF_MAX_CHARS = 512;
export const TURBOVEC_RANK_MAX_REFS = 200;
export const TURBOVEC_RANK_MAX_SCORE_MAP_ENTRIES = 200;
export const ENGRAM_MEMORY_USER_ID_MAX_CHARS = 256;
export const ENGRAM_MEMORY_SOURCE_REF_MAX_CHARS = 512;
export const ENGRAM_MEMORY_MAX_SOURCE_REFS = 32;
export const ENGRAM_MEMORY_STATEMENT_TIMEOUT_MS = 2500;
export const KNOWLEDGE_MAP_DIRECTORY_MAX_CHARS = 200;
export const KNOWLEDGE_MAP_MAX_EDGES = 20;
export const KNOWLEDGE_MAP_MAX_AGENTS = 10;
export const KNOWLEDGE_MAP_STATEMENT_TIMEOUT_MS = 2500;
export const HYPERGRAPH_SEARCH_QUERY_MAX_CHARS = 500;
export const HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_ITEMS = 12;
export const HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_CHARS = 64;
export const HYPERGRAPH_SEARCH_MAX_RESULTS = 50;
export const CLUSTER_MEMBERS_KEY_MAX_CHARS = 512;
export const CLUSTER_MEMBERS_MAX_LIMIT = 200;
export const CLUSTER_MEMBERS_STATEMENT_TIMEOUT_MS = 2500;
export const CODEBASE_RG_QUERY_MAX_CHARS = 512;
export const CODEBASE_RG_INCLUDE_MAX_CHARS = 256;
export const CODEBASE_RG_MAX_CONTEXT_LINES = 5;
export const CODEBASE_RG_MAX_OUTPUT_BYTES = 128 * 1024;
export const POSTGRES_FTS_QUERY_MAX_CHARS = 512;
export const POSTGRES_FTS_TOPO_CLASS_MAX_CHARS = 64;
export const POSTGRES_FTS_MAX_RESULTS = 50;
export const POSTGRES_FTS_STATEMENT_TIMEOUT_MS = 2500;
export const NOTECARD_SEARCH_QUERY_MAX_CHARS = 512;
export const NOTECARD_SEARCH_MAX_RESULTS = 20;
export const TRACE_EXPLAIN_QUERY_MAX_CHARS = 512;
export const TRACE_EXPLAIN_SCAN_MAX_PAGES = 10;
export const TRACE_EXPLAIN_SCAN_PAGE_SIZE = 50;
export const TRACE_EXPLAIN_MAX_SCANNED_KEYS = 500;
export const TRACE_EXPLAIN_MAX_KEYS = 20;
export const TRACE_EXPLAIN_MAX_VALUE_BYTES = 64 * 1024;
export const TRACE_EXPLAIN_COMMAND_TIMEOUT_MS = 2500;
export const TRACE_EXPLAIN_TOTAL_TIMEOUT_MS = 8000;

export const traceExplainRetrievalInputSchema = z.object({
  query: z.string().trim().min(1).max(TRACE_EXPLAIN_QUERY_MAX_CHARS),
});

/** SCAN order is unspecified; sort/dedupe the bounded sample before reads. */
export function selectTraceScanKeysV1(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort().slice(0, TRACE_EXPLAIN_MAX_KEYS);
}

export function traceValueMatchesQueryV1(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

export const traceSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(TRACE_SEARCH_QUERY_MAX_CHARS)
    .describe('Technical query or coding problem'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max results to return'),
  intent: z.array(z.string().trim().min(1).max(TRACE_SEARCH_INTENT_MAX_CHARS))
    .max(TRACE_SEARCH_INTENT_MAX_ITEMS).optional()
    .describe('Lenses: purpose, risk, api_surface, dependencies, retrieval_role'),
});

const boundedRankRecord = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.record(z.string().min(1).max(TURBOVEC_RANK_SOURCE_REF_MAX_CHARS), valueSchema)
    .refine((record) => Object.keys(record).length <= TURBOVEC_RANK_MAX_SCORE_MAP_ENTRIES);

export const turbovecRankChunksInputSchema = z.object({
  query: z.string().trim().min(1).max(TURBOVEC_RANK_QUERY_MAX_CHARS),
  sourceRefs: z.array(
    z.string().trim().min(1).max(TURBOVEC_RANK_SOURCE_REF_MAX_CHARS),
  ).min(1).max(TURBOVEC_RANK_MAX_REFS),
  limit: z.number().int().min(1).max(30).default(10).optional(),
  trustBuckets: boundedRankRecord(z.string().max(64)).optional(),
  trustTiers: boundedRankRecord(z.number()).optional(),
  recency: boundedRankRecord(z.number()).optional(),
  vectorScores: boundedRankRecord(z.number()).optional(),
  graphScores: boundedRankRecord(z.number()).optional(),
});

export const engramMemoryRecentInputSchema = z.object({
  userId: z.string().trim().min(1).max(ENGRAM_MEMORY_USER_ID_MAX_CHARS).optional(),
  sourceRefs: z.array(
    z.string().trim().min(1).max(ENGRAM_MEMORY_SOURCE_REF_MAX_CHARS),
  ).max(ENGRAM_MEMORY_MAX_SOURCE_REFS).optional(),
  limit: z.number().int().min(1).max(40).default(8).optional(),
});

export const knowledgeMinifiedMapInputSchema = z.object({
  directory: z.string().max(KNOWLEDGE_MAP_DIRECTORY_MAX_CHARS).optional(),
  max_edges: z.number().int().min(1).max(KNOWLEDGE_MAP_MAX_EDGES).optional(),
  max_agents: z.number().int().min(1).max(KNOWLEDGE_MAP_MAX_AGENTS).optional(),
});

export const hypergraphSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(HYPERGRAPH_SEARCH_QUERY_MAX_CHARS),
  edge_types: z.array(z.string().trim().min(1).max(HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_CHARS))
    .max(HYPERGRAPH_SEARCH_EDGE_TYPE_MAX_ITEMS).optional(),
  limit: z.number().int().min(1).max(HYPERGRAPH_SEARCH_MAX_RESULTS).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
});

export const clusterMembersInputSchema = z.object({
  clusterKey: z.string().trim().min(1).max(CLUSTER_MEMBERS_KEY_MAX_CHARS),
  limit: z.number().int().min(1).max(CLUSTER_MEMBERS_MAX_LIMIT).default(50),
});

export const codebaseRgSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(CODEBASE_RG_QUERY_MAX_CHARS),
  include: z.string().trim().min(1).max(CODEBASE_RG_INCLUDE_MAX_CHARS).optional(),
  contextLines: z.number().int().min(0).max(CODEBASE_RG_MAX_CONTEXT_LINES).default(2),
});

export const postgresFtsSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(POSTGRES_FTS_QUERY_MAX_CHARS),
  limit: z.number().int().min(1).max(POSTGRES_FTS_MAX_RESULTS).default(20),
  topo_class: z.string().trim().min(1).max(POSTGRES_FTS_TOPO_CLASS_MAX_CHARS).optional(),
});

export const notecardSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(NOTECARD_SEARCH_QUERY_MAX_CHARS),
  limit: z.number().int().min(1).max(NOTECARD_SEARCH_MAX_RESULTS).default(5),
});

export type CodebaseRgSearchInputV1 = z.output<typeof codebaseRgSearchInputSchema>;

export function buildCodebaseRgSearchArgsV1(input: CodebaseRgSearchInputV1): string[] {
  const args = ['--max-columns', '200', '--context', String(input.contextLines)];
  if (input.include !== undefined) args.push('--glob', input.include);
  args.push('--', input.query, '.');
  return args;
}

export function truncateUtf8TextV1(value: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8Encoder.encode(character).byteLength;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export const atlasContextInputSchema = z.object({
  query: z.string().trim().min(1).max(ATLAS_CONTEXT_QUERY_MAX_CHARS)
    .describe('What you are about to work on (code path, feature, question)'),
  path: z.string().trim().min(1).max(ATLAS_CONTEXT_PATH_MAX_CHARS).optional()
    .describe('Optional file or directory path to keep the packet local'),
  limit: z.number().int().min(1).max(10).default(4).describe('Max context items per lane'),
  activityLimit: z.number().int().min(1).max(100).default(24)
    .describe('How many recent activity log lines to inspect'),
  includeCommunity: z.boolean().default(true).describe('Include community graph context'),
  includeNotecards: z.boolean().default(true).describe('Include notecard search hits'),
  includeAgentsMd: z.boolean().default(true).describe('Include nearest AGENTS.md quick hits'),
});

export const atlasGetChunkInputSchema = atlasContextInputSchema.extend({
  chunkId: z.string().trim().min(1).max(ATLAS_CONTEXT_CHUNK_ID_MAX_CHARS).optional()
    .describe('Optional chunkId from atlas.compact_context.chunk_index'),
  chunkIndex: z.number().int().min(0).max(7).optional()
    .describe('Optional zero-based chunk index within the compact Atlas packet'),
  sourceRef: z.string().trim().min(1).max(ATLAS_CONTEXT_SOURCE_REF_MAX_CHARS).optional()
    .describe('Optional sourceRef to prioritize when selecting a chunk'),
});

export const featureDocumentReadInputSchema = z.object({
  featureId: z.string().trim().min(1).max(FEATURE_DOCUMENT_ID_MAX_CHARS),
});

export const featureEvidenceTuplesInputSchema = z.object({
  featureId: z.string().trim().min(1).max(FEATURE_DOCUMENT_ID_MAX_CHARS),
  maxTuples: z.number().int().min(1).max(FEATURE_EVIDENCE_TUPLES_MAX).default(FEATURE_EVIDENCE_TUPLES_MAX),
});

export function serializeBoundedReadResult(
  payload: unknown,
  replacer?: (key: string, value: unknown) => unknown,
): string {
  const serialized = JSON.stringify(payload, replacer, 2) ?? 'null';
  if (new TextEncoder().encode(serialized).byteLength <= MCP_READ_MAX_OUTPUT_BYTES) return serialized;
  return JSON.stringify({
    ok: false,
    error: 'MCP_READ_OUTPUT_LIMIT_EXCEEDED',
    maxOutputBytes: MCP_READ_MAX_OUTPUT_BYTES,
  });
}

export async function readBoundedJsonResponse(
  response: Response,
  maxBytes = MCP_UPSTREAM_JSON_MAX_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError('maxBytes must be a positive safe integer');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('MCP_UPSTREAM_RESPONSE_LIMIT_EXCEEDED');
  }

  const reader = response.body?.getReader();
  if (!reader) return JSON.parse(await response.text()) as unknown;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('MCP_UPSTREAM_RESPONSE_LIMIT_EXCEEDED');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function buildGraphNeighborhoodFailureV1(
  error: unknown,
  center: string,
  maxHops: 1 | 2,
): {
  ok: false;
  nodes: never[];
  edges: never[];
  sourceRefs: never[];
  confidence: 0;
  graphPaths: never[];
  maxHops: 1 | 2;
  center: string;
  seedEnvelope: null;
  graph: { nodes: never[]; edges: never[] };
  neighbors: never[];
  error: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    nodes: [],
    edges: [],
    sourceRefs: [],
    confidence: 0,
    graphPaths: [],
    maxHops,
    center,
    seedEnvelope: null,
    graph: { nodes: [], edges: [] },
    neighbors: [],
    error: message.slice(0, GRAPH_EXPAND_ERROR_MAX_CHARS),
  };
}

export const graphExpandNeighborhoodInputSchema = z.object({
  sourceRefs: z
    .array(z.string().max(GRAPH_EXPAND_REF_MAX_CHARS))
    .max(GRAPH_EXPAND_NEIGHBORHOOD_MAX_SEEDS)
    .optional()
    .describe('Up to eight primary source references (file paths or stable keys).'),
  stableKey: z.string().max(GRAPH_EXPAND_REF_MAX_CHARS).optional().describe('Legacy single center stable key.'),
  depth: z.number().int().min(1).max(3).default(2).optional().describe('Legacy hop depth (1–3).'),
  maxHops: z.number().int().min(1).max(2).optional().describe('Hop depth for sourceRefs flow (1–2).'),
  limit: z.number().int().min(1).max(100).default(40).describe('Max neighbors returned'),
  query: z.string().max(GRAPH_EXPAND_TEXT_MAX_CHARS).optional().describe('Optional bounded query label.'),
  route: z.string().max(GRAPH_EXPAND_TEXT_MAX_CHARS).optional().describe('Optional bounded route label.'),
  symbol: z.string().max(GRAPH_EXPAND_TEXT_MAX_CHARS).optional().describe('Optional bounded symbol label.'),
  filePath: z.string().max(GRAPH_EXPAND_REF_MAX_CHARS).optional().describe('Optional explicit file path.'),
});

export const graphAnalysisNeighborhoodInputSchema = z.object({
  path: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS),
  hops: z.number().int().min(1).max(GRAPH_ANALYSIS_MAX_HOPS).default(2).optional(),
  direction: z.enum(['both', 'imports', 'importedBy']).default('both').optional(),
  limit: z.number().int().min(1).max(100).default(30).optional(),
});

export const graphShortestPathInputSchema = z.object({
  fromKey: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS).describe('Source node stableKey'),
  toKey: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS).describe('Target node stableKey'),
  maxHops: z.number().int().min(1).max(GRAPH_SHORTEST_PATH_MAX_HOPS).default(6).describe('Maximum path length'),
});

export const atlasCoverageInputSchema = z.object({
  verbose: z.boolean().default(false),
});

export const atlasGraphPageRankInputSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).max(ATLAS_GRAPH_PAGERANK_MAX_OFFSET).default(0),
});

export const graphPageRankTopInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  nodeType: z.string().trim().min(1).max(GRAPH_PAGERANK_NODE_TYPE_MAX_CHARS)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
    .optional()
    .describe('Optional Neo4j label filter (identifier syntax only)'),
});

export const graphSemanticPathInputSchema = z.object({
  startKey: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS).describe('Source node stableKey'),
  endKey: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS).describe('Target node stableKey'),
  maxHops: z.number().int().min(1).max(GRAPH_SHORTEST_PATH_MAX_HOPS).default(6).describe('Maximum path length'),
});

export const graphCommunityForNodeInputSchema = z.object({
  stableKey: z.string().trim().min(1).max(GRAPH_EXPAND_REF_MAX_CHARS)
    .describe('Bounded node stableKey or file path to find community for'),
});

export const atlasPacketSearchInputSchema = z.object({
  source_ref: z.string().trim().min(1).max(PACKET_SEARCH_FILTER_MAX_CHARS).optional().describe(
    'File path (any form: absolute, repo-relative, with/without sveltekit-frontend/ prefix). Variants are tried automatically.'
  ),
  feature_id: z.string().trim().min(1).max(256).optional().describe('Exact feature_id to filter on.'),
  concept_id: z.string().trim().min(1).max(256).optional().describe('Filter to packets whose concept_ids array contains this value.'),
  summary_query: z.string().trim().min(1).max(PACKET_SEARCH_TEXT_MAX_CHARS).optional().describe('Bounded full-text search against packet summaries.'),
  limit: z.number().int().min(1).max(50).default(20).optional(),
}).refine(
  (filters) => filters.source_ref !== undefined
    || filters.feature_id !== undefined
    || filters.concept_id !== undefined
    || filters.summary_query !== undefined,
  { message: 'At least one non-empty packet search filter is required.' },
);

export const atlasPacketDenseSearchInputSchema = z.object({
  feature_id: z.string().trim().min(1).max(PACKET_DENSE_FILTER_MAX_CHARS).optional(),
  source_ref: z.string().trim().min(1).max(PACKET_DENSE_FILTER_MAX_CHARS).optional(),
  concept_id: z.string().trim().min(1).max(PACKET_DENSE_FILTER_MAX_CHARS).optional(),
  tags: z.array(z.string().trim().min(1).max(PACKET_DENSE_TAG_MAX_CHARS)).min(1).max(PACKET_DENSE_MAX_TAGS).optional(),
  domain_class: z.string().trim().min(1).max(PACKET_DENSE_FILTER_MAX_CHARS).optional(),
  workspace_revision: z.string().trim().min(1).max(PACKET_DENSE_FILTER_MAX_CHARS).optional(),
  collection: z.enum(['codebase_chunks_768', 'codebase_chunks_768_v2']),
  query_text: z.string().trim().min(1).max(PACKET_SEARCH_TEXT_MAX_CHARS).optional(),
  query_vector: z.array(z.number().finite()).length(PACKET_DENSE_VECTOR_DIMENSIONS).optional(),
  candidate_cap: z.number().int().min(1).max(2000).default(500).optional(),
  dense_limit: z.number().int().min(1).max(50).default(10).optional(),
  score_threshold: z.number().finite().min(0).max(1).optional(),
  expand_top_k: z.number().int().min(0).max(50).default(10).optional(),
}).superRefine((input, context) => {
  if (input.feature_id === undefined
    && input.source_ref === undefined
    && input.concept_id === undefined
    && input.tags === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one selective packet filter is required.',
      path: ['feature_id'],
    });
  }
  if ((input.query_text === undefined) === (input.query_vector === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of query_text or query_vector.',
      path: ['query_text'],
    });
  }
});
