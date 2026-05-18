/**
 * Structured Redis Key Schema
 *
 * Centralizes ALL cache key generation for the legal AI platform.
 * Ensures consistent key patterns with version stamps for invalidation.
 *
 * Key hierarchy:
 *   Retrieval: case:{caseId}:query:{hash}:retrieval:v{ver}
 *   Synthesis: case:{caseId}:query:{hash}:llm:{model}:{promptVer}:v{ver}
 *   Client/UI: user:{userId}:case:{caseId}:view:{panel}
 *   Evidence:  evidence:{evidenceId}:{stage}
 *   Graph:     graph:{caseId}:neighbors:{nodeHash}
 *   Embedding: embed:{model}:{textHash}
 *
 * Standardized Namespaces (G17 Hardening):
 *   ace:llm:exact:    — L1 LLM exact-match cache
 *   ace:research:*    — Research graph, policy, cluster summaries
 *   ace:rank:demand   — 1h TTL, hit-demand hash (from chunk_hit_log)
 *   ace:authority:top — 6h TTL, top entries from graphify:gds
 *   ace:code:*        — Codebase context cache
 *   gpu:*             — Small reusable tensor results (encoded64, topk, rerank)
 *   cluster:*         — Cluster summary and membership artifacts
 *   graph:*           — Graph expansion / triple packets
 *   ace:context:*     — Packed ACE context packet
 *   taxonomy:clusters — SOM/K-means cluster centroids
 *   gpu:karpathy:*    — GPU rank/scoring metadata
 */

import { createHash } from 'crypto';

// ── Hashing ────────────────────────────────────────────────────────────────

function hashStr(input: string): string {
	return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ── TTL Constants (seconds) ───────────────────────────────────────────────

export const TTL = {
  /** Retrieval bundles: reusable across multiple synthesis calls */
  RETRIEVAL: 30 * 60, // 30 min
  /** LLM synthesis: shorter, invalidated by case changes */
  SYNTHESIS: 15 * 60, // 15 min
  /** Client/UI view state: very short */
  CLIENT_VIEW: 5 * 60, // 5 min
  /** Evidence YOLO detection: long, keyed by content hash */
  YOLO: 7 * 24 * 60 * 60, // 7 days
  /** LLM synthesis per evidence item */
  EVIDENCE_LLM: 24 * 60 * 60, // 24 hours
  /** Graph neighborhood cache */
  GRAPH: 20 * 60, // 20 min
  /** Authority chain drill-down (multi-hop statute/case expansion) */
  AUTHORITY_CHAIN: 15 * 60, // 15 min
  /** Embedding vectors: long-lived, content-addressed */
  EMBEDDING: 7 * 24 * 60 * 60, // 7 days
  /** Job status: short, polled frequently */
  JOB_STATUS: 10 * 60, // 10 min
  /** Case version stamp: never expires, invalidated on mutation */
  CASE_VERSION: 0, // no TTL (explicit invalidation)
  /** Cluster summary narratives: medium-lived, LLM-generated */
  CLUSTER_SUMMARY: 6 * 60 * 60, // 6 hours
  /** Cluster/SOM centroid vectors: same TTL as cluster summaries */
  CENTROID: 6 * 60 * 60, // 6 hours
  /** ACE codebase hit cache: boosted chunks from last Qdrant+topology pass */
  ACE_CODE: 15 * 60, // 15 min — short enough to reflect new indexing
  /** ACE topological KAG prompt block: compact Redis KV prompt injection */
  ACE_TOPO_KAG_PROMPT: 10 * 60, // 10 min — tied to hot retrieval context
  /** ACE token budget stats per (topoClass, clusterId): rolling window */
  ACE_TOKEN_BUDGET: 2 * 60 * 60, // 2 hours
  /** User activity heartbeat: long-lived engagement tracking */
  USER_ACTIVITY: 30 * 24 * 60 * 60, // 30 days
} as const;

// ── Case Version Stamps ───────────────────────────────────────────────────

export const caseVersionKey = {
  /** case:version:{caseId} → monotonic counter */
  stamp: (caseId: string) => `case:version:${caseId}`,
};

// ── Retrieval Cache Keys ──────────────────────────────────────────────────

export const retrievalKey = {
  /**
   * case:{caseId}:query:{queryHash}:retrieval:v{caseVersion}
   * Stores: chunk IDs, graph edge IDs, rerank scores, cluster IDs, source refs
   */
  forQuery: (caseId: string, query: string, caseVersion: number) =>
    `case:${caseId}:query:${hashStr(query)}:retrieval:v${caseVersion}`,

  /** Global (no case scope): query:{queryHash}:retrieval */
  global: (query: string) => `query:${hashStr(query)}:retrieval`,
};

// ── Synthesis Cache Keys ──────────────────────────────────────────────────

export const synthesisKey = {
  /**
   * case:{caseId}:query:{queryHash}:llm:{model}:{promptVersion}:v{caseVersion}
   * Stores: final answer, citations, confidence, token usage
   */
  forQuery: (
    caseId: string,
    query: string,
    model: string,
    promptVersion: string,
    caseVersion: number
  ) => `case:${caseId}:query:${hashStr(query)}:llm:${model}:${promptVersion}:v${caseVersion}`,

  /** Global (no case scope): query:{queryHash}:llm:{model} */
  global: (query: string, model: string) => `query:${hashStr(query)}:llm:${model}`,

  /**
   * bifrost:kb:llm_synthesis:v1:{kbSnapshotHash}:{karpathyRev}:{queryHash}
   * Ensures cartridge reorder invalidates synthesis cache correctly.
   */
  bifrostKb: (kbSnapshotHash: string, karpathyRev: string, query: string) =>
    `bifrost:kb:llm_synthesis:v1:${kbSnapshotHash}:${karpathyRev}:${hashStr(query)}`,
};

// ── Client/UI Cache Keys ──────────────────────────────────────────────────

export const clientKey = {
  /**
   * user:{userId}:case:{caseId}:view:{panel}
   * Stores: board state, last search, timeline filters, active evidence set
   */
  view: (userId: string, caseId: string, panel: string) =>
    `user:${userId}:case:${caseId}:view:${panel}`,

  /** user:{userId}:recent — recent activity */
  recent: (userId: string) => `user:${userId}:recent`,
};

// ── Evidence Analysis Keys ────────────────────────────────────────────────

export const evidenceKey = {
  /** yolo:evidence:{sha256Hash} — YOLO detection by content */
  yolo: (sha256: string) => `yolo:evidence:${sha256}`,

  /** llm_synthesis:{evidenceId} — LLM analysis per evidence */
  llmSynthesis: (evidenceId: string) => `llm_synthesis:${evidenceId}`,

  /** evidence:analysis:{evidenceId}:{type} — cached analysis result */
  analysis: (evidenceId: string, type: string) => `evidence:analysis:${evidenceId}:${type}`,

  /** evidence:status:{evidenceId} — job processing status */
  status: (evidenceId: string) => `evidence:status:${evidenceId}`,
};

// ── Graph Cache Keys ──────────────────────────────────────────────────────

export const graphKey = {
  /** graph:{caseId}:neighbors:{nodeHash} — KAG neighborhood */
  neighbors: (caseId: string, nodeId: string) => `graph:${caseId}:neighbors:${hashStr(nodeId)}`,

  /** graph:{caseId}:edges — all edges for a case */
  edges: (caseId: string) => `graph:${caseId}:edges`,
};

// ── Embedding Cache Keys ──────────────────────────────────────────────────

export const embeddingKey = {
  /** embed:{model}:{textHash} — vector cache by content */
  vector: (model: string, text: string) => `embed:${model}:${hashStr(text)}`,
};

// ── Job Status Keys ───────────────────────────────────────────────────────

export const jobKey = {
  /** job:{jobType}:{jobId} — worker job status */
  status: (jobType: string, jobId: string) => `job:${jobType}:${jobId}`,
};

// ── Cluster Summary Keys ──────────────────────────────────────────────────

export const clusterSummaryKey = {
  /** ace:research:cluster-summary:{clusterId} — LLM-generated cluster narrative */
  cached: (clusterId: number) => `ace:research:cluster-summary:${clusterId}`,
};

export const centroidKey = {
  /** centroid:cluster:{clusterId} — Float32Array packed as JSON number[] */
  cluster: (clusterId: number) => `taxonomy:clusters:gpu:${clusterId}`,
  /** centroid:som:{x}:{y} — SOM cell centroid vector */
  som: (x: number, y: number) => `taxonomy:clusters:som:${x}:${y}`,
};

// ── Redis Tensor Cache Artifacts ─────────────────────────────────────────────

/**
 * Compact reusable tensor results. These are small cacheable outputs, not raw VRAM state.
 */
export const tensorCacheKey = {
  encoded64: (queryHash: string) => `gpu:encoded64:${queryHash}`,
  topkClusters: (queryHash: string) => `gpu:topk_clusters:${queryHash}`,
  rerankScores: (queryHash: string) => `gpu:rerank_scores:${queryHash}`,
};

export const clusterTensorKey = {
  summary: (clusterId: number) => `cluster:summary:${clusterId}`,
  members: (clusterId: number) => `cluster:members:${clusterId}`,
};

export const graphPacketKey = {
  expand: (hash: string) => `neo4j:expand:${hash}`,
  triples: (hash: string) => `graph:triples:${hash}`,
};

export const aceContextKey = {
  packet: (contextHash: string) => `ace:context:${contextHash}`,
};

// ── Analytics & Ranking Keys (G17) ───────────────────────────────────────────

export const hitDemandKey = {
  /** ace:rank:demand — hit-demand hash from chunk_hit_log */
  hash: () => 'ace:rank:demand',
};

export const authorityTopKey = {
  /** ace:authority:top — top entries from graphify:gds */
  hash: () => 'ace:authority:top',
};

// ── User Engagement Keys ──────────────────────────────────────────────────

export const userEngagementKey = {
  /** user:activity:{userId} — last-active timestamp */
  activity: (userId: string) => `user:activity:${userId}`,
  /** user:notify:{userId}:{tier}:{dateStr} — notification throttle */
  notify: (userId: string, tier: string, dateStr: string) =>
    `user:notify:${userId}:${tier}:${dateStr}`,
};

// ── Invalidation Helpers ──────────────────────────────────────────────────

/**
 * Pattern for invalidating all case-scoped cache entries.
 * Use with Redis SCAN + DEL (never KEYS in production).
 */
export const invalidationPattern = {
  /** All retrieval + synthesis for a case */
  forCase: (caseId: string) => `case:${caseId}:*`,

  /** All views for a user on a case */
  forUserCase: (userId: string, caseId: string) => `user:${userId}:case:${caseId}:*`,

  /** All evidence analysis for an item */
  forEvidence: (evidenceId: string) => `evidence:*:${evidenceId}:*`,

  /** All graph data for a case */
  forCaseGraph: (caseId: string) => `graph:${caseId}:*`,
};

// ── ACE Codebase Context Cache Keys ──────────────────────────────────────────

export const aceCodeKey = {
  /**
   * ace:code:{queryHash}:{topoClass}:{dirHash}
   * Stores: boosted codebaseContext chunk array from the last Qdrant + topology pass.
   * Keyed by query + topo class (routing dimension) + agentsMd directory scope.
   */
  forQuery: (query: string, topoClass: number, resolvedDir?: string): string =>
    `ace:code:${hashStr(query)}:${topoClass}:${hashStr(resolvedDir ?? 'root')}`,
};

export const aceTopologicalKagKey = {
  /**
   * ace:topo:kag:{queryHash}:{scopeHash}
   * Stores a compact, prompt-ready topological KAG block assembled from
   * codebase hits, SOM/BMU, graph authority, AGENTS scope, and multi-lane hints.
   */
  forPrompt: (query: string, scope: string): string =>
    `ace:topo:kag:${hashStr(query)}:${hashStr(scope)}`,
};

// ── ACE Token Budget Keys ─────────────────────────────────────────────────────

export const aceTokenBudgetKey = {
  /**
   * ace:token:budget:{topoClass}:{clusterId}
   * Stores: { p50Tokens, p90Tokens, avgChunksPerQuery, sampleCount }
   * Written fire-and-forget after each ACE codebase cache write.
   * Used to pre-size the Qdrant fetch limit before any ANN call.
   */
  forCluster: (topoClass: number, clusterId: number): string =>
    `ace:token:budget:${topoClass}:${clusterId}`,
  /** Fallback when cluster is unknown — keyed by topoClass only. */
  forClass: (topoClass: number): string =>
    `ace:token:budget:${topoClass}:unknown`,
};

// ── LLM Cache Key Utilities ───────────────────────────────────────────────

/** Prefix used by the Redis L1 exact-match cache — single source of truth. */
export const LLM_EXACT_CACHE_PREFIX = 'ace:llm:exact:';

/**
 * Generate a deterministic L1 Redis cache key from LLM request parameters.
 * Single source of truth — used by redis-exact-match.ts and any other L1 LLM cache module.
 */
export function generateCacheKey(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): string {
  const normalized = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    maxTokens: params.maxTokens ?? 2048,
    systemPrompt: params.systemPrompt ?? '',
  };
  const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
  return `${LLM_EXACT_CACHE_PREFIX}${hash}`;
}

/**
 * Generate a deterministic context hash for the semantic (Qdrant-backed) LLM cache.
 * MD5 of the context string — used by llm-cache.ts.
 */
export function generateContextHash(context: string): string {
  return createHash('md5').update(context).digest('hex');
}

// ── Convenience: increment case version after mutation ────────────────────

import { getRedis } from '$lib/server/redis.js';

/**
 * Bump the case version counter in Redis.
 * Call after any mutation that should invalidate retrieval/synthesis caches.
 * Returns the new version number.
 */
export async function bumpCaseVersion(caseId: string): Promise<number> {
	try {
		const redis = getRedis();
		const newVersion = await redis.incr(caseVersionKey.stamp(caseId));
		return newVersion;
	} catch {
		return 0;
	}
}

/**
 * Get the current case version from Redis (0 if unset).
 */
export async function getCaseVersion(caseId: string): Promise<number> {
	try {
		const redis = getRedis();
		const val = await redis.get(caseVersionKey.stamp(caseId));
		return val ? parseInt(val, 10) : 0;
	} catch {
		return 0;
	}
}
