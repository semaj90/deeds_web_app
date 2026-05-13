/**
 * ACE (Agentic Contextual Engineering) — Core Types
 *
 * Defines the data structures for adaptive prompt assembly,
 * self-evaluation, and tag generation.
 */
import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

export interface ACEUserProfile {
	userId: string;
	topIntents: string[];
	preferredTone: 'formal' | 'concise' | 'explanatory';
	avgLatencyMs: number;
	cacheHitRate: number;
	recentQueries: Array<{ hash: string; preview: string }>;
	practiceAreas: string[];
	jurisdiction: string | null;
	experienceLevel: string | null;
}

export type ACEPolicyAction =
  | 'answer_direct'
  | 'fill_parameters'
  | 'expand_retrieval'
  | 'call_web_search'
  | 'ask_clarification'
  | 'escalate_model';

export type ACEBudgetTier = 'small' | 'medium' | 'large' | 'authority_heavy' | 'web_augmented';

export type ACEParameterSource =
  | 'user_message'
  | 'active_case'
  | 'parameter_hint'
  | 'case_context'
  | 'chat_history'
  | 'entity_extraction'
  | 'kag'
  | 'rag'
  | 'web_search';

export interface ACEParameterCompletion {
  args: Record<string, unknown>;
  sources: Record<string, ACEParameterSource>;
  confidence: Record<string, number>;
  missing: string[];
  filled: Record<string, boolean>;
}

export interface ACEBudgetProfile {
  tier: ACEBudgetTier;
  allocations: typeof TOKEN_BUDGET;
  limits: {
    glossaryEntries: number;
    kbChunkCount: number;
    caseChunkCount: number;
    mergedChunkCount: number;
    chunkChars: number;
    kagNeighborCount: number;
    chatHistoryMessages: number;
    chatMessageChars: number;
    chatMemoryCount: number;
    evidenceMetadataCount: number;
    evidenceConnectionCount: number;
    codebaseContextCount: number;
  };
}

export interface ACEPolicyDecision {
  action: ACEPolicyAction;
  confidence: number;
  retrievalConfidence: number;
  reasons: string[];
  missingParameters: string[];
  allowWebSearch: boolean;
  budget: ACEBudgetProfile;
}

export type ACECachePlannerTrace = {
  hit: boolean;
  source: 'redis' | 'postgres' | 'local' | 'miss';
  cacheKey: string;
  contextHash: string;
  deltaFields: string[];
  retrievalModeHash: string;
  sectionTypesHash: string;
  tokenAwarePacking: boolean;
};

/**
 * Per-chunk scoring breakdown from the post-retrieval rerank pipeline.
 * All component scores are additive boosts above the base semantic score.
 * Persisted alongside chunk hits for RL feedback loop (context_timeline).
 */
export interface RerankBreakdown {
  /** Base cosine / cross-encoder semantic score */
  semantic: number;
  /** Boost from Qdrant tag overlap with inferred query tags */
  qdrantTag: number;
  /** Boost from GPU cluster coherence (same cluster as top result) */
  cluster: number;
  /** Boost from SOM cell proximity (same BMU row/col) */
  som: number;
  /** Boost from PageRank top-file list membership */
  pagerank: number;
  /** Boost from BoW term overlap with cluster texture tile */
  bow: number;
  /** Boost from paired test file presence */
  pairedTest: number;
  /** Boost from chunk being under the resolved AGENTS.md directory (≤0.05 cap) */
  sameAgentsDir?: number;
  /** Boost from manifold4 quaternion similarity to top candidate (≤0.06 cap) */
  quaternion?: number;
  /** Final composite score (semantic + all boosts) */
  final: number;
}

export interface ACEContext {
  /** User behavioral profile from analytics */
  userProfile: ACEUserProfile | null;
  /** Case context string (from DB load) */
  caseContext: string | null;
  /** Matched glossary or definition entries relevant to the current query */
  glossaryMatches: Array<{
    id: string | null;
    term: string;
    definition: string;
    source: 'legal_glossary' | 'legal_definitions';
    category: string | null;
    jurisdiction: string | null;
    citation: string | null;
    confidence: number | null;
    sourceNodeId: string | null;
  }> | null;
  /** RAG chunks from Qdrant vector search (merged KB + Case for backward compat) */
  ragChunks: UnifiedRetrievalResult[];
  /** Knowledge base chunks — statutes, glossary, templates, doctrine (stable, heavily cached) */
  kbChunks: UnifiedRetrievalResult[];
  /** Case/evidence chunks — uploaded PDFs, notes, POI data (case-scoped, invalidates often) */
  caseChunks: UnifiedRetrievalResult[];
  /** Documentation chunks - external guides, manuals, and docs */
  docChunks: UnifiedRetrievalResult[];
  /** KAG graph neighbors from Neo4j or PostgreSQL */
  kagNeighbors: Array<{ nodeId: string; title: string; relationship: string; score?: number }>;
  /** Chat history (recent turns) */
  chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Semantic recall across ALL past sessions — not just the current conversation.
   *  Populated from Qdrant chat_messages collection by cosine similarity on the query. */
  chatMemory?: Array<{
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    score: number;
  }>;
  /** NER-extracted entities from the current query */
  entities: {
    statutes: string[];
    cases: string[];
    persons: string[];
    organizations: string[];
    dates: string[];
  };
  /** Practice area template (auto-selected or user-specified) */
  practiceTemplate: string | null;
  /** Auto-generated tags for the current query */
  queryTags: string[];
  /** Cache-planner metadata for the current assembled context */
  cachePlanner?: ACECachePlannerTrace | null;
  /** Web search results formatted as context (optional) */
  webSearchContext: string | null;
  /** Active persona for style adaptation */
  persona: string;
  /** Evidence metadata from case (types, forensic flags, entities, summaries) */
  evidenceMetadata: Array<{
    id: string;
    title: string;
    evidenceType: string;
    fileType: string;
    forensicFlags: Array<{ type: string; severity: string }>;
    entities: Array<{ text: string; label: string }>;
    summary?: string;
  }> | null;
  /** Evidence board connections/relationships between evidence items */
  evidenceConnections: Array<{
    fromTitle: string;
    toTitle: string;
    connectionType: string;
    label: string | null;
    notes: string | null;
    strength: number;
  }> | null;
  /** User analytics context (search patterns, graph neighbors, similar queries) */
  userAnalyticsContext: string | null;
  /** Codebase/AST context from dual-vector semantic search (optional) */
  codebaseContext: Array<{
    filePath: string;
    content: string;
    score: number;
    lineStart?: number;
    lineEnd?: number;
    tags?: string[];
    gpuCluster?: number | null;
    pageRankScore?: number | null;
    routeType?: string | null;
    hasAuthGuard?: boolean | null;
    somCluster?: number | null;
    somBmuRow?: number | null;
    somBmuCol?: number | null;
    /** Normalised composite authority score mirrored from GDS nightly job via Qdrant payload */
    graphAuthorityScore?: number | null;
    /** 64d encoded similarity score from the autoencoder rerank lane */
    encoded64Score?: number | null;
    /** Optional cluster PageRank value if preloaded from Redis */
    clusterPagerank?: number | null;
    /** Optional Karpathy blend value if preloaded from Redis */
    karpathyBlend?: number | null;
    /** Louvain communityId written by graphify:gds, mirrored via Qdrant payload patch */
    communityId?: string | null;
    /** Directory summary mirrored from AGENTS.md directory cards (L4 lane) */
    dirSummary?: string | null;
    /** Resolved AGENTS.md card ID (agents:dir:*) */
    agentsCardId?: string | null;
    rerankBreakdown?: RerankBreakdown | null;
    /** Stable content-addressed key for this chunk (used by code-intel/search) */
    stableKey?: string | null;
    /** Topology class label (api-route, ui-component, etc.) */
    topoClass?: string | null;
    /** Precomputed LLM output for this path from code-llm-index Redis cache */
    cachedLlmOutput?: string | null;
    /** Source pipeline of the cached LLM output */
    cachedLlmSource?: 'ace' | 'gemma4-summary' | 'kag' | 'rag' | 'agent' | 'other' | null;
  }> | null;
  /** GPU cluster narratives (compiled knowledge from k-means clustering) */
  clusterNarratives?: Array<{
    clusterId: number;
    purpose: string;
    patterns: string[];
    keyFiles: string[];
  }> | null;
  /**
   * VLM-synthesised narrative for the top cluster hit in the current query (Step 6).
   * Prepended to the codebase context block in the LLM system prompt.
   */
  activeClusterSummary?: {
    clusterId: number;
    summary: string;
    purpose: string;
    patterns: string[];
    keyFiles: string[];
    warnings: string[];
  } | null;
  /** Deterministic policy decision used to size context and route tools */
  policyDecision: ACEPolicyDecision | null;
  /**
   * nes-arch path-first directory context (agents.md spec).
   */
  agentsMd?: {
    resolvedKey: string;
    requestedPath: string;
    resolvedDir: string;
    markdown: string;
    ttlSeconds: number | null;
    fallbackToRoot: boolean;
  } | null;
  codeLlmHit?: {
    path: string;
    source: 'ace' | 'gemma4-summary' | 'kag' | 'rag' | 'agent' | 'other';
    llmOutput: string;
    priorHits: number;
    glyphClusterId?: number;
    generatedAt: string;
    tokenCount?: number;
  } | null;
  retrievalTrace?: {
    cachePlanner?: ACECachePlannerTrace;
    topoPrefilter?: {
      used: boolean;
      queryClass: string;
      topoClass: number;
      cacheHit: boolean;
      candidateCount: number;
      candidateReduction: string | null;
      queryHash: string;
    };
    hmm?: {
      stableKey: string;
      flowScore: number;
      dominantSection: string;
      fromCache: boolean;
      analysisMs: number;
    };
    adaptiveRecommendations?: any;
    tileEngine?: TileEngineTrace | null;
  };
  /**
   * Per-cluster Qdrant tag context for the current retrieval pass.
   */
  clusterContext?: ClusterContextPacket[] | null;
  multiLaneOutput?: any;
  multiLane?: {
    knownError: boolean;
    priorFix?: string;
    topFiles: string[];
    topSymbols: string[];
    lanesHit: string[];
    synthesisBlock: string;
    durationMs: number;
  } | null;
  dbSchemaContext?: string;
  aceContextPacket?: any;
}

/**
 * Per-cluster Qdrant tag summary scoped to the current ACE query.
 */
export interface ClusterContextPacket {
  clusterId: number;
  clusterKey?: string;
  topoClass: string;
  topoClasses?: string[];
  topTags: string[];
  chunkCount: number;
  topFiles?: string[];
  synthesisSuggestion: string;
  summary?: string;
  purpose?: string;
  riskLevel?: string;
  protocols?: string[];
  communityId?: string | null;
  graphAuthorityScore?: number | null;
  summaryLens?: string;
  topoLabel?: string;
}

export interface TileEngineTrace {
  hmmState: string;
  hmmConfidence: number;
  queryHash: string;
  tileMap: {
    somRow: number | null;
    somCol: number | null;
    neighboringTilesLoaded: number;
  };
  texture: {
    bowClusterBiasUsed: boolean;
    matchedTerms: string[];
  };
  quaternion: {
    used: boolean;
    score: number;
    axisWeights: [number, number, number, number];
  };
  graphSort: {
    used: boolean;
    pagerankUsed: boolean;
    hyperedgeUsed: boolean;
  };
  prefetch: {
    used: boolean;
    chunks: number;
    summaries: number;
    tools: number;
  };
}

export type TrustTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface TrustMeta {
  tier: TrustTier;
  instructionAuthority: boolean;
  sourceUri: string;
  contentHash: string;
  sanitized: boolean;
  injectionSignals?: string[];
}

export function codeChunkTrustMeta(sourceUri: string, contentHash: string): TrustMeta {
  return { tier: 'T3', instructionAuthority: false, sourceUri, contentHash, sanitized: false };
}

export function systemTrustMeta(sourceUri: string, contentHash: string): TrustMeta {
  return { tier: 'T1', instructionAuthority: true, sourceUri, contentHash, sanitized: false };
}

export type LaneId =
  | 'L0'
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'L6'
  | 'L7'
  | 'L8'
  | 'L9'
  | 'L10'
  | 'L11'
  | 'hash'
  | 'sparse'
  | 'graph'
  | 'ace_cache'
  | 'symbol'
  | 'dense'
  | 'topology'
  | 'wiki'
  | 'error'
  | 'task'
  | 'research'
  | 'web_search';

export const LANE_DEFAULT_TRUST_TIER: Record<LaneId, TrustTier> = {
  L0: 'T1',
  L1: 'T3',
  L2: 'T3',
  L3: 'T2',
  L4: 'T1',
  L5: 'T2',
  L6: 'T2',
  L7: 'T3',
  L8: 'T1',
  L9: 'T1',
  L10: 'T4',
  L11: 'T1',
  hash: 'T2',
  sparse: 'T3',
  graph: 'T3',
  ace_cache: 'T2',
  symbol: 'T3',
  dense: 'T3',
  topology: 'T2',
  wiki: 'T1',
  error: 'T2',
  task: 'T1',
  research: 'T3',
  web_search: 'T4',
};

export const TRUST_SCORE_MULTIPLIER: Record<TrustTier, number> = {
  T1: 1.2,
  T2: 1.0,
  T3: 0.95,
  T4: 0.7,
  T5: 0.6,
};

export const TOKEN_BUDGET = {
  system: 300,
  caseContext: 800,
  glossary: 250,
  ragChunks: 1200,
  evidenceMetadata: 400,
  evidenceConnections: 300,
  kagNeighbors: 400,
  chatHistory: 800,
  chatMemory: 500,
  userProfile: 150,
  codebaseContext: 400,
  selfPrompt: 100,
  total: 5600,
} as const;

export interface ACEPrompt {
  systemPrompt: string;
  contextWindow: string;
  maxTokenBudget: number;
  confidenceFactors: Record<string, number>;
  selfPromptInstructions: string | null;
  preferredBackend: 'tensorrt' | 'ollama' | 'auto';
  budgetProfile: ACEBudgetProfile;
  policyDecision: ACEPolicyDecision;
}

export interface SelfEvaluation {
  quality: number;
  completeness: number;
  accuracy: number;
  suggestions: string[];
  shouldRetry: boolean;
  evalMs: number;
}

export interface GeneratedTag {
  label: string;
  category: 'statute' | 'case_law' | 'entity' | 'practice_area' | 'topic' | 'jurisdiction';
  confidence: number;
  source: 'regex' | 'ner' | 'llm' | 'manual';
}

export interface SemanticTile {
  id: string;
  kind: 'chunk' | 'summary' | 'trace' | 'tool' | 'graph_node';
  text?: string;
  tags?: string[];
  som?: { row: number; col: number; cluster?: number };
  bow?: { matchedTerms?: string[]; weightedScore?: number };
  manifold4?: [number, number, number, number];
  manifold4_q?: [number, number, number, number];
  graph?: { pagerank?: number; hyperedgeWeight?: number; fastAstScore?: number };
  memory?: { gainScore?: number; accepted?: boolean; cacheHit?: boolean };
  score?: number;
  why?: string[];
}

export const TILE_SCORE_WEIGHTS = {
  qdrant: 0.35,
  graph: 0.18,
  hyperedge: 0.12,
  som_adjacency: 0.1,
  bow_texture: 0.1,
  quaternion: 0.1,
  memory_gain: 0.05,
} as const;
