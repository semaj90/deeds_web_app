/**
 * ACP Tool Contracts — Formal OpenAI-compatible tool definitions
 *
 * These schemas define the contract between:
 *   - Gemma4 (tool caller)
 *   - LangGraph nodes (tool executor)
 *   - Postgres/Qdrant/Neo4j (truth sources)
 *
 * Strict validation ensures:
 *   - Tool params match caller capabilities
 *   - Return types are correctly structured
 *   - Trace IDs flow through the entire chain
 *   - Packet identity (source_ref, feature_id, packet_key) is preserved
 */

import { z } from 'zod';

/**
 * Base packet identity schema (used in all tools)
 * Ensures Postgres join keys are always present
 */
const PacketIdentity = z.object({
  packet_key: z.string().describe('Unique packet identifier (primary key)'),
  source_ref: z.string().describe('Canonical source file reference'),
  feature_id: z.string().describe('Feature identifier for grouping'),
});

/**
 * ACP Tool 1: acp.packet.validate_truth
 *
 * Purpose: Validate packet metadata before writing to Postgres
 * Caller: LangGraph writeTraceEvent node
 * Returns: Valid/Invalid with reason
 *
 * Contract:
 *   - Input: packet_key + source_ref + feature_id (identity triple)
 *   - Validates: packet exists in Postgres, identity is consistent
 *   - Output: validation result + confidence score
 */
export const ValidateTruthToolParams = z.object({
  trace_id: z.string().describe('Distributed trace ID for correlation'),
  packet_key: z.string().describe('Packet identifier to validate'),
  source_ref: z.string().describe('Source file reference'),
  feature_id: z.string().describe('Feature ID'),
  packet_metadata: z.record(z.unknown()).optional().describe('Optional cached metadata for comparison'),
});

export type ValidateTruthParams = z.infer<typeof ValidateTruthToolParams>;

export const ValidateTruthToolResult = z.object({
  trace_id: z.string().describe('Echoed trace ID for correlation'),
  valid: z.boolean().describe('Is packet identity consistent and complete'),
  reason: z.string().describe('Validation reason (success or failure detail)'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  postgres_row_exists: z.boolean().describe('Does packet exist in Postgres'),
  identity_matches: z.boolean().describe('Do all identity fields match'),
});

export type ValidateTruthResult = z.infer<typeof ValidateTruthToolResult>;

/**
 * ACP Tool 2: acp.retrieval.hybrid_search
 *
 * Purpose: Execute hybrid retrieval (RAG + KAG + cache checks)
 * Caller: LangGraph hybridRetrieval node
 * Returns: Ranked candidate packets with scores
 *
 * Contract:
 *   - Input: query + packet_key (optional anchor) + limit
 *   - Executes: Qdrant vector search + Neo4j topology + Redis cache check
 *   - Output: packet_keys + source_refs + scores (no full documents, just references)
 */
export const HybridSearchToolParams = z.object({
  trace_id: z.string().describe('Distributed trace ID'),
  query: z.string().describe('Search query or embedding probe'),
  packet_key: z.string().optional().describe('Optional anchor packet for topology search'),
  limit: z.number().int().min(1).max(200).default(40).describe('Max candidates to return'),
  strategy: z.enum(['rag', 'kag', 'hybrid']).default('hybrid').describe('Retrieval strategy'),
  cache_ttl: z.number().int().default(300).describe('Cache time-to-live in seconds'),
});

export type HybridSearchParams = z.infer<typeof HybridSearchToolParams>;

export const HybridSearchToolResult = z.object({
  trace_id: z.string().describe('Echoed trace ID for correlation'),
  candidates: z.array(z.object({
    packet_key: z.string().describe('Packet identifier'),
    source_ref: z.string().describe('Source file reference'),
    feature_id: z.string().describe('Feature ID'),
    score: z.number().describe('Relevance score 0-1'),
    strategy: z.enum(['rag_qdrant', 'kag_topology', 'cache_hit']).describe('Which strategy scored this'),
  })).describe('Ranked candidate packets'),
  total_candidates: z.number().int().describe('Total candidates evaluated'),
  cache_hit: z.boolean().describe('Was result from cache'),
  execution_time_ms: z.number().describe('Query execution time'),
});

export type HybridSearchResult = z.infer<typeof HybridSearchToolResult>;

/**
 * ACP Tool 3: acp.schema_match.prewrite
 *
 * Purpose: Validate LLM synthesis output before writing to Postgres
 * Caller: LangGraph gemma4Synthesis → packet validation
 * Returns: Valid/Invalid with blocking reasons
 *
 * Contract:
 *   - Input: SQL/DDL/UPDATE text from Gemma4 output
 *   - Validates: No placeholder terms, schema exists, safe write pattern
 *   - Output: validation result with any blocking issues
 *   - BLOCKS on: unknown tables, fake_ patterns, ??, TBD, unsafe Redis-only writes
 */
export const SchemaMatchToolParams = z.object({
  trace_id: z.string().describe('Distributed trace ID'),
  text: z.string().describe('SQL or DDL text to validate'),
  packet_key: z.string().optional().describe('Packet being written'),
  source_ref: z.string().optional().describe('Source reference'),
  feature_id: z.string().optional().describe('Feature identifier'),
});

export type SchemaMatchParams = z.infer<typeof SchemaMatchToolParams>;

export const SchemaMatchToolResult = z.object({
  trace_id: z.string().describe('Echoed trace ID'),
  valid: z.boolean().describe('Is write safe and schema-compliant'),
  blocked_terms: z.array(z.string()).describe('Placeholder terms detected'),
  missing_identity: z.array(z.string()).describe('Missing identity fields'),
  schema_violations: z.array(z.string()).describe('Unknown tables/functions'),
  unsafe_operations: z.array(z.string()).describe('Unsafe write patterns'),
  report: z.string().describe('Human-readable validation report'),
});

export type SchemaMatchResult = z.infer<typeof SchemaMatchToolResult>;

/**
 * ACP Tool 4: acp.packet.write_trace_event
 *
 * Purpose: Write validated trace event to Postgres (canonical truth)
 * Caller: LangGraph writeTraceEvent node (final step)
 * Returns: Write confirmation + cache invalidation keys
 *
 * Contract:
 *   - Input: trace_id + packet identity + event data
 *   - Executes: Postgres INSERT/UPDATE → Redis cache invalidation → NATS emit
 *   - Output: write confirmation + cache keys for invalidation
 *   - FAILS: Postgres error blocks Redis/NATS (never cache-only writes)
 */
export const WriteTraceEventToolParams = z.object({
  trace_id: z.string().describe('Distributed trace ID'),
  packet_key: z.string().describe('Packet identifier'),
  source_ref: z.string().describe('Source file reference'),
  feature_id: z.string().describe('Feature ID'),
  event_type: z.enum(['trace_checkpoint', 'packet_updated', 'retrieval_complete']).describe('Event classification'),
  event_data: z.record(z.unknown()).describe('Event payload (schema varies by event_type)'),
  ttl_seconds: z.number().int().default(3600).describe('Cache invalidation TTL'),
});

export type WriteTraceEventParams = z.infer<typeof WriteTraceEventToolParams>;

export const WriteTraceEventToolResult = z.object({
  trace_id: z.string().describe('Echoed trace ID'),
  success: z.boolean().describe('Did write succeed'),
  postgres_row_id: z.string().optional().describe('Inserted row ID (on success)'),
  cache_keys_invalidated: z.array(z.string()).describe('Redis keys that were purged'),
  nats_subjects_published: z.array(z.string()).describe('NATS subjects that emitted'),
  error: z.string().optional().describe('Error message (on failure)'),
});

export type WriteTraceEventResult = z.infer<typeof WriteTraceEventToolResult>;

/**
 * Tool Registry — map tool names to their contracts
 */
export const ACP_TOOLS = {
  'acp.packet.validate_truth': {
    name: 'acp.packet.validate_truth',
    description: 'Validate packet metadata consistency before writing to Postgres (canonical truth)',
    parameters: ValidateTruthToolParams,
    returns: ValidateTruthToolResult,
  },
  'acp.retrieval.hybrid_search': {
    name: 'acp.retrieval.hybrid_search',
    description: 'Execute hybrid retrieval: RAG (vector) + KAG (topology) + cache lookup',
    parameters: HybridSearchToolParams,
    returns: HybridSearchToolResult,
  },
  'acp.schema_match.prewrite': {
    name: 'acp.schema_match.prewrite',
    description: 'Validate SQL/DDL before write — block placeholder terms and unsafe patterns',
    parameters: SchemaMatchToolParams,
    returns: SchemaMatchToolResult,
  },
  'acp.packet.write_trace_event': {
    name: 'acp.packet.write_trace_event',
    description: 'Write validated trace event to Postgres (canonical) → invalidate Redis → emit NATS (async)',
    parameters: WriteTraceEventToolParams,
    returns: WriteTraceEventToolResult,
  },
} as const;

/**
 * Utility: Convert tool contracts to OpenAI-compatible format
 */
export function toolContractsToOpenAI() {
  return Object.values(ACP_TOOLS).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.shape
          ? Object.entries(tool.parameters.shape).reduce(
              (acc, [key, schema]: any) => {
                acc[key] = {
                  type: schema._type || 'string',
                  description: schema.description || '',
                  enum: schema._def?.values,
                };
                return acc;
              },
              {} as Record<string, any>
            )
          : {},
        required: Object.entries(tool.parameters.shape || {})
          .filter(([, schema]: any) => !schema.isOptional?.())
          .map(([key]) => key),
      },
    },
  }));
}

/**
 * Utility: Validate tool result against schema
 */
export function validateToolResult(
  toolName: string,
  result: unknown
): { valid: boolean; errors: string[] } {
  const tool = ACP_TOOLS[toolName as keyof typeof ACP_TOOLS];
  if (!tool) {
    return { valid: false, errors: [`Tool '${toolName}' not found in registry`] };
  }

  try {
    tool.returns.parse(result);
    return { valid: true, errors: [] };
  } catch (error: any) {
    return {
      valid: false,
      errors: error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message],
    };
  }
}
