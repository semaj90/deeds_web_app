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
  UNKNOWN: ['rg.lexical_search', 'qdrant.dense_search', 'postgres.bm25'],
  CODE_SEARCH: ['rg.lexical_search', 'atlas.topology_expand', 'trace.kag_search'],
  SEMANTIC_SEARCH: ['qdrant.dense_search', 'trace.kag_search'],
  GRAPH_EXPAND: ['neo4j.dependency_closure', 'trace.kag_search', 'atlas.topology_expand'],
  VALIDATE: ['qdrant.dense_search', 'rg.lexical_search'],
  SYNTHESIZE: ['gemma4.explain_code'],
  QUARANTINE: ['rg.lexical_search'] // Fallback only
};

/**
 * HMM State Inference: Classify query intent from observations
 *
 * Rule-based MVP (deterministic, testable, no training needed)
 * Future: Full Viterbi with transition probabilities
 */
export function inferHMMState(obs: ToolObservation): HMMState {
  // Hard fail: validation score too low → quarantine
  if (obs.validationScore < 0.2) return 'QUARANTINE';

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
export function rankTools(obs: ToolObservation): Array<{ tool: ToolId; score: number }> {
  const state = inferHMMState(obs);
  const allowed = new Set(STATE_TOOLS[state]);

  // Score each tool by relevant observation features
  const scores: Array<{ tool: ToolId; score: number }> = [
    // Lexical search: keyword + AST match
    {
      tool: 'rg.lexical_search',
      score: 0.45 * obs.keywordScore + 0.35 * obs.astScore
    },
    // AST/code structure (implicit in topology_expand)
    {
      tool: 'atlas.topology_expand',
      score: 0.65 * obs.astScore + 0.2 * obs.graphScore
    },
    // Dense vector similarity
    {
      tool: 'qdrant.dense_search',
      score: 0.75 * obs.semanticScore + 0.15 * obs.keywordScore
    },
    // Graph traversal: graph + validation
    {
      tool: 'neo4j.dependency_closure',
      score: 0.75 * obs.graphScore + 0.15 * obs.validationScore
    },
    // KAG: balanced multi-signal
    {
      tool: 'trace.kag_search',
      score: 0.35 * obs.semanticScore + 0.35 * obs.graphScore + 0.2 * obs.keywordScore
    },
    // Code synthesis: high validation only
    {
      tool: 'gemma4.explain_code',
      score: obs.validationScore > 0.8 ? 0.6 * obs.validationScore : 0
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
  pool?: PoolClient
): Promise<ToolCandidateResult> {
  // Fallback if no embedding provided
  if (!queryEmbedding || queryEmbedding.length !== 384) {
    const fallbackObs = computeObservationFromQuery(userQuery);
    const state = inferHMMState(fallbackObs);

    return {
      tool_id: 'rg.lexical_search',
      name: 'Lexical Search (ripgrep)',
      score: 0,
      hmm_state: state,
      domains: ['lexical', 'search'],
      observation: fallbackObs
    };
  }

  try {
    // Compute observation features
    const obs = computeObservationFromQuery(userQuery);

    // Infer HMM state
    const state = inferHMMState(obs);

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
    const ranked = rankTools(obs);

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
      score: topTool.score,
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
export function computeObservationFromQuery(query: string): ToolObservation {
  const lowerQuery = query.toLowerCase();

  // Keyword matching for intent signals (order matters — check specific patterns first)
  const graphKeywords = /depends?|calls?|imports?|uses?|connected|flows?|related|implements?|references?|what does.*depend|what.*call/i;
  const codeKeywords = /where|function|route|file|defined|class|method|handler|import|export|line/i;
  const semanticKeywords = /similar|related|concept|meaning|like|analogy|pattern|example/i;
  const validationKeywords = /check|validate|verify|audit|test|schema|structure|integrity/i;

  // Keyword match scoring (graph takes precedence over code)
  const graphScore = graphKeywords.test(query) ? 0.7 : 0.2;
  const keywordScore = codeKeywords.test(query) && !graphKeywords.test(query) ? 0.6 : semanticKeywords.test(query) ? 0.5 : 0.3;
  const semanticScore = semanticKeywords.test(query) ? 0.7 : 0.3;
  const astScore = codeKeywords.test(query) ? 0.6 : 0.2;
  const validationScore = validationKeywords.test(query) ? 0.7 : 0.4;

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
