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
  userProfile: 150,
  codebaseContext: 400,
  selfPrompt: 100,
  total: 5100,
} as const;
