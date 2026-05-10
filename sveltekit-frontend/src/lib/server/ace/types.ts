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
    /** Louvain communityId written by graphify:gds, mirrored via Qdrant payload patch */
    communityId?: string | null;
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
   * Populated when assembleACEContext receives a `filePath` opt — walks UP to
   * the nearest AGENTS.md in Redis (`agents:dir:*`) and returns the rendered
   * markdown with audit summary. Sub-5ms hit before any expensive retrieval.
   * Rendered FIRST in the LLM prompt so the model knows the directory's
   * conventions, audit warnings, and dominant tags before reading chunks.
   */
  agentsMd?: {
    /** Resolved Redis key, e.g. "agents:dir:src/lib/server/ace" */
    resolvedKey: string;
    /** Original requested path (file or dir) */
    requestedPath: string;
    /** Directory the resolver landed on (after walk-up) */
    resolvedDir: string;
    /** Pre-rendered AGENTS.md markdown content */
    markdown: string;
    /** Cache freshness — null if Redis missing the key */
    ttlSeconds: number | null;
    /** Whether this is a fallback to the repo-root AGENTS.md */
    fallbackToRoot: boolean;
  } | null;
  /**
   * Path-level LLM output cache hit (code-llm-index, NES Tiny RAM tier).
   * Sub-5ms exact-match recall of the last successful LLM synthesis for the
   * exact filePath the user is asking about. More specific than agentsMd:
   * agentsMd is per-directory, codeLlmHit is per-file. When present, prompt
   * builder injects "PRIOR ANSWER:" block above raw chunks so the model can
   * reuse or refine the cached output instead of re-deriving from scratch.
   */
  codeLlmHit?: {
    /** Canonical normalised path */
    path: string;
    /** Pipeline that generated the cached output */
    source: 'ace' | 'gemma4-summary' | 'kag' | 'rag' | 'agent' | 'other';
    /** Cached LLM synthesis */
    llmOutput: string;
    /** Hit count BEFORE this lookup (informative for staleness heuristics) */
    priorHits: number;
    /** Glyph cluster this entry belongs to, if known */
    glyphClusterId?: number;
    /** When the cached output was generated */
    generatedAt: string;
    /** Token count of the cached output */
    tokenCount?: number;
  } | null;
  /**
   * TRACE retrieval diagnostics — surfaced in the retrieval timeline UI.
   * Populated by fetchACPKnowledgeResults when a topo prefilter was applied.
   */
  retrievalTrace?: {
    topoPrefilter?: {
      used:               boolean;
      queryClass:         string;
      topoClass:          number;
      cacheHit:           boolean;
      candidateCount:     number;
      /** "32753 → 83" — shows reduction before expensive ANN sweep */
      candidateReduction: string | null;
      queryHash:          string;
    };
    /** HMM 4D wiki note logged to wiki:note:hmm:* after assembly */
    hmm?: {
      stableKey:       string;
      flowScore:       number;
      dominantSection: string;
      fromCache:       boolean;
      analysisMs:      number;
    };
    /** MapReduce adaptive prefetch recommendations — chunk/tool warm-up for Gemma4's next call */
    adaptiveRecommendations?: import('./adaptive-prefetch.js').AdaptiveRecommendations | null;
    /** Full tile-engine audit trace — HMM state, SOM tile map, BoW, quaternion, graph, prefetch */
    tileEngine?: TileEngineTrace | null;
  };
  /**
   * Per-cluster Qdrant tag context for the current retrieval pass.
   * Only populated when codebase context is enabled and at least one
   * codebase chunk carried a gpuCluster payload field.  Closes gap_rel_004:
   * llm_synthesis can now read cluster tag metadata for domain summarisation.
   */
  clusterContext?: ClusterContextPacket[] | null;
  /** Multi-lane parallel retrieval output (allSettled — degradation-safe) */
  multiLaneOutput?: import('./retrieval-lanes.js').MultiLaneOutput | null;
  /** Error-aware multi-lane results: hash exact-match + n-gram recall + graph expansion.
   *  Populated when query matches error pattern or codebase context is enabled.
   *  knownError=true means the hash lane found a prior fingerprint → priorFix may be set. */
  multiLane?: {
    knownError: boolean;
    priorFix?: string;
    topFiles: string[];
    topSymbols: string[];
    lanesHit: string[];
    synthesisBlock: string;
    durationMs: number;
  } | null;
}

export interface ACEPrompt {
  /** Complete system prompt with all context */
  systemPrompt: string;
  /** Assembled context window for injection */
  contextWindow: string;
  /** Max tokens allocated for this prompt */
  maxTokenBudget: number;
  /** Confidence factors for each context source */
  confidenceFactors: Record<string, number>;
  /** Self-prompt instructions appended for quality control */
  selfPromptInstructions: string | null;
  /** Which inference backend to prefer */
  preferredBackend: 'tensorrt' | 'ollama' | 'auto';
  /** Budget profile selected for this prompt */
  budgetProfile: ACEBudgetProfile;
  /** Policy decision that produced the prompt budget */
  policyDecision: ACEPolicyDecision;
}

export interface SelfEvaluation {
  /** Overall quality score 0-1 */
  quality: number;
  /** How complete the answer is 0-1 */
  completeness: number;
  /** Estimated factual accuracy 0-1 */
  accuracy: number;
  /** Improvement suggestions */
  suggestions: string[];
  /** Whether to retry with correction prompt */
  shouldRetry: boolean;
  /** Time taken for evaluation in ms */
  evalMs: number;
}

export interface GeneratedTag {
  label: string;
  category: 'statute' | 'case_law' | 'entity' | 'practice_area' | 'topic' | 'jurisdiction';
  confidence: number;
  source: 'regex' | 'ner' | 'llm' | 'manual';
}

/**
 * Unified memory unit type — all rerankers operate on SemanticTile[].
 *
 * Tiles are the shared vocabulary for: codebase chunks, legal chunks,
 * accepted LLM summaries, graph nodes, tool call traces, and cluster
 * summaries.  Every pipeline stage adds fields and a component score;
 * the final `score` and `why` are the product of all stages.
 *
 * Pipeline:
 *   Qdrant retrieval → SOM tile map → BoW texture → quaternion orientation
 *     → graph rerank → memory-gain boost → SemanticTile.score
 */
export interface SemanticTile {
  /** Canonical chunk / summary / node ID */
  id:   string;
  kind: 'chunk' | 'summary' | 'trace' | 'tool' | 'graph_node';

  text?: string;
  tags?: string[];

  /** SOM grid position and cluster assignment */
  som?: {
    row:      number;
    col:      number;
    cluster?: number;
  };

  /** BoW texture signal for this tile */
  bow?: {
    matchedTerms?:  string[];
    weightedScore?: number;
  };

  /**
   * Raw manifold4 = [som_x, som_y, semantic_z, grpo_w].
   * Must be standardised before quaternion comparison — see standardiseManifold4().
   */
  manifold4?:   [number, number, number, number];
  /** Unit quaternion on S³ — angular retrieval geometry */
  manifold4_q?: [number, number, number, number];

  /** Graph signals (from Qdrant payload + Neo4j) */
  graph?: {
    pagerank?:       number;
    hyperedgeWeight?: number;
    fastAstScore?:   number;
  };

  /** Memory / RL gain signals (from llm_summaries + context_timeline) */
  memory?: {
    gainScore?: number;
    accepted?:  boolean;
    cacheHit?:  boolean;
  };

  /** Final composite score and explanation labels */
  score?: number;
  why?:  string[];
}

/**
 * Scoring weights used to compute SemanticTile.score.
 *
 * All weights sum to 1.0.  HMM section bias adjusts the effective weights
 * at runtime (e.g. LEGAL_AUTHORITY raises quaternion+graph; FACTS raises
 * som_adjacency+bow; CLAIMS raises memory_gain).
 */
export const TILE_SCORE_WEIGHTS = {
  qdrant:       0.35,
  graph:        0.18,
  hyperedge:    0.12,
  som_adjacency: 0.10,
  bow_texture:  0.10,
  quaternion:   0.10,
  memory_gain:  0.05,
} as const;

/**
 * Retrieval trace for the semantic tile engine.
 * Logged under `ACEContext.retrievalTrace.tileEngine` so every query has
 * an auditable record of which pipeline stages fired and what they produced.
 */
export interface TileEngineTrace {
  hmmState:      string;
  hmmConfidence: number;
  queryHash:     string;

  tileMap: {
    somRow:                 number | null;
    somCol:                 number | null;
    neighboringTilesLoaded: number;
  };

  texture: {
    bowClusterBiasUsed: boolean;
    matchedTerms:       string[];
  };

  quaternion: {
    used:        boolean;
    score:       number;
    /** [w=reward, x=som_x, y=som_y, z=semantic_z] scale factors from hmmAxisMultiplier */
    axisWeights: [number, number, number, number];
  };

  graphSort: {
    used:          boolean;
    pagerankUsed:  boolean;
    hyperedgeUsed: boolean;
  };

  prefetch: {
    used:      boolean;
    chunks:    number;
    summaries: number;
    tools:     number;
  };
}

/**
 * Per-cluster Qdrant tag summary scoped to the current ACE query.
 * Built from the codebase context hits that were retrieved — only clusters
 * present in this retrieval pass are included.  Injected into the
 * llm_synthesis step so cluster-aware domain summaries can be generated.
 */
export interface ClusterContextPacket {
  clusterId: number;
  /** Composite cluster key matching Qdrant payload, e.g. "cluster:gpu:6" */
  clusterKey?: string;
  /** Human-readable topo class label derived from the dominant tag */
  topoClass: string;
  /** Domain labels from the topology (e.g. ["server", "ace"]) */
  topoClasses?: string[];
  /** Top Qdrant tags by frequency across chunks in this cluster */
  topTags: string[];
  /** Number of chunks from this cluster in the current retrieval pass */
  chunkCount: number;
  /** Top files from the qdrant_cluster_tags artifact (global cluster view) */
  topFiles?: string[];
  /** Synthesis prompt hint built from topoClass + topTags */
  synthesisSuggestion: string;
  /**
   * Louvain community id written by graphify:gds.
   * Groups this cluster with others sharing a structural community in the
   * IMPORTS/SIMILAR_TOPOLOGY graph — useful for cross-cluster synthesis.
   */
  communityId?: string | null;
  /**
   * Composite GDS authority score (0-1) for the cluster's representative file.
   * 0.35×normPageRank + 0.25×normFanIn + 0.15×topoTrust + 0.15×testCoverage – 0.10×riskPenalty.
   * Populated from Redis ace:authority:top after graphify:gds runs.
   */
  graphAuthorityScore?: number | null;
  /** One-sentence synthesis lens from synthesize-next-actions.mjs (set by graph:synthesize) */
  summaryLens?: string;
  /** Alias for topoClass used by NES cluster rendering in context-assembler */
  topoLabel?: string;
}

// ── Trust-Tier types (HyperRAG §4) ───────────────────────────────────────────

/**
 * Trust tier for every retrieved chunk.
 *
 * T1 System        — AGENTS.md rules, hard-wired schema definitions. instructionAuthority=true.
 * T2 Agent-gen     — Synthesis memory, summary lenses, prior answers. Authority=false.
 * T3 Verified code — Qdrant codebase_chunks_768 (indexed committed files). Authority=false.
 * T4 External/web  — Web-fetched content, ACP cross-feed. Authority=false. MUST be sanitized.
 * T5 User input    — Chat messages, uploaded evidence text. Authority=false. MUST be sanitized.
 */
export type TrustTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface TrustMeta {
  /** Trust tier — determines synthesis fence placement */
  tier: TrustTier;
  /** True only for T1 (AGENTS.md / hard-wired rules). */
  instructionAuthority: boolean;
  /** File path, Qdrant point ID, or URL */
  sourceUri: string;
  /** sha256 hex of raw chunk text — for audit trail (context_timeline) */
  contentHash: string;
  /** True if T4/T5 chunk passed the injection-pattern sanitizer */
  sanitized: boolean;
  /** Detected injection-pattern labels, if any (from sanitizer) */
  injectionSignals?: string[];
}

/** Returns default T3 TrustMeta for indexed codebase chunks. */
export function codeChunkTrustMeta(sourceUri: string, contentHash: string): TrustMeta {
  return { tier: 'T3', instructionAuthority: false, sourceUri, contentHash, sanitized: false };
}

/** Returns default T1 TrustMeta for AGENTS.md / operator-authored rules. */
export function systemTrustMeta(sourceUri: string, contentHash: string): TrustMeta {
  return { tier: 'T1', instructionAuthority: true, sourceUri, contentHash, sanitized: false };
}

// ── Lane IDs (HyperRAG §3) ────────────────────────────────────────────────────

export type LaneId =
  | 'L0'   // topo-byte prefilter (Redis ace:topo:*)
  | 'L1'   // Qdrant dense ANN (content vector)
  | 'L2'   // Qdrant signature ANN
  | 'L3'   // summary lenses (summary_lenses_768)
  | 'L4'   // wiki / AGENTS.md notes (Redis wiki:note:* + agents:dir:*)
  | 'L5'   // synthesis memory (synthesis_memory_768)
  | 'L6'   // prior answers (Redis code:llm:* + ace:chunks:*)
  | 'L7'   // graph neighbors (Neo4j)
  | 'L8'   // PageRank authority (couchdb:pagerank_scores)
  | 'L9'   // feature atlas (Postgres feature_implementations)
  | 'L10'  // web / external corpus (ACP cross-feed)
  | 'L11'  // activity prefetch (panel_activity_log)
  // Legacy lane names kept for backward compat with multi-lane-retrieval.ts
  | 'hash' | 'sparse' | 'graph' | 'ace_cache' | 'symbol' | 'dense'
  | 'topology' | 'wiki' | 'error' | 'task' | 'research' | 'web_search';

/** Default trust tier for each lane */
export const LANE_DEFAULT_TRUST_TIER: Record<LaneId, TrustTier> = {
  L0:       'T1',
  L1:       'T3',
  L2:       'T3',
  L3:       'T2',
  L4:       'T1',
  L5:       'T2',
  L6:       'T2',
  L7:       'T3',
  L8:       'T1',
  L9:       'T1',
  L10:      'T4',
  L11:      'T1',
  hash:     'T2',
  sparse:   'T3',
  graph:    'T3',
  ace_cache:'T2',
  symbol:   'T3',
  dense:    'T3',
  topology: 'T2',
  wiki:     'T1',
  error:    'T2',
  task:       'T1',
  research:   'T3',
  web_search: 'T4',
};

/**
 * Karpathy trust multiplier applied after blend score.
 * T1 floats above code hits; T4/T5 demoted so web content
 * doesn't crowd out indexed code.
 */
export const TRUST_SCORE_MULTIPLIER: Record<TrustTier, number> = {
  T1: 1.20,
  T2: 1.00,
  T3: 0.95,
  T4: 0.70,
  T5: 0.60,
};

/** Token budget allocation per context source (expanded for 128K+ context models) */
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
