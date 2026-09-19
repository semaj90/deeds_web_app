export const ATLAS_TAXONOMY_V2 = [
  { id:'identity-lineage', label:'Identity & lineage', concepts:['canonical identity','packet revision','workspace revision','source revision','registry','provenance'], re:/\b(identity|lineage|canonical|packet[_ -]?(id|key|revision)|workspace[_ -]?revision|source[_ -]?revision|registry|provenance)\b/i },
  { id:'chunk-ast-symbol', label:'Chunk / AST / symbol', concepts:['chunk','AST','CST','tree_node','Tree-sitter','AST-grep','symbol','span'], re:/\b(chunk|ast|cst|tree[_ -]?node|tree[- ]?sitter|ast[- ]?grep|symbol|source[- ]?span|span)\b/i },
  { id:'semantic-ann', label:'Semantic / ANN', concepts:['semantic_768','embedding','Qdrant','cuVS','CAGRA','KNN','reranker'], re:/\b(semantic(?:_768)?|embedding|qdrant|cuvs|cagra|ann|knn|rerank|vector)\b/i },
  { id:'graph-topology', label:'Graph & topology', concepts:['Graphify','file relation','import graph','PageRank','PPR','Neo4j','cuGraph','hypergraph'], re:/\b(graphify|file[- ]?relation|import[- ]?graph|pagerank|ppr|neo4j|cugraph|hypergraph|topology|community|leiden)\b/i },
  { id:'clustering-taxonomy', label:'Clustering & taxonomy', concepts:['KMeans','SOM','centroid','domain class','topic','concept','taxonomy'], re:/\b(kmeans|som|centroid|cluster|domain[- ]?class|topic|concept|taxonomy|classifier)\b/i },
  { id:'fusion-context-prefill', label:'Fusion / context / prefill', concepts:['RRF','candidate cohort','ContextManifest','PromptPlan','prefill','synthesis'], re:/\b(rrf|fusion|candidate|cohort|contextmanifest|context[_ -]?manifest|promptplan|prompt[- ]?plan|prefill|synthesis)\b/i },
  { id:'residency-cache', label:'Residency & cache', concepts:['ACE','BitFrost','Redis','Valkey','KV cache','bucket warming','llama-server'], re:/\b(ace|bitfrost|redis|valkey|kv[- ]?cache|bucket[- ]?warm|warming|residency|llama[- ]?server|ornith)\b/i },
  { id:'agent-protocols', label:'Agent protocols', concepts:['ACP','A2A','MCP','gRPC','RabbitMQ','transport adapter'], re:/\b(acp|acpx|a2a|mcp|grpc|rabbitmq|transport|protocol|agent[- ]?adapter)\b/i },
  { id:'human-feedback-rl', label:'Human feedback / learning', concepts:['human in the loop','approval','feedback receipt','preference','reinforcement learning','PyTorch'], re:/\b(human[- ]?in[- ]?the[- ]?loop|human[- ]?feedback|approval|preference|reinforcement|rlhf|pytorch|torch|reward)\b/i },
  { id:'agent-workflow', label:'Agent workflow & repair', concepts:['scheduler','ranker','retry','blocker','receipt','error repair','workflow'], re:/\b(agent|workflow|scheduler|ranker|retry|blocker|receipt|repair|error[- ]?fix|execution[- ]?controller)\b/i },
  { id:'governance-promotion', label:'Governance & promotion', concepts:['OpenSpec','completion envelope','authorization','authority','promotion','invariant'], re:/\b(openspec|completion[- ]?envelope|promotion|authorization|authority|contract|invariant|admission|governance|gate)\b/i },
  { id:'ui-admin', label:'Admin UI / SSR', concepts:['SvelteKit','SSR','SSE','Bits UI','Studio','admin'], re:/\b(svelte|sveltekit|ssr|sse|bits[- ]?ui|studio|admin|dashboard|webgpu)\b/i },
  { id:'data-postgres', label:'PostgreSQL / data plane', concepts:['PostgreSQL 18','Drizzle ORM','pgvector','schema','materialized read model'], re:/\b(postgres(?:ql)?|drizzle|pgvector|schema|database|sql|read[- ]?model)\b/i }
];

export function classifyText(text) {
  const matches = ATLAS_TAXONOMY_V2.filter((x) => x.re.test(text));
  return {
    primary: matches[0]?.id ?? 'other',
    secondary: matches.slice(1).map((x) => x.id),
    concepts: [...new Set(matches.flatMap((x) => x.concepts))]
  };
}

export function topicById(id) {
  return ATLAS_TAXONOMY_V2.find((x) => x.id === id) ?? null;
}
