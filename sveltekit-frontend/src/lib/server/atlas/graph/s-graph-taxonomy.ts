import { z } from 'zod';

/**
 * SGraphV1 = Parent Atlas Symbol/Structure Graph.
 *
 * It is a typed, revisioned graph view over canonical identities. It does not
 * replace Tree-sitter structural truth, Postgres identity, Neo4j projection,
 * or the workflow DAG. It gives those surfaces one deterministic algorithm
 * taxonomy and ordering contract.
 */
export const SGraphNodeKindSchema = z.enum([
  'workspace',
  'module',
  'file',
  'symbol',
  'ast_node',
  'type',
  'table',
  'column',
  'tuple',
  'hash',
  'artifact',
  'test',
  'tool',
  'task',
]);
export type SGraphNodeKind = z.infer<typeof SGraphNodeKindSchema>;

export const SGraphEdgeKindSchema = z.enum([
  'IMPORTS',
  'CALLS',
  'REFERENCES',
  'DEFINES',
  'READS',
  'WRITES',
  'DEPENDS_ON',
  'DERIVES',
  'UPDATES',
  'EXTENDS',
  'PRODUCES',
  'CONSUMES',
  'VALIDATES',
  'MUTATES',
  'COVERS',
]);
export type SGraphEdgeKind = z.infer<typeof SGraphEdgeKindSchema>;

export const SGraphNodeV1Schema = z.object({
  id: z.string().min(1),
  canonicalId: z.string().min(1),
  kind: SGraphNodeKindSchema,
  stableHash: z.string().min(1).nullable().optional(),
}).strict();
export type SGraphNodeV1 = z.infer<typeof SGraphNodeV1Schema>;

export const SGraphEdgeV1Schema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  kind: SGraphEdgeKindSchema,
}).strict();
export type SGraphEdgeV1 = z.infer<typeof SGraphEdgeV1Schema>;

export const SGraphV1Schema = z.object({
  schema: z.literal('atlas.s-graph.v1'),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  nodes: z.array(SGraphNodeV1Schema),
  edges: z.array(SGraphEdgeV1Schema),
}).strict();
export type SGraphV1 = z.infer<typeof SGraphV1Schema>;

export const SGraphSortAlgorithmSchema = z.enum([
  'LEXICOGRAPHICAL_TOPOLOGICAL',
  'SCC_CONDENSATION_TOPOLOGICAL',
]);
export type SGraphSortAlgorithm = z.infer<typeof SGraphSortAlgorithmSchema>;

export const SGraphTraversalAlgorithmSchema = z.enum([
  'BFS',
  'DFS',
  'ANCESTORS',
  'DESCENDANTS',
  'BOUNDED_K_HOP',
]);

export const SGraphDecompositionAlgorithmSchema = z.enum([
  'STRONGLY_CONNECTED_COMPONENTS',
  'WEAKLY_CONNECTED_COMPONENTS',
  'CONDENSATION_DAG',
  'DAG_GENERATIONS',
  'NORMALIZED_LAPLACIAN_SPECTRAL',
  'SVD_PCA',
]);

export const SGraphAuthorityAlgorithmSchema = z.enum([
  'PAGERANK',
  'EIGENVECTOR_CENTRALITY',
]);

export const SGraphCommunityAlgorithmSchema = z.enum([
  'LEIDEN',
  'SPECTRAL_MODULARITY',
]);

export const SGraphStorageLayoutSchema = z.enum([
  'COO_INTERCHANGE',
  'CSR_OUTGOING',
  'CSC_INCOMING',
]);

export const SGraphExecutorSchema = z.enum([
  'TYPESCRIPT_REFERENCE',
  'NETWORKX_REFERENCE',
  'BOOST_GRAPH_CPU',
  'CUGRAPH_GPU',
  'NEO4J_GDS',
]);
export type SGraphExecutor = z.infer<typeof SGraphExecutorSchema>;

export const SGraphSortReceiptV1Schema = z.object({
  schema: z.literal('atlas.s-graph-sort.v1'),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  algorithm: SGraphSortAlgorithmSchema,
  executor: SGraphExecutorSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  componentCount: z.number().int().positive(),
  hadCycles: z.boolean(),
  orderedNodeIds: z.array(z.string().min(1)),
  producerRevision: z.string().min(1),
}).strict();
export type SGraphSortReceiptV1 = z.infer<typeof SGraphSortReceiptV1Schema>;

const NODE_KIND_RANK: Record<SGraphNodeKind, number> = {
  workspace: 0,
  module: 1,
  file: 2,
  type: 3,
  symbol: 4,
  ast_node: 5,
  table: 6,
  column: 7,
  tuple: 8,
  hash: 9,
  artifact: 10,
  test: 11,
  tool: 12,
  task: 13,
};

/** Stable tie-break key. Hash is evidence, never identity. */
export function sGraphNodeSortKey(node: SGraphNodeV1): string {
  const rank = String(NODE_KIND_RANK[node.kind]).padStart(2, '0');
  return `${rank}\u0000${node.stableHash ?? ''}\u0000${node.canonicalId}\u0000${node.id}`;
}

function buildNodeMap(graph: SGraphV1): Map<string, SGraphNodeV1> {
  const map = new Map<string, SGraphNodeV1>();
  for (const node of graph.nodes) {
    if (map.has(node.id)) throw new Error(`Duplicate SGraph node id: ${node.id}`);
    map.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (!map.has(edge.source) || !map.has(edge.target)) {
      throw new Error(`SGraph edge references missing node: ${edge.source} -> ${edge.target}`);
    }
  }
  return map;
}

function sortedIds(ids: Iterable<string>, nodeMap: Map<string, SGraphNodeV1>): string[] {
  return [...ids].sort((a, b) => {
    const aNode = nodeMap.get(a);
    const bNode = nodeMap.get(b);
    if (!aNode || !bNode) return a.localeCompare(b);
    return sGraphNodeSortKey(aNode).localeCompare(sGraphNodeSortKey(bNode));
  });
}

/** Graph transpose G^T: reverse every directed edge, preserving relation kind. */
export function transposeSGraph(graph: SGraphV1): SGraphV1 {
  buildNodeMap(graph);
  return {
    ...graph,
    edges: graph.edges.map((edge) => ({ ...edge, source: edge.target, target: edge.source })),
  };
}

/** Deterministic Kahn topological sort. Throws when the graph contains a cycle. */
export function lexicographicalTopologicalSort(graph: SGraphV1): string[] {
  const nodeMap = buildNodeMap(graph);
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeMap.keys()) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const ready = sortedIds(
    [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id),
    nodeMap,
  );
  const ordered: string[] = [];

  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    ordered.push(id);
    const targets = sortedIds(outgoing.get(id) ?? [], nodeMap);
    for (const target of targets) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort((a, b) => {
          const aNode = nodeMap.get(a);
          const bNode = nodeMap.get(b);
          if (!aNode || !bNode) return a.localeCompare(b);
          return sGraphNodeSortKey(aNode).localeCompare(sGraphNodeSortKey(bNode));
        });
      }
    }
  }

  if (ordered.length !== graph.nodes.length) {
    throw new Error('SGraph is cyclic; use SCC condensation before topological ordering');
  }
  return ordered;
}

/** Tarjan SCC reference implementation. Components and members are returned deterministically. */
export function stronglyConnectedComponents(graph: SGraphV1): string[][] {
  const nodeMap = buildNodeMap(graph);
  const outgoing = new Map<string, string[]>();
  for (const id of nodeMap.keys()) outgoing.set(id, []);
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);
  for (const [id, targets] of outgoing) outgoing.set(id, sortedIds(targets, nodeMap));

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (v: string): void => {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of outgoing.get(v) ?? []) {
      if (!indices.has(w)) {
        visit(w);
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const w = stack.pop();
        if (!w) break;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      components.push(sortedIds(component, nodeMap));
    }
  };

  for (const id of sortedIds(nodeMap.keys(), nodeMap)) {
    if (!indices.has(id)) visit(id);
  }

  return components.sort((a, b) => {
    const aNode = nodeMap.get(a[0]);
    const bNode = nodeMap.get(b[0]);
    if (!aNode || !bNode) return a[0].localeCompare(b[0]);
    return sGraphNodeSortKey(aNode).localeCompare(sGraphNodeSortKey(bNode));
  });
}

export type SGraphCondensation = {
  components: string[][];
  componentByNode: Map<string, number>;
  edges: Array<[number, number]>;
};

/** Contract cycles into SCCs. The resulting component graph is a DAG. */
export function condenseSGraph(graph: SGraphV1): SGraphCondensation {
  const components = stronglyConnectedComponents(graph);
  const componentByNode = new Map<string, number>();
  components.forEach((component, componentId) => {
    for (const nodeId of component) componentByNode.set(nodeId, componentId);
  });

  const unique = new Set<string>();
  for (const edge of graph.edges) {
    const source = componentByNode.get(edge.source);
    const target = componentByNode.get(edge.target);
    if (source === undefined || target === undefined || source === target) continue;
    unique.add(`${source}:${target}`);
  }
  const edges = [...unique]
    .map((pair) => pair.split(':').map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { components, componentByNode, edges };
}

/**
 * Deterministic structural order:
 * - DAG: lexicographical topological sort.
 * - cyclic graph: SCC condensation -> deterministic topological component order,
 *   then deterministic ordering inside each SCC.
 */
export function sortSGraph(graph: SGraphV1): {
  algorithm: SGraphSortAlgorithm;
  orderedNodeIds: string[];
  components: string[][];
  hadCycles: boolean;
} {
  try {
    const orderedNodeIds = lexicographicalTopologicalSort(graph);
    return {
      algorithm: 'LEXICOGRAPHICAL_TOPOLOGICAL',
      orderedNodeIds,
      components: graph.nodes.map((node) => [node.id]),
      hadCycles: false,
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('cyclic')) throw error;
  }

  const nodeMap = buildNodeMap(graph);
  const condensed = condenseSGraph(graph);
  const indegree = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  condensed.components.forEach((_, componentId) => {
    indegree.set(componentId, 0);
    outgoing.set(componentId, []);
  });
  for (const [source, target] of condensed.edges) {
    outgoing.get(source)?.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const componentKey = (componentId: number): string => {
    const first = condensed.components[componentId]?.[0];
    const node = first ? nodeMap.get(first) : undefined;
    return node ? sGraphNodeSortKey(node) : String(componentId).padStart(12, '0');
  };
  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
  const componentOrder: number[] = [];

  while (ready.length > 0) {
    const componentId = ready.shift();
    if (componentId === undefined) break;
    componentOrder.push(componentId);
    for (const target of [...(outgoing.get(componentId) ?? [])].sort((a, b) => componentKey(a).localeCompare(componentKey(b)))) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
      }
    }
  }

  if (componentOrder.length !== condensed.components.length) {
    throw new Error('SGraph condensation invariant failed: component graph must be a DAG');
  }

  return {
    algorithm: 'SCC_CONDENSATION_TOPOLOGICAL',
    orderedNodeIds: componentOrder.flatMap((id) => condensed.components[id]),
    components: condensed.components,
    hadCycles: true,
  };
}

export type SGraphOperation =
  | 'SORT'
  | 'TRANSPOSE'
  | 'SCC'
  | 'BFS'
  | 'PAGERANK'
  | 'EIGENVECTOR_CENTRALITY'
  | 'LEIDEN'
  | 'SPECTRAL';

/** Executor preferences. Exact/reference semantics remain explicit. */
export function sGraphExecutorPreference(operation: SGraphOperation): readonly SGraphExecutor[] {
  switch (operation) {
    case 'SORT':
    case 'SCC':
      return ['TYPESCRIPT_REFERENCE', 'NETWORKX_REFERENCE', 'BOOST_GRAPH_CPU'];
    case 'TRANSPOSE':
      return ['TYPESCRIPT_REFERENCE', 'BOOST_GRAPH_CPU', 'CUGRAPH_GPU'];
    case 'BFS':
    case 'PAGERANK':
    case 'EIGENVECTOR_CENTRALITY':
    case 'LEIDEN':
    case 'SPECTRAL':
      return ['NETWORKX_REFERENCE', 'CUGRAPH_GPU', 'NEO4J_GDS'];
  }
}
