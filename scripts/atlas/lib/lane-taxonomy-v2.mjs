export const LANE_RULES_V2 = [
  ['IDENTITY_AUTHORITY', /\b(identity|lineage|workspace[_ -]?revision|source[_ -]?revision|packet[_ -]?revision|packetrevisionowner|canonical[_ -]?authorization|provenance|registry namespace|source authority)\b/i],
  ['DIRECTORY_INDEXING', /\b(directory|dir-index|path|heading|body|tag\/concept|materialize admitted chunks|changed source bytes|lod[0-9])\b/i],
  ['AST_SYMBOL', /\b(ast|cst|tree[_ -]?node|tree[- ]?sitter|symbol|source span|chunk lineage)\b/i],
  ['SEMANTIC_ANN', /\b(semantic_?768|embedding|qdrant|cuvs|cagra|ann|knn|dense|rerank|vector point)\b/i],
  ['LEXICAL_SEARCH', /\b(lexical|fts|trigram|bm42|keyword|ripgrep|exact path|exact symbol)\b/i],
  ['GRAPH_TOPOLOGY', /\b(graphify|pagerank|ppr|topology|neo4j|cugraph|hypergraph|graph ordinal)\b/i],
  ['RETRIEVAL_FUSION', /\b(rrf|fusion|searchruntime|candidate fusion|one vote|lane vote)\b/i],
  ['PREFILL_CONTEXT', /\b(contextmanifest|promptplan|prefill|candidate cohort|candidate freeze|token budget|synthesis)\b/i],
  ['ACE_BITFROST_CACHE', /\b(ace|bitfrost|valkey|redis|cache|residency|bucket warm|kv cache|llama|ornith|prefix cache)\b/i],
  ['AGENT_PROTOCOLS', /\b(acp|acpx|a2a|mcp|grpc|rabbitmq|transport|agent adapter|workflow transport)\b/i],
  ['HITL_LEARNING', /\b(human[- ]?in[- ]?the[- ]?loop|human feedback|approval|preference|reinforcement|rlhf|reward model|pytorch|teacher cohort)\b/i],
  ['MIGRATION_DATABASE', /\b(sql file|schema|migration|postgres|drizzle|backfill|database|pgvector)\b/i],
  ['ADMIN_OBSERVABILITY', /\b(ssr|sveltekit|bits-ui|admin page|studio|dashboard|sse|observability|report)\b/i],
  ['RESEARCH_CHALLENGER', /\b(ewin tang|low[- ]?rank|kmeans|som|challenger|experiment|benchmark)\b/i],
  ['GOVERNANCE_PROOF', /\b(openspec|receipt|proof|validate|audit|promotion|gate|invariant|governance)\b/i]
];

export function classifyLaneV2(task) {
  const text = [task.change, task.changeId, task.taskKey, task.text, task.title, task.lane]
    .filter(Boolean).join(' ');
  const matches = LANE_RULES_V2.filter(([, re]) => re.test(text)).map(([name]) => name);
  return {
    primary: matches[0] ?? 'GENERAL',
    secondary: matches.slice(1),
    all: matches.length ? matches : ['GENERAL']
  };
}
