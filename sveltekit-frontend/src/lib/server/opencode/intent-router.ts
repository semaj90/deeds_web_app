export type OpenCodeDispatchAction =
  | 'search_rg'
  | 'query_qdrant'
  | 'search_codebase'
  | 'auto'
  | 'plan';

export interface OpenCodeRoutingDecision {
  action: OpenCodeDispatchAction;
  confidence: number;
  reason: string;
  routeHints: string[];
}

function scorePattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyOpenCodeIntent(
  intent: string,
  context?: Record<string, unknown>
): OpenCodeRoutingDecision {
  const normalized = `${intent} ${context ? JSON.stringify(context) : ''}`.toLowerCase();

  const planPattern = [
    /\b(plan|decompose|todo|task board|recommendation|kanban|workflow|roadmap|spec|phase)\b/i,
    /\b(implement|add|build|create|wire|patch|update|refactor)\b/i,
  ];
  if (scorePattern(normalized, planPattern)) {
    return {
      action: 'plan',
      confidence: 0.84,
      reason: 'Intent looks like task decomposition or implementation planning.',
      routeHints: ['build_agentic_rag_context', 'build_recommendation', 'record_outcome'],
    };
  }

  const semanticPattern = [
    /\b(embedding|vector|semantic|similar|nearest|cluster|centroid|qdrant|dense|rerank|latent|som|valkey|redis)\b/i,
    /\b(ace packet|kag|dag|hypergraphrag|synthesis|context packet)\b/i,
  ];
  if (scorePattern(normalized, semanticPattern)) {
    return {
      action: 'query_qdrant',
      confidence: 0.9,
      reason: 'Intent is semantic or routing-heavy; prefer embeddings and centroid hints before reads.',
      routeHints: ['query_qdrant', 'redis.centroid_lookup', 'ace.build_context'],
    };
  }

  const structuralPattern = [
    /\b(ast|tree-sitter|treesitter|treechunk|symbol|module|import|function|class|wiring|implementation|where is|how is|defined)\b/i,
    /\b(source_ref|packet_key|tree_node_id|file path|file_path|line|code path)\b/i,
  ];
  if (scorePattern(normalized, structuralPattern)) {
    return {
      action: 'search_codebase',
      confidence: 0.88,
      reason: 'Intent asks about code structure, wiring, or implementation boundaries.',
      routeHints: ['codebase.rg_search', 'trace.kag_search', 'ast.traversal'],
    };
  }

  const lexicalPattern = [
    /\b(rg|ripgrep|grep|keyword|keywords|search|find|locate|read|readme|text match)\b/i,
    /\b(pattern|regex|occurrence|mentions?|where does it say)\b/i,
  ];
  if (scorePattern(normalized, lexicalPattern)) {
    return {
      action: 'search_rg',
      confidence: 0.87,
      reason: 'Intent is lexical; prefer ripgrep / KAG before generic reads.',
      routeHints: ['codebase.rg_search', 'trace.kag_search'],
    };
  }

  return {
    action: 'auto',
    confidence: 0.45,
    reason: 'Intent is ambiguous; defer to planner or a follow-up clarifier.',
    routeHints: ['trace.kag_search', 'query_qdrant'],
  };
}

export function chooseOpenCodeAction(
  planner: OpenCodeRoutingDecision,
  heuristic: OpenCodeRoutingDecision
): OpenCodeRoutingDecision {
  if (planner.action === 'auto') return heuristic;
  if (heuristic.action !== 'auto' && heuristic.confidence >= 0.8) return heuristic;
  if (planner.confidence >= heuristic.confidence) return planner;
  return heuristic;
}
