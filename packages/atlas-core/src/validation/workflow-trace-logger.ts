/**
 * Workflow Trace Logger
 *
 * Captures the entire execution trace (not just final answer):
 * query → route → retrieval → compaction → synthesis → validation → writes
 *
 * Stores in:
 * - Postgres (canonical audit log)
 * - Redis BitFrost (hot cache for workflow pattern search)
 * - Qdrant (semantic workflow retrieval)
 */

import type { TraceCheckpointEvent } from '../nats/nats-client.js';

export interface WorkflowTrace {
  trace_id: string;
  timestamp: string;
  user_query: string;

  // Routing decision
  route: string; // e.g., "rg+postgres+qdrant+rerank"
  route_rationale?: string;

  // Tool usage
  tools_used: string[]; // ["rg.search", "acp.retrieval.hybrid_search", ...]
  tool_args: Record<string, any>;
  tool_latencies: Record<string, number>; // ms per tool

  // Data retrieved
  packet_keys_used: string[];
  source_refs_used: string[];
  feature_ids_used: string[];
  summaries_used: string[];

  // Retrieval metrics
  retrieval_latency_ms: number;
  compaction_ratio: number; // tokens_before / tokens_after
  tokens_sent_to_model: number;

  // LLM synthesis
  model_name: string; // "gemma4-rotorquant:latest"
  model_version: string;
  llm_synthesis_input: string; // system + user + packet context
  llm_synthesis_output: string; // full response
  llm_synthesis_latency_ms: number;

  // Validation
  validator_name: string; // "gan-adversarial-validator"
  validator_result: 'PASS' | 'SOFT_WARNING' | 'HARD_FAIL';
  validator_errors?: string[];
  validator_warnings?: string[];

  // Datastore writes
  writes_executed: Array<{
    target: 'postgres' | 'redis' | 'qdrant' | 'neo4j' | 'nats';
    operation: string;
    latency_ms: number;
    success: boolean;
    error?: string;
  }>;

  // Overall metrics
  total_duration_ms: number;
  success: boolean;

  // Schema & version tracking
  schema_version: string;
  git_commit: string;
  workspace_path: string;
}

export interface WorkflowCacheEntry {
  workflow_id: string;
  trace_id: string;
  workflow_embedding: number[]; // 768-dim from Qdrant
  workflow_embedding_768: number[];
  workflow_latent64: number[]; // 64-dim AE compressed

  // Searchable metadata
  user_query_hash: string;
  route: string;
  tools_used: string[];
  success: boolean;
  duration_ms: number;

  // For reuse
  packets_used: string[];
  source_refs: string[];
  feature_ids: string[];

  // Context
  domain: string; // "gpu_acceleration", "codebase_analysis", etc.
  task_type: string; // "analysis", "patch_proposal", "refactor", etc.

  timestamp: string;
  ttl: number; // seconds (default: 86400 * 7 = 1 week)
}

/**
 * Convert full trace into a searchable workflow cache entry
 */
export function traceToWorkflowCache(trace: WorkflowTrace): Partial<WorkflowCacheEntry> {
  return {
    trace_id: trace.trace_id,
    user_query_hash: Buffer.from(trace.user_query).toString('base64'),
    route: trace.route,
    tools_used: trace.tools_used,
    success: trace.success && trace.validator_result === 'PASS',
    duration_ms: trace.total_duration_ms,
    packets_used: trace.packet_keys_used,
    source_refs: trace.source_refs_used,
    feature_ids: trace.feature_ids_used,
    timestamp: trace.timestamp,
    domain: extractDomain(trace.user_query),
    task_type: inferTaskType(trace.route, trace.tools_used),
  };
}

function extractDomain(query: string): string {
  const domains: Record<string, string[]> = {
    gpu_acceleration: ['gpu', 'cuda', 'libtorch', 'rerank', 'latency', 'performance'],
    codebase_analysis: ['codebase', 'import', 'dependency', 'structure', 'module'],
    evidence_processing: ['evidence', 'document', 'extraction', 'metadata'],
    legal_research: ['statute', 'precedent', 'citation', 'case', 'law'],
  };

  const queryLower = query.toLowerCase();
  for (const [domain, keywords] of Object.entries(domains)) {
    if (keywords.some(kw => queryLower.includes(kw))) {
      return domain;
    }
  }
  return 'general';
}

function inferTaskType(route: string, toolsUsed: string[]): string {
  if (toolsUsed.includes('acp.packet.write_trace_event')) return 'refactor';
  if (toolsUsed.includes('acp.schema_match.prewrite')) return 'validation';
  if (route.includes('qdrant')) return 'semantic_search';
  if (route.includes('rg')) return 'lexical_search';
  return 'general';
}

/**
 * Store workflow trace in Postgres (canonical)
 */
export async function logWorkflowTracePostgres(
  trace: WorkflowTrace,
  db: any // Drizzle DB client
): Promise<void> {
  const { sql } = await import('drizzle-orm');

  await db.execute(sql`
    INSERT INTO workflow_traces (
      trace_id,
      user_query,
      route,
      tools_used,
      packet_keys_used,
      source_refs_used,
      feature_ids_used,
      retrieval_latency_ms,
      tokens_sent_to_model,
      llm_synthesis_output,
      llm_synthesis_latency_ms,
      validator_result,
      total_duration_ms,
      success,
      schema_version,
      git_commit,
      workspace_path,
      created_at
    ) VALUES (
      ${trace.trace_id},
      ${trace.user_query},
      ${trace.route},
      ${JSON.stringify(trace.tools_used)},
      ${JSON.stringify(trace.packet_keys_used)},
      ${JSON.stringify(trace.source_refs_used)},
      ${JSON.stringify(trace.feature_ids_used)},
      ${trace.retrieval_latency_ms},
      ${trace.tokens_sent_to_model},
      ${trace.llm_synthesis_output},
      ${trace.llm_synthesis_latency_ms},
      ${trace.validator_result},
      ${trace.total_duration_ms},
      ${trace.success},
      ${trace.schema_version},
      ${trace.git_commit},
      ${trace.workspace_path},
      NOW()
    )
  `);
}

/**
 * Store workflow cache in Redis BitFrost (hot cache)
 */
export async function logWorkflowTraceRedis(
  trace: WorkflowTrace,
  redis: any // ioredis client
): Promise<void> {
  const key = `workflow:trace:${trace.trace_id}`;
  const ttl = 7 * 24 * 60 * 60; // 1 week

  const entry: Partial<WorkflowCacheEntry> = traceToWorkflowCache(trace);

  await redis.setex(
    key,
    ttl,
    JSON.stringify({
      ...entry,
      llm_output: trace.llm_synthesis_output,
      success: trace.success && trace.validator_result === 'PASS',
    })
  );

  // Also index by query hash for inverse lookup
  const queryHashKey = `workflow:query_hash:${entry.user_query_hash}`;
  await redis.sadd(queryHashKey, trace.trace_id);
  await redis.expire(queryHashKey, ttl);
}

/**
 * Store workflow in Qdrant for semantic search
 */
export async function logWorkflowTraceQdrant(
  trace: WorkflowTrace,
  qdrant: any, // Qdrant client
  embedding: number[] // 768-dim workflow embedding
): Promise<void> {
  const workflowId = `workflow:${trace.trace_id}`;

  await qdrant.upsert('workflow_patterns', {
    points: [
      {
        id: workflowId,
        vector: embedding,
        payload: {
          trace_id: trace.trace_id,
          route: trace.route,
          tools_used: trace.tools_used,
          success: trace.success && trace.validator_result === 'PASS',
          duration_ms: trace.total_duration_ms,
          domain: extractDomain(trace.user_query),
          task_type: inferTaskType(trace.route, trace.tools_used),
          timestamp: trace.timestamp,
          packets_used: trace.packet_keys_used,
          source_refs: trace.source_refs_used,
          feature_ids: trace.feature_ids_used,
        },
      },
    ],
  });
}

/**
 * Find similar successful workflows for a new query
 */
export async function findSimilarWorkflows(
  query: string,
  qdrant: any,
  embedding: number[], // 768-dim query embedding
  limit: number = 5
): Promise<WorkflowCacheEntry[]> {
  const results = await qdrant.search('workflow_patterns', {
    vector: embedding,
    limit,
    score_threshold: 0.75, // Only return high-similarity workflows
    filter: {
      must: [
        {
          key: 'success',
          match: { value: true },
        },
      ],
    },
  });

  return results.map((r: any) => ({
    workflow_id: r.id,
    trace_id: r.payload.trace_id,
    route: r.payload.route,
    tools_used: r.payload.tools_used,
    packets_used: r.payload.packets_used,
    source_refs: r.payload.source_refs,
    feature_ids: r.payload.feature_ids,
    success: r.payload.success,
    duration_ms: r.payload.duration_ms,
    domain: r.payload.domain,
    task_type: r.payload.task_type,
    timestamp: r.payload.timestamp,
  }));
}

/**
 * Retrieve cached workflow from Redis or Postgres
 */
export async function getCachedWorkflow(
  traceId: string,
  redis?: any,
  db?: any
): Promise<WorkflowTrace | null> {
  // Try Redis first (hot cache)
  if (redis) {
    const cached = await redis.get(`workflow:trace:${traceId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  // Fall back to Postgres
  if (db) {
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(sql`
      SELECT * FROM workflow_traces WHERE trace_id = ${traceId} LIMIT 1
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    if (rows.length > 0) {
      return rows[0] as WorkflowTrace;
    }
  }

  return null;
}
