import { query as db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import type { PoolClient } from 'pg';

// HMM State Machine: represents intent classification + tool routing decision
export type HMMState =
  | 'UNKNOWN'
  | 'CODE_SEARCH'
  | 'SEMANTIC_SEARCH'
  | 'GRAPH_EXPAND'
  | 'VALIDATE'
  | 'SYNTHESIZE'
  | 'QUARANTINE';

// Tools available in the registry
export type ToolId =
  | 'trace.kag_search'           // Graph + KAG (graph/auth/retrieval domains)
  | 'trace.explain_retrieval'    // Retrieval explanation / rationale
  | 'atlas.topology_expand'      // SOM topology navigation (topology/retrieval)
  | 'neo4j.dependency_closure'   // Graph traversal (graph/analysis)
  | 'qdrant.dense_search'        // Vector search (retrieval/vector)
  | 'rg.lexical_search'          // Lexical fallback (lexical/search)
  | 'gemma4.explain_code';       // Synthesis (synthesis/explanation)

// Observation features for HMM state inference
export type ToolObservation = {
  query: string;                   // Original user query
  keywordScore: number;            // rg/BM25 lexical relevance (0-1)
  astScore: number;                // Code structure match (0-1)
  semanticScore: number;           // Embedding similarity (0-1)
  graphScore: number;              // Topology/dependency need (0-1)
  validationScore: number;         // Packet safety/completeness (0-1)
  toolSuccessRate: number;         // Historical success rate (0-1)
  latencyScore: number;            // Normalized latency (1=fast, 0=slow)
};

export type RoutingSignals = {
  intent?: string;
  domainClass?: string;
  intentConfidence?: number;
  domainConfidence?: number;
  intentProbabilities?: Record<string, number>;
  domainProbabilities?: Record<string, number>;
  analysisSource?: 'miniforge' | 'heuristic';
};

export type ToolCandidateResult = {
  tool_id: ToolId;
  name: string;
  score: number;
  hmm_state: HMMState;
  observation?: ToolObservation;
  domains: string[];
  ranked_tools?: Array<{ tool: ToolId; score: number }>;
};

/**
 * HMM Tool Router: Query intent classification → tool ranking → execution
 *
 * Architecture:
 * 1. computeObservation() — extract observation features from query + context
 * 2. inferHMMState() — classify intent as CODE_SEARCH | SEMANTIC_SEARCH | GRAPH_EXPAND | etc.
 * 3. rankTools() — score tools allowed in that state
 * 4. selectTool() — pick best tool, validate, execute or fallback
 *
 * Hard rules:
 * - QUARANTINE blocks execution (fallback to rg.lexical_search)
 * - validationScore < 0.2 → QUARANTINE
 * - Top-ranked tool must have score > 0 in allowed state
 */

/**
 * Map HMM states to allowed tools
 */
const STATE_TOOLS: Record<HMMState, ToolId[]> = {
  UNKNOWN: ['rg.lexical_search', 'qdrant.dense_search', 'trace.kag_search', 'trace.explain_retrieval'],
  CODE_SEARCH: ['rg.lexical_search', 'atlas.topology_expand', 'trace.kag_search', 'trace.explain_retrieval'],
  SEMANTIC_SEARCH: ['qdrant.dense_search', 'trace.kag_search', 'trace.explain_retrieval'],
  GRAPH_EXPAND: ['neo4j.dependency_closure', 'trace.kag_search', 'trace.explain_retrieval', 'atlas.topology_expand'],
  VALIDATE: ['qdrant.dense_search', 'rg.lexical_search'],
  SYNTHESIZE: ['gemma4.explain_code', 'trace.explain_retrieval'],
  QUARANTINE: ['rg.lexical_search'] // Fallback only
};

/**
 * HMM State Inference: Classify query intent from observations
 *
 * Rule-based MVP (deterministic, testable, no training needed)
 * Future: Full Viterbi with transition probabilities
 */
export function inferHMMState(obs: ToolObservation, signals?: RoutingSignals): HMMState {
  // Hard fail: validation score too low → quarantine
  if (obs.validationScore < 0.2) return 'QUARANTINE';

  const intent = signals?.intent?.trim();
  if (intent === 'task_board_action') return 'VALIDATE';
  if (intent === 'schema_lookup') return 'VALIDATE';
  if (intent === 'debug_error') return 'CODE_SEARCH';
  if (intent === 'symbol_lookup') return 'CODE_SEARCH';
  if (intent === 'dependency_trace') return 'GRAPH_EXPAND';
  if (intent === 'deep_research') return obs.graphScore > 0.55 ? 'GRAPH_EXPAND' : 'SEMANTIC_SEARCH';
  if (intent === 'code_explanation') return 'SYNTHESIZE';
  if (intent === 'missing_work') return 'GRAPH_EXPAND';

  // Intent classification via keyword + score patterns (check graph first — higher priority)
  const graphKeywords = /depends?|calls?|imports?|uses?|connected|flows?|related|implements?|references?|what does.*depend|what.*call/i;
  const codeKeywords = /where|function|route|file|defined|class|method|handler|import|export|line/i;
  const semanticKeywords = /similar|related|concept|meaning|like|analogy|pattern|example/i;

  // Strong signals: high scores override keywords (graph takes priority)
  if (obs.graphScore > 0.7 || graphKeywords.test(obs.query)) {
    return 'GRAPH_EXPAND';
  }
  if (obs.astScore > 0.75 || codeKeywords.test(obs.query)) {
    return 'CODE_SEARCH';
  }
  if (obs.semanticScore > 0.7 || semanticKeywords.test(obs.query)) {
    return 'SEMANTIC_SEARCH';
  }

  // Synthesis only if validation is high
  if (obs.validationScore > 0.8) return 'SYNTHESIZE';

  // Default: unknown intent
  return 'UNKNOWN';
}

/**
 * Tool Ranking: Score tools allowed in current HMM state
 *
 * Each tool gets a composite score based on observation features.
 * RRF can fuse multiple ranked lists from different routes.
 */
export function rankTools(obs: ToolObservation, signals?: RoutingSignals): Array<{ tool: ToolId; score: number }> {
  const state = inferHMMState(obs, signals);
  const allowed = new Set(STATE_TOOLS[state]);

  // Score each tool by relevant observation features
  const intent = signals?.intent ?? '';
  const domainClass = signals?.domainClass ?? '';
  const intentConfidence = signals?.intentConfidence ?? 0;
  const domainConfidence = signals?.domainConfidence ?? 0;
  const scores: Array<{ tool: ToolId; score: number }> = [
    // Lexical search: keyword + AST match
    {
      tool: 'rg.lexical_search',
      score: 0.45 * obs.keywordScore + 0.35 * obs.astScore + (intent === 'symbol_lookup' ? 0.15 : 0) + (domainClass === 'retrieval' ? 0.05 * domainConfidence : 0)
    },
    // AST/code structure (implicit in topology_expand)
    {
      tool: 'atlas.topology_expand',
      score: 0.65 * obs.astScore + 0.2 * obs.graphScore + (intent === 'dependency_trace' || intent === 'missing_work' ? 0.15 * intentConfidence : 0)
    },
    // Dense vector similarity
    {
      tool: 'qdrant.dense_search',
      score: 0.75 * obs.semanticScore + 0.15 * obs.keywordScore + (intent === 'deep_research' ? 0.1 * intentConfidence : 0)
    },
    // Graph traversal: graph + validation
    {
      tool: 'neo4j.dependency_closure',
      score: 0.75 * obs.graphScore + 0.15 * obs.validationScore + (intent === 'dependency_trace' ? 0.1 * intentConfidence : 0)
    },
    // KAG: balanced multi-signal
    {
      tool: 'trace.kag_search',
      score: 0.35 * obs.semanticScore + 0.35 * obs.graphScore + 0.2 * obs.keywordScore + (intent === 'deep_research' || intent === 'missing_work' ? 0.1 * intentConfidence : 0)
    },
    // Retrieval explanation: favors multi-signal explanations over pure search
    {
      tool: 'trace.explain_retrieval',
      score: 0.3 * obs.semanticScore + 0.25 * obs.graphScore + 0.2 * obs.keywordScore + 0.15 * obs.validationScore + (intent === 'code_explanation' || intent === 'deep_research' ? 0.15 * intentConfidence : 0)
    },
    // Code synthesis: high validation only
    {
      tool: 'gemma4.explain_code',
      score: obs.validationScore > 0.8 || intent === 'code_explanation' ? Math.max(0.6 * obs.validationScore, 0.7 * intentConfidence) : 0
    }
  ];

  return scores
    .filter((x) => allowed.has(x.tool) && x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Select best tool: State classification → ranking → return top choice
 */
export async function selectTool(
  userQuery: string,
  queryEmbedding: number[],
  topK: number = 5,
  pool?: PoolClient,
  signals?: RoutingSignals
): Promise<ToolCandidateResult> {
  const hasEmbedding = Array.isArray(queryEmbedding) && queryEmbedding.length === 384;

  try {
    // Compute observation features
    const obs = computeObservationFromQuery(userQuery, signals);

    // Infer HMM state
    const state = inferHMMState(obs, signals);

    // Hard gate: quarantine blocks all execution
    if (state === 'QUARANTINE') {
      return {
        tool_id: 'rg.lexical_search',
        name: 'Lexical Search (ripgrep)',
        score: 0,
        hmm_state: state,
        domains: ['lexical', 'search'],
        observation: obs
      };
    }

    // Rank tools allowed in this state
    const ranked = rankTools(obs, signals);

    if (!ranked || ranked.length === 0) {
      // No tools scored in allowed set → fallback to lexical
      return {
        tool_id: 'rg.lexical_search',
        name: 'Lexical Search (ripgrep)',
        score: 0,
        hmm_state: state,
        domains: ['lexical', 'search'],
        observation: obs,
        ranked_tools: []
      };
    }

    // Winner: top-ranked tool in allowed set
    const topTool = ranked[0];
    const toolMetadata = await getToolMetadata(topTool.tool as ToolId);

    return {
      tool_id: topTool.tool as ToolId,
      name: toolMetadata?.name || topTool.tool,
      score: hasEmbedding ? topTool.score : topTool.score * 0.95,
      hmm_state: state,
      domains: toolMetadata?.domains || [],
      observation: obs,
      ranked_tools: ranked
    };
  } catch (error) {
    console.error('Tool selector error:', error);
    return {
      tool_id: 'rg.lexical_search',
      name: 'Lexical Search (ripgrep)',
      score: 0,
      hmm_state: 'UNKNOWN',
      domains: ['lexical', 'search']
    };
  }
}

/**
 * Extract observation features from query alone (MVP)
 *
 * Future: Enhance with:
 * - AST structure match (via ast-grep)
 * - Graph topology signals (via Neo4j)
 * - Semantic similarity (via Qdrant)
 * - Historical tool success rate (via telemetry table)
 */
export function computeObservationFromQuery(query: string, signals?: RoutingSignals): ToolObservation {
  const lowerQuery = query.toLowerCase();

  // Keyword matching for intent signals (order matters — check specific patterns first)
  const graphKeywords = /depends?|calls?|imports?|uses?|connected|flows?|related|implements?|references?|what does.*depend|what.*call/i;
  const codeKeywords = /where|function|route|file|defined|class|method|handler|import|export|line/i;
  const semanticKeywords = /similar|related|concept|meaning|like|analogy|pattern|example/i;
  const validationKeywords = /check|validate|verify|audit|test|schema|structure|integrity/i;

  // Keyword match scoring (graph takes precedence over code)
  const intent = signals?.intent ?? '';
  const domainClass = signals?.domainClass ?? '';
  const intentConfidence = signals?.intentConfidence ?? 0;
  const domainConfidence = signals?.domainConfidence ?? 0;

  let graphScore = graphKeywords.test(query) ? 0.7 : 0.2;
  let keywordScore = codeKeywords.test(query) && !graphKeywords.test(query) ? 0.6 : semanticKeywords.test(query) ? 0.5 : 0.3;
  let semanticScore = semanticKeywords.test(query) ? 0.7 : 0.3;
  let astScore = codeKeywords.test(query) ? 0.6 : 0.2;
  let validationScore = validationKeywords.test(query) ? 0.7 : 0.4;

  if (intent === 'symbol_lookup') {
    keywordScore = Math.max(keywordScore, 0.78);
    astScore = Math.max(astScore, 0.72);
  } else if (intent === 'deep_research') {
    semanticScore = Math.max(semanticScore, 0.82);
    graphScore = Math.max(graphScore, 0.6);
  } else if (intent === 'dependency_trace') {
    graphScore = Math.max(graphScore, 0.85);
  } else if (intent === 'schema_lookup') {
    validationScore = Math.max(validationScore, 0.82);
    keywordScore = Math.max(keywordScore, 0.65);
  } else if (intent === 'code_explanation') {
    semanticScore = Math.max(semanticScore, 0.74);
    validationScore = Math.max(validationScore, 0.8);
  } else if (intent === 'task_board_action') {
    validationScore = Math.max(validationScore, 0.9);
  } else if (intent === 'missing_work') {
    graphScore = Math.max(graphScore, 0.68);
    validationScore = Math.max(validationScore, 0.76);
  }

  if (domainClass === 'graph') graphScore = Math.max(graphScore, 0.8 * domainConfidence);
  if (domainClass === 'retrieval') {
    keywordScore = Math.max(keywordScore, 0.65 * domainConfidence);
    semanticScore = Math.max(semanticScore, 0.55 * domainConfidence);
  }
  if (domainClass === 'schema') validationScore = Math.max(validationScore, 0.8 * domainConfidence);

  // Latency: assume rg is fast (lexical), Qdrant + Neo4j are slower
  const latencyScore = codeKeywords.test(query) ? 1.0 : 0.5;

  // Tool success rate: default neutral
  const toolSuccessRate = 0.5;

  return {
    query,
    keywordScore,
    astScore,
    semanticScore,
    graphScore,
    validationScore,
    toolSuccessRate,
    latencyScore
  };
}

/**
 * Get tool metadata from registry (lookup by tool_id)
 * For now, returns hardcoded metadata
 * Future: Query Postgres tool_registry table
 */
async function getToolMetadata(
  toolId: ToolId
): Promise<{ name: string; domains: string[] } | null> {
  const metadata: Record<ToolId, { name: string; domains: string[] }> = {
    'trace.kag_search': {
      name: 'KAG Search',
      domains: ['retrieval', 'graph', 'auth']
    },
    'trace.explain_retrieval': {
      name: 'Explain Retrieval',
      domains: ['retrieval', 'explanation']
    },
    'atlas.topology_expand': {
      name: 'Topology Expansion',
      domains: ['topology', 'retrieval']
    },
    'neo4j.dependency_closure': {
      name: 'Dependency Closure',
      domains: ['graph', 'analysis']
    },
    'qdrant.dense_search': {
      name: 'Dense Vector Search',
      domains: ['retrieval', 'vector']
    },
    'rg.lexical_search': {
      name: 'Lexical Search (ripgrep)',
      domains: ['lexical', 'search']
    },
    'gemma4.explain_code': {
      name: 'Code Explanation',
      domains: ['synthesis', 'explanation']
    }
  };

  return metadata[toolId] || null;
}

/**
 * Compute observation features from multiple signals (future use)
 *
 * Called when full context is available (e.g., mid-retrieval)
 */
export function computeObservation(
  query: string,
  keywordScore: number,
  astScore: number,
  semanticScore: number,
  graphScore: number,
  validationScore: number,
  toolSuccessRate: number,
  latencyScore: number
): ToolObservation {
  return {
    query,
    keywordScore,
    astScore,
    semanticScore,
    graphScore,
    validationScore,
    toolSuccessRate,
    latencyScore
  };
}
