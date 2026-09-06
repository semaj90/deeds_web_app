/**
 * Atlas Canonical Event Subjects
 *
 * Single source of truth for NATS/RabbitMQ event routing.
 * Used by:
 *   - SvelteKit API routes (NATS publisher)
 *   - LangGraph worker (state machine orchestrator)
 *   - Go services (event subscribers)
 *   - GPU workers (tensor job results)
 *
 * DO NOT add subjects without:
 * 1. Postgres schema change (trace_events table)
 * 2. BitFrost cache key mapping (ff1:trace:*)
 * 3. NATS subscriber implementation
 *
 * Responsibility split:
 *   analytics.*  — AnalyticsEvent facts (dual-transport: Postgres + Redis Streams)
 *   workflow.*   — LangGraph lifecycle (state transitions, checkpoints)
 *   worker.*     — RabbitMQ task delivery (queue, claim, ack, dlq)
 *   agent.*      — Mastra agent invocation (tool calls, completions)
 *   engagement.* — User interaction facts (impressions, clicks, accepts)
 */

// ---------------------------------------------------------------------------
// Namespaced subject registry (preferred — use these for new code)
// ---------------------------------------------------------------------------

export const subjects = {
  analytics: {
    requestReceived: 'analytics.request.received',
    requestRouted: 'analytics.request.routed',
    laneResult: 'analytics.lane.result',
    candidateSelected: 'analytics.candidate.selected',
    centroidAssigned: 'analytics.centroid.assigned',
    somCellAssigned: 'analytics.som.cell.assigned',
    cacheHit: 'analytics.cache.hit',
    cacheMiss: 'analytics.cache.miss',
    errorOccurred: 'analytics.error.occurred',
  },

  workflow: {
    runStarted: 'workflow.run.started',
    nodeStarted: 'workflow.node.started',
    nodeCompleted: 'workflow.node.completed',
    nodeFailed: 'workflow.node.failed',
    transitionSelected: 'workflow.transition.selected',
    runCompleted: 'workflow.run.completed',
    runFailed: 'workflow.run.failed',
    approvalRequired: 'workflow.run.approval_required',
    runResumed: 'workflow.run.resumed',
  },

  worker: {
    taskQueued: 'worker.task.queued',
    taskClaimed: 'worker.task.claimed',
    taskStarted: 'worker.task.started',
    taskCompleted: 'worker.task.completed',
    taskFailed: 'worker.task.failed',
    retryScheduled: 'worker.task.retry_scheduled',
    deadLettered: 'worker.task.dead_lettered',
  },

  agent: {
    invoked: 'agent.invoked',
    toolRequested: 'agent.tool.requested',
    toolCompleted: 'agent.tool.completed',
    completed: 'agent.completed',
    failed: 'agent.failed',
  },

  engagement: {
    impression: 'analytics.recommendation.impression',
    click: 'analytics.recommendation.click',
    accept: 'analytics.recommendation.accept',
    dismiss: 'analytics.recommendation.dismiss',
  },

  // Packet truth flow (Postgres → Redis → mirrors)
  packet: {
    updated: 'atlas.packet.updated',
    validated: 'atlas.packet.validated',
    indexed: 'atlas.packet.indexed',
  },

  // Retrieval pipeline
  retrieval: {
    start: 'retrieval.start',
    turboVecRerank: 'retrieval.turbovec.rerank',
    cuvsSearch: 'gpu.cuvs.search',
    cudaRank: 'gpu.cuda.rank',
    complete: 'retrieval.complete',
  },

  // Trace/telemetry
  trace: {
    event: 'atlas.trace.event',
    checkpoint: 'atlas.trace.checkpoint',
  },

  // System
  system: {
    cacheInvalidate: 'cache.invalidate',
    serviceHealth: 'service.health.check',
    engramFeedback: 'engram.feedback.async',
    glyphRebuild: 'glyph.tile.rebuild',
    topologyRefresh: 'topology.refresh',
  },
} as const;

export type SubjectNamespace = typeof subjects;
export type SubjectValue = {
  [K in keyof SubjectNamespace]: SubjectNamespace[K][keyof SubjectNamespace[K]];
}[keyof SubjectNamespace];

// ---------------------------------------------------------------------------
// Legacy flat registry (kept for backward compatibility — do not extend)
// ---------------------------------------------------------------------------

export const SUBJECTS = {
  // Agent orchestration
  AGENT_EXECUTE: 'agent.task.execute',
  AGENT_TOOL_CALL: 'agent.tool.call',
  AGENT_COMPLETE: 'agent.task.complete',

  // Retrieval pipeline
  RETRIEVAL_START: 'retrieval.start',
  TURBOVEC_RERANK: 'retrieval.turbovec.rerank',
  CUVS_SEARCH: 'gpu.cuvs.search',
  CUDA_RANK: 'gpu.cuda.rank',
  RETRIEVAL_COMPLETE: 'retrieval.complete',

  // Packet operations (canonical truth flow)
  PACKET_UPDATED: 'atlas.packet.updated',
  PACKET_VALIDATED: 'atlas.packet.validated',
  PACKET_INDEXED: 'atlas.packet.indexed',

  // Trace/telemetry
  TRACE_EVENT: 'atlas.trace.event',
  TRACE_CHECKPOINT: 'atlas.trace.checkpoint',

  // Engagement/feedback
  ENGRAM_FEEDBACK: 'engram.feedback.async',
  GLYPH_REBUILD: 'glyph.tile.rebuild',
  TOPOLOGY_REFRESH: 'topology.refresh',

  // System events
  CACHE_INVALIDATE: 'cache.invalidate',
  SERVICE_HEALTH: 'service.health.check',
} as const;

export type Subject = (typeof SUBJECTS)[keyof typeof SUBJECTS];

/**
 * Atlas Task Envelope — unified event format across NATS/RabbitMQ
 *
 * All events must include:
 *   - trace_id (distributed tracing)
 *   - packet identity (packet_key, source_ref, feature_id for Postgres joins)
 *   - strategy (what kind of work this is)
 *   - telemetry (breadcrumb trail for debugging)
 *
 * Validates packet truth flow compliance:
 *   - Postgres reads before writes
 *   - Redis invalidation after Postgres writes
 *   - No direct Qdrant/Neo4j writes without Postgres truth
 */
export interface AtlasTaskEnvelope {
  // Distributed tracing + correlation
  trace_id: string;
  run_id?: string;

  // Packet identity (join keys for Postgres)
  packet_key?: string;
  source_ref?: string;
  feature_id?: string;
  directory_path?: string;

  // Work classification (routes to correct handler)
  strategy:
    | 'agent'
    | 'hybrid_retrieval'
    | 'turbovec_rerank'
    | 'cuvs_search'
    | 'cuda_rank'
    | 'engram_feedback'
    | 'packet_validate'
    | 'glyph_rebuild'
    | 'topology_refresh';

  // Event payload (handler-specific)
  payload: unknown;

  // Observability breadcrumbs
  telemetry: {
    acp_path?: string[]; // agent control plane breadcrumb
    loop_id?: string; // LangGraph loop/node ID
    parent_span_id?: string; // parent trace span
    started_at: string; // ISO timestamp
    subject: Subject; // which NATS subject this came from
  };

  // Hard fail conditions (packet truth flow gates)
  validations?: {
    packet_key_required: boolean;
    source_ref_required: boolean;
    feature_id_required: boolean;
    must_read_postgres_first: boolean;
    must_invalidate_redis_after: boolean;
  };
}

/**
 * BitFrost cache key mapping — FF1 Memory Lane
 *
 * FF1 = First Fast Feature Memory
 * Maps envelope identity fields to Redis keys for hot memory access.
 */
export function ff1Key(
  kind: 'trace' | 'packet' | 'feature' | 'path',
  value: string | string[]
): string {
  if (kind === 'path' && Array.isArray(value)) {
    // ACP path hash: join path + hash to create stable cache key
    const pathStr = value.join(':');
    const hash = hashString(pathStr).toString(16);
    return `ff1:path:${hash}`;
  }
  return `ff1:${kind}:${value}`;
}

/**
 * Simple hash for ACP paths (not cryptographic, just for caching)
 */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Validate envelope against packet truth flow rules
 */
export function validateEnvelope(env: AtlasTaskEnvelope): string[] {
  const errors: string[] = [];

  if (!env.trace_id) errors.push('missing trace_id');
  if (!env.strategy) errors.push('missing strategy');
  if (!env.telemetry.started_at) errors.push('missing telemetry.started_at');
  if (!env.telemetry.subject) errors.push('missing telemetry.subject');

  // Packet identity rules (hard fail conditions)
  const v = env.validations;
  if (v?.packet_key_required && !env.packet_key) errors.push('packet_key required');
  if (v?.source_ref_required && !env.source_ref) errors.push('source_ref required');
  if (v?.feature_id_required && !env.feature_id) errors.push('feature_id required');

  return errors;
}

/**
 * Create a new envelope with canonical defaults
 */
export function createEnvelope(
  traceId: string,
  subject: Subject,
  strategy: AtlasTaskEnvelope['strategy'],
  payload: unknown,
  packetIdentity?: {
    packet_key?: string;
    source_ref?: string;
    feature_id?: string;
    directory_path?: string;
  }
): AtlasTaskEnvelope {
  return {
    trace_id: traceId,
    packet_key: packetIdentity?.packet_key,
    source_ref: packetIdentity?.source_ref,
    feature_id: packetIdentity?.feature_id,
    directory_path: packetIdentity?.directory_path,
    strategy,
    payload,
    telemetry: {
      started_at: new Date().toISOString(),
      subject,
    },
  };
}
