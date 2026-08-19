export interface GraphSearchEdge {
  from: string;
  to: string;
  cost: number;
  relationType?: string;
}

export interface GraphSearchGraph {
  neighbors(nodeId: string): readonly GraphSearchEdge[];
}

export interface GraphSearchBudget {
  maxDepth: number;
  maxExpanded: number;
  maxFrontier: number;
  allowedRelationTypes?: readonly string[];
}

export interface GraphSearchPath {
  nodes: string[];
  cost: number;
  expanded: number;
  strategy: 'BFS' | 'GREEDY_BEST_FIRST' | 'ASTAR';
}

function edgeAllowed(edge: GraphSearchEdge, allowed?: Set<string>): boolean {
  return !allowed || !edge.relationType || allowed.has(edge.relationType);
}

/**
 * Unweighted breadth-first reference. Finds minimum-hop paths when all traversed
 * edges are considered unit cost. cuGraph BFS is the GPU executor for large
 * bounded projections; this function is the deterministic TypeScript oracle.
 */
export function breadthFirstSearch(args: {
  graph: GraphSearchGraph;
  start: string;
  goal: string;
  budget: GraphSearchBudget;
}): GraphSearchPath | null {
  const allowed = args.budget.allowedRelationTypes?.length
    ? new Set(args.budget.allowedRelationTypes)
    : undefined;
  const queue: Array<{ node: string; path: string[]; depth: number }> = [
    { node: args.start, path: [args.start], depth: 0 },
  ];
  const seen = new Set<string>([args.start]);
  let expanded = 0;

  while (queue.length > 0 && expanded < args.budget.maxExpanded) {
    const current = queue.shift()!;
    if (current.node === args.goal) {
      return { nodes: current.path, cost: current.path.length - 1, expanded, strategy: 'BFS' };
    }
    if (current.depth >= args.budget.maxDepth) continue;
    expanded += 1;

    const neighbors = [...args.graph.neighbors(current.node)]
      .filter((edge) => edgeAllowed(edge, allowed))
      .sort((a, b) => a.to.localeCompare(b.to));

    for (const edge of neighbors) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      if (queue.length >= args.budget.maxFrontier) break;
      queue.push({ node: edge.to, path: [...current.path, edge.to], depth: current.depth + 1 });
    }
  }
  return null;
}

/**
 * Relevance-oriented greedy best-first search. This uses only h(n), not g(n).
 * It is fast and useful for semantic graph expansion but does not claim a
 * shortest-path guarantee.
 */
export function greedyBestFirstSearch(args: {
  graph: GraphSearchGraph;
  start: string;
  goal: string;
  heuristic: (nodeId: string, goalId: string) => number;
  budget: GraphSearchBudget;
}): GraphSearchPath | null {
  const allowed = args.budget.allowedRelationTypes?.length
    ? new Set(args.budget.allowedRelationTypes)
    : undefined;
  const frontier: Array<{ node: string; path: string[]; cost: number; depth: number; h: number }> = [
    { node: args.start, path: [args.start], cost: 0, depth: 0, h: args.heuristic(args.start, args.goal) },
  ];
  const bestSeen = new Map<string, number>([[args.start, 0]]);
  let expanded = 0;

  while (frontier.length > 0 && expanded < args.budget.maxExpanded) {
    frontier.sort((a, b) => a.h - b.h || a.node.localeCompare(b.node));
    const current = frontier.shift()!;
    if (current.node === args.goal) {
      return { nodes: current.path, cost: current.cost, expanded, strategy: 'GREEDY_BEST_FIRST' };
    }
    if (current.depth >= args.budget.maxDepth) continue;
    expanded += 1;

    for (const edge of [...args.graph.neighbors(current.node)].sort((a, b) => a.to.localeCompare(b.to))) {
      if (!edgeAllowed(edge, allowed)) continue;
      const nextCost = current.cost + edge.cost;
      const prev = bestSeen.get(edge.to);
      if (prev !== undefined && prev <= nextCost) continue;
      bestSeen.set(edge.to, nextCost);
      frontier.push({
        node: edge.to,
        path: [...current.path, edge.to],
        cost: nextCost,
        depth: current.depth + 1,
        h: args.heuristic(edge.to, args.goal),
      });
      if (frontier.length > args.budget.maxFrontier) {
        frontier.sort((a, b) => a.h - b.h || a.node.localeCompare(b.node));
        frontier.length = args.budget.maxFrontier;
      }
    }
  }
  return null;
}

/**
 * True A* reference. Caller must prove `heuristicAdmissible=true`; otherwise use
 * greedy/weighted best-first. A* evaluates f(n)=g(n)+h(n).
 */
export function aStarSearch(args: {
  graph: GraphSearchGraph;
  start: string;
  goal: string;
  heuristic: (nodeId: string, goalId: string) => number;
  heuristicAdmissible: boolean;
  budget: GraphSearchBudget;
}): GraphSearchPath | null {
  if (!args.heuristicAdmissible) {
    throw new Error('ASTAR_HEURISTIC_NOT_PROVEN_ADMISSIBLE');
  }
  const allowed = args.budget.allowedRelationTypes?.length
    ? new Set(args.budget.allowedRelationTypes)
    : undefined;
  const frontier: Array<{ node: string; path: string[]; g: number; h: number; depth: number }> = [
    { node: args.start, path: [args.start], g: 0, h: args.heuristic(args.start, args.goal), depth: 0 },
  ];
  const bestG = new Map<string, number>([[args.start, 0]]);
  let expanded = 0;

  while (frontier.length > 0 && expanded < args.budget.maxExpanded) {
    frontier.sort((a, b) => (a.g + a.h) - (b.g + b.h) || a.node.localeCompare(b.node));
    const current = frontier.shift()!;
    if (current.node === args.goal) {
      return { nodes: current.path, cost: current.g, expanded, strategy: 'ASTAR' };
    }
    if (current.depth >= args.budget.maxDepth) continue;
    expanded += 1;

    for (const edge of [...args.graph.neighbors(current.node)].sort((a, b) => a.to.localeCompare(b.to))) {
      if (!edgeAllowed(edge, allowed)) continue;
      if (!Number.isFinite(edge.cost) || edge.cost < 0) {
        throw new Error('ASTAR_REQUIRES_NONNEGATIVE_FINITE_EDGE_COSTS');
      }
      const nextG = current.g + edge.cost;
      if (nextG >= (bestG.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
      bestG.set(edge.to, nextG);
      frontier.push({
        node: edge.to,
        path: [...current.path, edge.to],
        g: nextG,
        h: args.heuristic(edge.to, args.goal),
        depth: current.depth + 1,
      });
      if (frontier.length > args.budget.maxFrontier) {
        frontier.sort((a, b) => (a.g + a.h) - (b.g + b.h) || a.node.localeCompare(b.node));
        frontier.length = args.budget.maxFrontier;
      }
    }
  }
  return null;
}
