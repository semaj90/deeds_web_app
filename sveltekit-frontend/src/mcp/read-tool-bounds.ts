import { z } from 'zod';

/** Input ceilings for the read-only MCP surfaces covered by ORF-7. */
export const GRAPH_EXPAND_NEIGHBORHOOD_MAX_SEEDS = 8;
export const GRAPH_EXPAND_TEXT_MAX_CHARS = 512;
export const GRAPH_EXPAND_REF_MAX_CHARS = 1024;
export const GRAPH_ANALYSIS_PATH_MAX_CHARS = 1024;
export const GRAPH_ANALYSIS_MAX_HOPS = 3;
export const GRAPH_SHORTEST_PATH_MAX_HOPS = 10;
export const PACKET_SEARCH_FILTER_MAX_CHARS = 1024;
export const PACKET_SEARCH_TEXT_MAX_CHARS = 512;
export const MCP_READ_MAX_OUTPUT_BYTES = 128 * 1024;
export const GRAPH_EXPAND_NEO4J_TIMEOUT_MS = 5000;
export const PACKET_SEARCH_STATEMENT_TIMEOUT_MS = 2000;
export const PACKET_SEARCH_CLIENT_TIMEOUT_MS = 3000;
export const FEATURE_EVIDENCE_TUPLES_MAX = 16;
export const FEATURE_EVIDENCE_STATEMENT_TIMEOUT_MS = 2000;

export const featureEvidenceTuplesInputSchema = z.object({
  featureId: z.string().min(1).max(256),
  maxTuples: z.number().int().min(1).max(FEATURE_EVIDENCE_TUPLES_MAX).default(FEATURE_EVIDENCE_TUPLES_MAX),
});

export function serializeBoundedReadResult(payload: unknown): string {
  const serialized = JSON.stringify(payload, null, 2) ?? 'null';
  if (new TextEncoder().encode(serialized).byteLength <= MCP_READ_MAX_OUTPUT_BYTES) return serialized;
  return JSON.stringify({
    ok: false,
    error: 'MCP_READ_OUTPUT_LIMIT_EXCEEDED',
    maxOutputBytes: MCP_READ_MAX_OUTPUT_BYTES,
  });
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
  from: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS),
  to: z.string().min(1).max(GRAPH_ANALYSIS_PATH_MAX_CHARS),
  maxHops: z.number().int().min(1).max(GRAPH_SHORTEST_PATH_MAX_HOPS).default(6).optional(),
});

export const atlasPacketSearchInputSchema = z.object({
  source_ref: z.string().max(PACKET_SEARCH_FILTER_MAX_CHARS).optional().describe(
    'File path (any form: absolute, repo-relative, with/without sveltekit-frontend/ prefix). Variants are tried automatically.'
  ),
  feature_id: z.string().max(256).optional().describe('Exact feature_id to filter on.'),
  concept_id: z.string().max(256).optional().describe('Filter to packets whose concept_ids array contains this value.'),
  summary_query: z.string().max(PACKET_SEARCH_TEXT_MAX_CHARS).optional().describe('Bounded full-text search against packet summaries.'),
  limit: z.number().int().min(1).max(50).default(20).optional(),
});
