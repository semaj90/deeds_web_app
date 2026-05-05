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
    rerankBreakdown?: RerankBreakdown | null;
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
