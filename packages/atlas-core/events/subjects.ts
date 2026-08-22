/**
 * Shared NATS Subject Registry
 *
 * Canonical event/task subject names for distributed NATS pub/sub.
 * Used by TypeScript publishers (SvelteKit routes), LangGraph workers,
 * and Go service subscribers.
 *
 * Pattern: {domain}.{operation}[.{detail}]
 */

export const SUBJECTS = {
  // Agent loop control
  AGENT_EXECUTE: "agent.task.execute",
  AGENT_STATE_UPDATE: "agent.state.update",
  AGENT_ERROR: "agent.error",

  // Retrieval pipeline
  RETRIEVAL_HYBRID: "retrieval.hybrid.start",
  RETRIEVAL_TURBOVEC_RERANK: "retrieval.turbovec.rerank",
  RETRIEVAL_RESULT: "retrieval.result",

  // GPU acceleration
  GPU_CUVS_SEARCH: "gpu.cuvs.search",
  GPU_CUDA_RANK: "gpu.cuda.rank",
  GPU_EMBEDDING: "gpu.embedding",
  GPU_JOB_COMPLETE: "gpu.job.complete",

  // Memory/feedback
  ENGRAM_FEEDBACK_ASYNC: "engram.feedback.async",
  ENGRAM_UPDATE: "engram.update",

  // Packet lifecycle (Atlas truth)
  PACKET_CREATED: "atlas.packet.created",
  PACKET_UPDATED: "atlas.packet.updated",
  PACKET_VALIDATED: "atlas.packet.validated",

  // Trace events (audit trail)
  TRACE_EVENT: "atlas.trace.event",
  TRACE_SPAN_START: "atlas.trace.span.start",
  TRACE_SPAN_END: "atlas.trace.span.end",

  // Cache invalidation
  CACHE_INVALIDATE: "cache.invalidate",
  CACHE_WARM: "cache.warm",

  // RPC/tool routing
  RPC_CALL: "rpc.call",
  RPC_RESULT: "rpc.result",
} as const;

/**
 * Subject group aliases for subscription patterns
 */
export const SUBJECT_GROUPS = {
  RETRIEVAL: "retrieval.>",
  GPU: "gpu.>",
  AGENT: "agent.>",
  PACKET: "atlas.packet.>",
  TRACE: "atlas.trace.>",
  ATLAS: "atlas.>",
  ALL_EVENTS: ">",
} as const;

/**
 * Type-safe subject union
 */
export type Subject = (typeof SUBJECTS)[keyof typeof SUBJECTS];

/**
 * Validate a subject string against known subjects
 */
export function isKnownSubject(subject: string): subject is Subject {
  return Object.values(SUBJECTS).includes(subject as Subject);
}

/**
 * Get human-readable subject description
 */
export function describeSubject(subject: Subject): string {
  const descriptions: Record<Subject, string> = {
    [SUBJECTS.AGENT_EXECUTE]: "Execute agent step with tools",
    [SUBJECTS.AGENT_STATE_UPDATE]: "Agent state transition",
    [SUBJECTS.AGENT_ERROR]: "Agent error occurred",

    [SUBJECTS.RETRIEVAL_HYBRID]: "Start hybrid retrieval (vector + sparse + rerank)",
    [SUBJECTS.RETRIEVAL_TURBOVEC_RERANK]: "TurboVec reranking job",
    [SUBJECTS.RETRIEVAL_RESULT]: "Retrieval result ready",

    [SUBJECTS.GPU_CUVS_SEARCH]: "cuVS approximate nearest neighbor search",
    [SUBJECTS.GPU_CUDA_RANK]: "CUDA-accelerated ranking",
    [SUBJECTS.GPU_EMBEDDING]: "Generate embeddings via GPU",
    [SUBJECTS.GPU_JOB_COMPLETE]: "GPU job finished",

    [SUBJECTS.ENGRAM_FEEDBACK_ASYNC]: "Async feedback to memory/engram",
    [SUBJECTS.ENGRAM_UPDATE]: "Update engram/feature memory",

    [SUBJECTS.PACKET_CREATED]: "New packet in atlas_packets",
    [SUBJECTS.PACKET_UPDATED]: "Packet updated (summary/title/embedding)",
    [SUBJECTS.PACKET_VALIDATED]: "Packet passed GAN validation",

    [SUBJECTS.TRACE_EVENT]: "Generic trace event (audit)",
    [SUBJECTS.TRACE_SPAN_START]: "OpenTelemetry-like span start",
    [SUBJECTS.TRACE_SPAN_END]: "OpenTelemetry-like span end",

    [SUBJECTS.CACHE_INVALIDATE]: "Invalidate Redis/BitFrost keys",
    [SUBJECTS.CACHE_WARM]: "Preload cache with data",

    [SUBJECTS.RPC_CALL]: "MCP tool call via RPC",
    [SUBJECTS.RPC_RESULT]: "RPC tool result",
  };

  return descriptions[subject] || "Unknown subject";
}
