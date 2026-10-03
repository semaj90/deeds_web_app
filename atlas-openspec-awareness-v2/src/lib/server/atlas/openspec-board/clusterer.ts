import type { OpenSpecBoardTaskV1, OpenSpecTopicClusterV1 } from './types';

const TOPICS = [
  {
    id: 'identity-lineage',
    label: 'Identity & lineage',
    concepts: ['identity', 'lineage', 'workspace revision', 'source revision', 'packet revision', 'registry', 'canonical'],
    re: /\b(identity|lineage|workspace[_ -]?revision|source[_ -]?revision|packet[_ -]?(revision|key|id)|registry|canonical|provenance)\b/i
  },
  {
    id: 'chunk-ast-symbol',
    label: 'Chunk / AST / symbol',
    concepts: ['chunk', 'AST', 'CST', 'symbol', 'tree-sitter', 'span ownership'],
    re: /\b(chunk|ast|cst|symbol|tree[- ]?sitter|span|source[- ]?span|ast[- ]?grep)\b/i
  },
  {
    id: 'semantic-ann',
    label: 'Semantic / ANN',
    concepts: ['semantic_768', 'Qdrant', 'cuVS', 'CAGRA', 'embedding', 'ANN'],
    re: /\b(semantic|semantic_768|qdrant|cuvs|cagra|embedding|vector|ann[- _]?\d*|knn|rerank)\b/i
  },
  {
    id: 'graph-topology',
    label: 'Graph & topology',
    concepts: ['Graphify', 'PageRank', 'PPR', 'Neo4j', 'cuGraph', 'hypergraph'],
    re: /\b(graphify|graph|pagerank|ppr|topology|neo4j|cugraph|hypergraph|n[- ]?ary|community|leiden)\b/i
  },
  {
    id: 'clustering-taxonomy',
    label: 'Clustering & taxonomy',
    concepts: ['KMeans', 'SOM', 'centroid', 'domain class', 'topic', 'concept', 'taxonomy'],
    re: /\b(kmeans|som|centroid|cluster|domain[- ]?class|topic|concept|taxonomy|classifier)\b/i
  },
  {
    id: 'fusion-context-prefill',
    label: 'Fusion, context & prefill',
    concepts: ['RRF', 'ContextManifest', 'prefill', 'fusion', 'candidate cohort'],
    re: /\b(rrf|fusion|contextmanifest|context[_ -]?manifest|prefill|candidate|cohort|prompt[- ]?plan|context[- ]?window)\b/i
  },
  {
    id: 'residency-cache',
    label: 'Residency & cache',
    concepts: ['ACE', 'BitFrost', 'Valkey', 'Redis', 'KV cache', 'warming'],
    re: /\b(ace|bitfrost|valkey|redis|kv[- ]?cache|residency|warm|warming|cache|llama[- ]?server)\b/i
  },
  {
    id: 'agent-protocols',
    label: 'Agent protocols',
    concepts: ['ACP', 'A2A', 'MCP', 'gRPC', 'RabbitMQ', 'transport adapters'],
    re: /\b(acp|acpx|a2a|mcp|grpc|rabbitmq|transport|protocol|agent[- ]?adapter)\b/i
  },
  {
    id: 'human-feedback-rl',
    label: 'Human feedback / learning',
    concepts: ['human in the loop', 'approval', 'feedback receipt', 'preference', 'reinforcement learning', 'PyTorch'],
    re: /\b(human[- ]?in[- ]?the[- ]?loop|human[- ]?feedback|approval|preference|reinforcement|rlhf|pytorch|torch|reward)\b/i
  },
  {
    id: 'agent-workflow',
    label: 'Agent workflow & repair',
    concepts: ['scheduler', 'ranker', 'retry', 'blocker', 'receipt', 'agentic repair'],
    re: /\b(agent|workflow|scheduler|ranker|retry|blocker|receipt|repair|error[- ]?fix|execution[- ]?controller)\b/i
  },
  {
    id: 'governance-promotion',
    label: 'Governance & promotion',
    concepts: ['OpenSpec', 'promotion', 'authorization', 'authority', 'contract', 'invariant'],
    re: /\b(openspec|promotion|authorization|authority|contract|invariant|admission|governance|gate)\b/i
  },
  {
    id: 'ui-admin',
    label: 'Admin UI / SSR',
    concepts: ['SvelteKit', 'SSR', 'Bits UI', 'Studio', 'admin'],
    re: /\b(svelte|sveltekit|ssr|bits[- ]?ui|studio|admin|ui|dashboard|sse)\b/i
  },
  {
    id: 'data-postgres',
    label: 'PostgreSQL / data plane',
    concepts: ['PostgreSQL', 'Drizzle ORM', 'pgvector', 'schema', 'database'],
    re: /\b(postgres|postgresql|drizzle|pgvector|schema|database|table|sql)\b/i
  }
] as const;

export function classifyTaskTopics(text: string): { primary: string; secondary: string[] } {
  const matches = TOPICS.filter((topic) => topic.re.test(text));
  return {
    primary: matches[0]?.id ?? 'other',
    secondary: matches.slice(1).map((topic) => topic.id)
  };
}

export function buildTopicClusters(tasks: readonly OpenSpecBoardTaskV1[]): OpenSpecTopicClusterV1[] {
  const map = new Map<string, OpenSpecTopicClusterV1>();
  for (const topic of TOPICS) {
    map.set(topic.id, {
      id: topic.id,
      label: topic.label,
      count: 0,
      actionable: 0,
      waiting: 0,
      proven: 0,
      changes: [],
      concepts: [...topic.concepts]
    });
  }
  map.set('other', {
    id: 'other', label: 'Other / uncategorized', count: 0, actionable: 0, waiting: 0, proven: 0,
    changes: [], concepts: []
  });

  for (const task of tasks) {
    const cluster = map.get(task.topic) ?? map.get('other')!;
    cluster.count += 1;
    if (task.state === 'ACTIONABLE') cluster.actionable += 1;
    else if (task.state === 'PROVEN') cluster.proven += 1;
    else if (task.state.startsWith('WAITING_')) cluster.waiting += 1;
    if (task.changeId && !cluster.changes.includes(task.changeId) && cluster.changes.length < 12) {
      cluster.changes.push(task.changeId);
    }
  }

  return [...map.values()].filter((x) => x.count > 0).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
