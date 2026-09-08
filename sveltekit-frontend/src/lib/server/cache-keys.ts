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

import { createHash } from 'node:crypto';
import type { ContextPrefixIdentityV1 } from '$lib/server/atlas/prefill/context-prefix-identity-v1.js';
import { canonicalSha256V1 } from '$lib/server/atlas/prefill/canonical-hash-v1.js';

// ── Hashing ────────────────────────────────────────────────────────────────

function hashStr16(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function hashStr(input: string): string {
  return createHash('sha256').update(input).digest('hex');
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
  /** OpenAI-compatible prompt cache: compiled ACE prompt + response replay */
  ACE_PROMPT: 24 * 60 * 60, // 24 hours — stable within a day bucket
  /** ACE topological KAG prompt block: compact Redis KV prompt injection */
  ACE_TOPO_KAG_PROMPT: 10 * 60, // 10 min — tied to hot retrieval context
  /** ACE token budget stats per (topoClass, clusterId): rolling window */
  ACE_TOKEN_BUDGET: 2 * 60 * 60, // 2 hours
  /** User activity heartbeat: long-lived engagement tracking */
  USER_ACTIVITY: 30 * 24 * 60 * 60, // 30 days
  /** BitFrost L1 cache: packet-level hot memory */
  BIFROST_PACKET: 60 * 60, // 1 hour
  /** BitFrost L1 cache: feature/source centroids */
  BIFROST_INDEX: 6 * 60 * 60, // 6 hours
  /** BitFrost L1 cache: query results from same session */
  BIFROST_QUERY: 30 * 60, // 30 min
  /** BitFrost L1 cache: workflow patterns */
  BIFROST_WORKFLOW: 60 * 60, // 1 hour
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
    `case:${caseId}:query:${hashStr16(query)}:retrieval:v${caseVersion}`,

  /** Global (no case scope): query:{queryHash}:retrieval */
  global: (query: string) => `query:${hashStr16(query)}:retrieval`,
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
  ) => `case:${caseId}:query:${hashStr16(query)}:llm:${model}:${promptVersion}:v${caseVersion}`,

  /** Global (no case scope): query:{queryHash}:llm:{model} */
  global: (query: string, model: string) => `query:${hashStr16(query)}:llm:${model}`,

  /**
   * bifrost:kb:llm_synthesis:v1:{kbSnapshotHash}:{karpathyRev}:{queryHash}
   * Ensures cartridge reorder invalidates synthesis cache correctly.
   */
  bifrostKb: (kbSnapshotHash: string, karpathyRev: string, query: string) =>
    `bifrost:kb:llm_synthesis:v1:${kbSnapshotHash}:${karpathyRev}:${hashStr16(query)}`,
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
  neighbors: (caseId: string, nodeId: string) => `graph:${caseId}:neighbors:${hashStr16(nodeId)}`,

  /** graph:{caseId}:edges — all edges for a case */
  edges: (caseId: string) => `graph:${caseId}:edges`,
};

// ── Embedding Cache Keys ──────────────────────────────────────────────────

export const embeddingKey = {
  /** embed:{model}:{textHash} — vector cache by content */
  vector: (model: string, text: string) => `embed:${model}:${hashStr16(text)}`,
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
    `ace:code:${hashStr16(query)}:${topoClass}:${hashStr16(resolvedDir ?? 'root')}`,
};

export const aceTopologicalKagKey = {
  /**
   * ace:topo:kag:{queryHash}:{scopeHash}
   * Stores a compact, prompt-ready topological KAG block assembled from
   * codebase hits, SOM/BMU, graph authority, AGENTS scope, and multi-lane hints.
   */
  forPrompt: (query: string, scope: string): string =>
    `ace:topo:kag:${hashStr16(query)}:${hashStr16(scope)}`,
};

export const ontologyKey = {
  /** ace:ontology:tuple:{tupleId} — compact linked tuple projection */
  tuple: (tupleId: string) => `ace:ontology:tuple:${tupleId}`,

  /** ace:ontology:tokenmap:{featureId}:{sourceRefHash}:{packetId} — revisioned token remapping cache */
  tokenMap: (featureId: string, sourceRefHash: string, packetId: string) =>
    `ace:ontology:tokenmap:${featureId}:${sourceRefHash}:${packetId}`,

  /** ace:ontology:blocked_content_hashes:{workspaceRevision} — audited blocklist for prompt-injection defense */
  blockedContentHashes: (workspaceRevision: string) =>
    `ace:ontology:blocked_content_hashes:${hashStr16(workspaceRevision)}`,
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
  forClass: (topoClass: number): string => `ace:token:budget:${topoClass}:unknown`,
};

// ── BitFrost Cache Key Helpers ──────────────────────────────────────────────
/**
 * Canonical BitFrost key helpers (P1 consolidation).
 * All bifrost:* keys generated from these functions to prevent key collisions.
 */

export const bifrostKey = {
  /**
   * bifrost:packet:{packet_key}
   * Stores: full packet record from atlas_packets
   * TTL: 1 hour
   */
  packet: (packetKey: string) => `bifrost:packet:${packetKey}`,

  /**
   * bifrost:feature:{feature_id}
   * Stores: centroid vector + top-k similar packets
   * TTL: 6 hours
   */
  feature: (featureId: string) => `bifrost:feature:${hashStr16(featureId)}`,

  /**
   * bifrost:source:{source_ref}
   * Stores: source-level metadata + child packets
   * TTL: 6 hours
   */
  source: (sourceRef: string) => `bifrost:source:${hashStr16(sourceRef)}`,

  /**
   * bifrost:query:{query_hash}
   * Stores: successful retrieval results from earlier in session
   * TTL: 30 minutes
   */
  query: (query: string) => `bifrost:query:${hashStr16(query)}`,

  /**
   * bifrost:workflow:{workflow_id}
   * Stores: cached successful workflow pattern
   * TTL: 1 hour
   */
  workflow: (workflowId: string) => `bifrost:workflow:${hashStr16(workflowId)}`,

  /**
   * Semantic cache lanes (bifrost:sem:* prefix)
   * These are the existing semantic cache keys from atlas-reward-cache.ts
   * Consolidating into a single source of truth
   */
  semantic: {
    /**
     * bifrost:sem:packet:{packet_key} — packet-level semantic cache (TTL 1h),
     * keyed by canonical packetKey ONLY.
     *
     * HISTORICAL AMBIGUITY, found + Stage-1-audited 2026-09-04
     * (BIFROST-KEY-SEMANTICS-OWNER-01, docs/reports/parent-atlas-bitfrost-key-semantics-owner-v1.json):
     * this exact prefix was ALSO being written by scripts/cache/warm-bifrost-semantic-cache.mjs
     * keyed by query_hash (a query-result cache, a completely different identity), and read as
     * such by query-router.ts. That writer/reader pair is migrated (Stage 2, same day) onto the
     * dedicated `query()` builder below — this `packet()` builder's identity is now unambiguous.
     * If you find a caller passing anything other than a real packetKey here, that's the bug this
     * migration fixed reappearing — route it through `query()` instead.
     */
    packet: (packetKey: string) => `bifrost:sem:packet:${packetKey}`,

    /**
     * bifrost:sem:query:{query_hash} — query-result semantic cache (TTL 1h).
     * Added 2026-09-04 (BIFROST-KEY-SEMANTICS-OWNER-01 Stage 2): this prefix was already
     * reserved (scripts/atlas/invalidate-atlas-cache-epoch.mjs has deleted `bifrost:sem:query:*`
     * since before this change, alongside `bifrost:sem:packet:*` — strong evidence this was
     * always the intended shape for query-hash-keyed entries) but nothing had ever written to
     * it; warm-bifrost-semantic-cache.mjs was instead writing query-hash entries under
     * `packet()`'s prefix by mistake. This is the correct, single source of truth for it now.
     */
    query: (queryHash: string) => `bifrost:sem:query:${queryHash}`,

    /** bifrost:sem:feature:{feature_id} — feature-level semantic cache (TTL 4h) */
    feature: (featureId: string) => `bifrost:sem:feature:${featureId}`,

    /** bifrost:sem:intent:{intent_hash} — query intent cache (TTL 30min) */
    intent: (intentHash: string) => `bifrost:sem:intent:${intentHash}`,

    /** bifrost:sem:sourceRef:{sha256(ref)} — sourceRef -> query_hash indirection (TTL 2h) */
    sourceRef: (sourceRefHash: string) => `bifrost:sem:sourceRef:${sourceRefHash}`,

    /**
     * bitfrost:summary:packet:v1:{packet_key} — packet summary cache.
     * Added 2026-09-04 (BITFROST-INVALIDATION-OWNER-01): this shape was live in Redis
     * (verified via `EXISTS`) but had no shared builder anywhere in the codebase before
     * this change — every caller that touched it (all 3 duplicate `invalidateRedisCache`
     * implementations) hand-built a *different*, non-existent shape instead
     * (`bitfrost:summary:{packet_key}`, missing the `packet:v1:` segment). This is the
     * single source of truth for it going forward.
     */
    packetSummary: (packetKey: string) => `bitfrost:summary:packet:v1:${packetKey}`,
  },

  /**
   * Residency-heat control indexes (BITFROST-RESIDENCY-WARMING-01, 2026-09-04).
   * Bounded ZSETs of a `ResidencyScoreV1` blend, keyed by artifact kind. These
   * are control-plane indexes ONLY — they decide what already-derived data is
   * worth keeping resident in the value keys above (`packet`/`semantic.*`/
   * `packetSummary`); they never become a second retrieval index and never
   * carry canonical identity themselves.
   */
  heat: {
    packet: 'bitfrost:heat:packet',
    query: 'bitfrost:heat:query',
    feature: 'bitfrost:heat:feature',
    summary: 'bitfrost:heat:summary',
  },
};

/**
 * BitFrost key identity for one packet's semantic cache lanes. `sourceRevision` is
 * carried for logging/audit (which revision triggered an invalidation) — it is NOT
 * embedded in the key itself, matching the real live key shape confirmed via `EXISTS`
 * (`bifrost:sem:packet:{packet_key}`, no revision segment). Packet-level revision
 * identity already lives in `packet_key` per this repo's packet-identity conventions;
 * adding a second revision segment to the key would both diverge from live Redis
 * reality and orphan already-warmed cache entries.
 */
export interface BitfrostPacketIdentity {
  packetKey: string;
  featureId?: string;
  sourceRevision?: string;
}

// ── LLM Cache Key Utilities ───────────────────────────────────────────────

/** Prefix used by the Redis L1 exact-match cache — single source of truth. */
export const LLM_EXACT_CACHE_PREFIX = 'ace:llm:exact:';

/** Prefix for OpenAI-compatible prompt/completion cache entries. */
export const OPENAI_PROMPT_CACHE_PREFIX = 'ace:prompt:completion:';

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
 * Generate a day-bucketed prompt cache key for the OpenAI-compatible route.
 * The stable prefix is the assembled system prompt; the user intent is the
 * query text. The day bucket keeps the cache bounded to a 24h replay window.
 */
export function generatePromptCacheKey(params: {
  model: string;
  stablePrefix: string;
  contextPrefixIdentity?: Pick<ContextPrefixIdentityV1, 'checksum'>;
  userIntent: string;
  dayBucket?: string;
  routingSignature?: string;
  dynamicContextSignature?: string;
}): string {
  const normalized = {
    model: params.model,
    stablePrefix: params.stablePrefix,
    contextPrefixIdentityChecksum: params.contextPrefixIdentity?.checksum ?? '',
    userIntent: params.userIntent,
    dayBucket: params.dayBucket ?? new Date().toISOString().slice(0, 10),
    routingSignature: params.routingSignature ?? '',
    dynamicContextSignature: params.dynamicContextSignature ?? '',
  };
  const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
  return `${OPENAI_PROMPT_CACHE_PREFIX}${hash}`;
}

/**
 * Build the ACE completion cache key from a packet key and exact user query hash.
 * The same ACE packet can be reused for multiple questions, so the final answer
 * cache must include the user query hash to avoid returning a stale response.
 */
export function buildAcePacketCacheKey(input: {
  model: string;
  stablePrefixHash: string;
  userIntent?: string;
  routingSignature?: string;
  dynamicContextSignature?: string;
  /** Hash of output-affecting generation controls for exact-answer reuse. */
  generationControlsSignature?: string;
  /** Canonical hash of the exact ordered messages sent to the model. */
  renderedRequestChecksum?: string;
  /** Available manifest identity; omitted only for legacy/degraded contexts. */
  contextManifestIdentity?: unknown;
  dayBucket?: string;
}) {
  const raw = [
    input.model,
    input.stablePrefixHash,
    input.userIntent ?? 'unknown',
    input.routingSignature ?? 'none',
    input.dynamicContextSignature ?? 'none',
    input.generationControlsSignature ?? 'none',
    input.renderedRequestChecksum ?? 'none',
    input.contextManifestIdentity == null
      ? 'none'
      : canonicalSha256V1({ schema: 'atlas.ace-context-manifest-identity.v1', value: input.contextManifestIdentity }),
    input.dayBucket ?? new Date().toISOString().slice(0, 10),
  ].join('|');

  return `ace:packet:${hashStr(raw)}`;
}

/**
 * Canonicalize output-affecting generation controls before binding them to an
 * exact-answer packet key. Nested tool-choice objects are sorted by the shared
 * Parent Atlas serializer, so equivalent objects cannot diverge by property order.
 */
export function buildAceGenerationControlsSignatureV1(input: {
  temperature: number;
  maxTokens: number;
  topP?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  toolChoice?: unknown;
}): string {
  return canonicalSha256V1({
    schema: 'atlas.ace-generation-controls.v1',
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    topP: input.topP ?? null,
    presencePenalty: input.presencePenalty ?? null,
    frequencyPenalty: input.frequencyPenalty ?? null,
    toolChoice: input.toolChoice ?? null,
  });
}

export type AceExactAnswerCacheAdmissionV1 =
  | { admitted: true; manifestIdentityChecksum: string }
  | { admitted: false; reason: string };

/**
 * Fail-closed admission for exact answer reuse. The legacy ACE manifest and
 * compact packet key are intentionally insufficient for this decision: an
 * answer may be reused only when the complete V2 evidence/runtime identity
 * and the exact rendered request are available.
 */
export function assessAceExactAnswerCacheAdmissionV1(input: {
  contextManifestV2?: unknown;
  modelRevision?: string | null;
  chatTemplateRevision?: string | null;
  toolSchemaRevision?: string | null;
  promptTemplateRevision?: string | null;
  renderedRequestChecksum?: string | null;
  generationControlsSignature?: string | null;
}): AceExactAnswerCacheAdmissionV1 {
  const manifest = input.contextManifestV2;
  if (!manifest || typeof manifest !== 'object') {
    return { admitted: false, reason: 'MISSING_CONTEXT_MANIFEST_V2' };
  }

  const value = manifest as Record<string, unknown>;
  if (
    value.schema !== 'atlas.context-manifest.v2' ||
    typeof value.identityChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(value.identityChecksum)
  ) {
    return { admitted: false, reason: 'INVALID_CONTEXT_MANIFEST_V2' };
  }

  const identityInput = value.identityInput;
  const evidenceRevisions =
    identityInput && typeof identityInput === 'object'
      ? (identityInput as Record<string, unknown>).evidenceRevisions
      : null;
  if (!evidenceRevisions || typeof evidenceRevisions !== 'object') {
    return { admitted: false, reason: 'MISSING_EVIDENCE_REVISIONS' };
  }

  for (const revisionName of [
    'sourceRevision',
    'representationRevision',
    'featureRevision',
    'ontologyRevision',
    'modelRevision',
    'promptTemplateRevision',
  ]) {
    const revision = (evidenceRevisions as Record<string, unknown>)[revisionName];
    if (typeof revision !== 'string' || revision.trim().length === 0) {
      const reasonName = revisionName.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
      return { admitted: false, reason: `MISSING_${reasonName}` };
    }
  }

  if (input.modelRevision !== (evidenceRevisions as Record<string, unknown>).modelRevision) {
    return { admitted: false, reason: 'MODEL_REVISION_MISMATCH' };
  }
  if (input.promptTemplateRevision !== (evidenceRevisions as Record<string, unknown>).promptTemplateRevision) {
    return { admitted: false, reason: 'PROMPT_TEMPLATE_REVISION_MISMATCH' };
  }

  const requiredRuntimeFields: Array<[string, unknown]> = [
    ['modelRevision', input.modelRevision],
    ['chatTemplateRevision', input.chatTemplateRevision],
    ['toolSchemaRevision', input.toolSchemaRevision],
    ['promptTemplateRevision', input.promptTemplateRevision],
    ['renderedRequestChecksum', input.renderedRequestChecksum],
    ['generationControlsSignature', input.generationControlsSignature],
  ];
  for (const [name, valueToCheck] of requiredRuntimeFields) {
    if (typeof valueToCheck !== 'string' || valueToCheck.trim().length === 0) {
      return { admitted: false, reason: `MISSING_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}` };
    }
  }

  return { admitted: true, manifestIdentityChecksum: value.identityChecksum };
}

/**
 * Builds the completion key for a caller that has passed strict V2 admission.
 * Throwing on failed admission is intentional: a V2 caller must rebuild from
 * canonical evidence instead of silently falling back to a legacy key.
 */
export function buildAceRevisionedExactAnswerCacheKeyV1(input: {
  contextManifestV2?: unknown;
  userQueryHash: string;
  modelRevision?: string | null;
  chatTemplateRevision?: string | null;
  toolSchemaRevision?: string | null;
  promptTemplateRevision?: string | null;
  renderedRequestChecksum?: string | null;
  generationControlsSignature?: string | null;
}): string {
  const admission = assessAceExactAnswerCacheAdmissionV1(input);
  if (!admission.admitted) {
    throw new Error(`ACE_EXACT_CACHE_NOT_ADMISSIBLE:${admission.reason}`);
  }
  return `ace:completion:v2:${canonicalSha256V1({
    schema: 'atlas.ace-revisioned-exact-answer-key.v1',
    manifestIdentityChecksum: admission.manifestIdentityChecksum,
    userQueryHash: input.userQueryHash,
    modelRevision: input.modelRevision,
    chatTemplateRevision: input.chatTemplateRevision,
    toolSchemaRevision: input.toolSchemaRevision,
    promptTemplateRevision: input.promptTemplateRevision,
    renderedRequestChecksum: input.renderedRequestChecksum,
    generationControlsSignature: input.generationControlsSignature,
  })}`;
}

/**
 * The completion cache key must include the user query hash so the packet
 * can be reused across different queries while final answers remain distinct.
 */
export function buildAceCompletionCacheKey(packetKey: string, userQueryHash: string) {
  return packetKey.replace('ace:packet:', 'ace:completion:') + `:${userQueryHash}`;
}

/**
 * Build the ACE preflight cache key from every input that can change the
 * selected preflight cards. This is still a derived preflight cache key; it
 * is not a substitute for the complete ContextManifestV2 prompt identity.
 */
export function buildAcePromptPreflightCacheKeyV1(input: {
  query: string;
  pipeline: string;
  modelRevision: string;
  systemPromptHash: string;
  toolDefinitionsHash: string;
  repositoryRevision: string;
  backend: string;
  caseId?: string;
  filePath?: string;
  sourceRefs?: readonly string[];
  chunkIds?: readonly string[];
  packetKeys?: readonly string[];
  contextManifestIdentity?: unknown;
}): string {
  const normalized = {
    schema: 'atlas.ace-prompt-preflight-cache-key.v1',
    query: input.query,
    pipeline: input.pipeline,
    modelRevision: input.modelRevision,
    systemPromptHash: input.systemPromptHash,
    toolDefinitionsHash: input.toolDefinitionsHash,
    repositoryRevision: input.repositoryRevision,
    backend: input.backend,
    caseId: input.caseId ?? null,
    filePath: input.filePath ?? null,
    sourceRefs: [...new Set(input.sourceRefs ?? [])].sort(),
    chunkIds: [...new Set(input.chunkIds ?? [])].sort(),
    packetKeys: [...new Set(input.packetKeys ?? [])].sort(),
    contextManifestIdentity: input.contextManifestIdentity ?? null,
  };
  return `ace:ctx:${hashStr(JSON.stringify(normalized))}`;
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

