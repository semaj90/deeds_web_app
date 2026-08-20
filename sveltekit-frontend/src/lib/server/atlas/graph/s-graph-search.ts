import { z } from 'zod';
import {
  SGraphV1Schema,
  type SGraphEdgeKind,
  type SGraphEdgeV1,
  type SGraphNodeV1,
  type SGraphV1,
} from './s-graph-taxonomy.js';

/**
 * Search algorithms are policies over an SGraph representation. They are not
 * retrieval lanes and they do not create extra RRF votes.
 */
export const SGraphSearchAlgorithmSchema = z.enum([
  'BREADTH_FIRST',
  'UNIFORM_COST',
  'GREEDY_BEST_FIRST',
  'BEAM',
  'A_STAR',
]);
export type SGraphSearchAlgorithm = z.infer<typeof SGraphSearchAlgorithmSchema>;

export const SGraphHeuristicKindSchema = z.enum([
  'ZERO',
  'GRAPH_LOWER_BOUND',
  'PCA_LATENT_ESTIMATE',
  'SPECTRAL_ESTIMATE',
  'LEARNED_ESTIMATE',
]);
export type SGraphHeuristicKind = z.infer<typeof SGraphHeuristicKindSchema>;

export const SGraphHeuristicAdmissibilitySchema = z.enum([
  'PROVEN_LOWER_BOUND',
  'UNPROVEN',
  'NOT_REQUIRED',
]);
export type SGraphHeuristicAdmissibility = z.infer<typeof SGraphHeuristicAdmissibilitySchema>;

export const SGraphEdgeCostModelSchema = z.enum([
  'UNIFORM',
  'EDGE_KIND_COST',
]);
export type SGraphEdgeCostModel = z.infer<typeof SGraphEdgeCostModelSchema>;

export const SGraphSearchPlanV1Schema = z.object({
  schema: z.literal('atlas.s-graph-search-plan.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  algorithm: SGraphSearchAlgorithmSchema,
  sourceCanonicalId: z.string().min(1),
  targetCanonicalIds: z.array(z.string().min(1)).min(1).max(256),
  maxDepth: z.number().int().min(1).max(64),
  maxExpansions: z.number().int().min(1).max(1_000_000),
  beamWidth: z.number().int().min(1).max(4096).nullable(),
  edgeCostModel: SGraphEdgeCostModelSchema,
  heuristicKind: SGraphHeuristicKindSchema,
  heuristicAdmissibility: SGraphHeuristicAdmissibilitySchema,
  requireOptimalPath: z.boolean(),
  exactPromotionRequired: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();
export type SGraphSearchPlanV1 = z.infer<typeof SGraphSearchPlanV1Schema>;

export const SGraphSearchReceiptV1Schema = z.object({
  schema: z.literal('atlas.s-graph-search-receipt.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  algorithm: SGraphSearchAlgorithmSchema,
  executor: z.literal('TYPESCRIPT_REFERENCE'),
  heuristicKind: SGraphHeuristicKindSchema,
  heuristicAdmissibility: SGraphHeuristicAdmissibilitySchema,
  found: z.boolean(),
  targetCanonicalId: z.string().min(1).nullable(),
  pathCanonicalIds: z.array(z.string().min(1)),
  pathEdgeKinds: z.array(z.string().min(1)),
  pathCost: z.number().finite().nonnegative().nullable(),
  expandedNodeCount: z.number().int().nonnegative(),
  frontierPeak: z.number().int().nonnegative(),
  maxDepthObserved: z.number().int().nonnegative(),
  termination: z.enum(['TARGET_FOUND', 'BUDGET_EXHAUSTED', 'UNREACHABLE']),
  optimalityClaim: z.enum([
    'SHORTEST_HOPS',
    'LOWEST_NONNEGATIVE_COST',
    'CONDITIONAL_ON_ADMISSIBLE_HEURISTIC',
    'NONE',
  ]),
  approximate: z.boolean(),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type SGraphSearchReceiptV1 = z.infer<typeof SGraphSearchReceiptV1Schema>;

export interface SGraphSearchRuntimeInput {
  graph: SGraphV1;
  plan: SGraphSearchPlanV1;
  /** Non-negative edge cost by relation kind. Missing kinds default to 1. */
  edgeCostsByKind?: Partial<Record<SGraphEdgeKind, number>>;
  /** h(n): estimated remaining cost to the nearest target. */
  heuristicByCanonicalId?: Readonly<Record<string, number>>;
}

interface SearchEdge {
  edge: SGraphEdgeV1;
  target: SGraphNodeV1;
  cost: number;
}

interface ParentStep {
  parentId: string;
  edgeKind: SGraphEdgeKind;
}

interface FrontierState {
  nodeId: string;
  g: number;
  h: number;
  depth: number;
}

interface SearchCoreResult {
  foundNodeId: string | null;
  parents: Map<string, ParentStep>;
  bestG: Map<string, number>;
  expandedNodeCount: number;
  frontierPeak: number;
  maxDepthObserved: number;
  budgetExhausted: boolean;
}

const finiteNonNegative = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be finite and non-negative`);
  return value;
};

function buildIndex(graph: SGraphV1): {
  nodeById: Map<string, SGraphNodeV1>;
  nodeByCanonicalId: Map<string, SGraphNodeV1>;
  outgoing: Map<string, SearchEdge[]>;
} {
  const nodeById = new Map<string, SGraphNodeV1>();
  const nodeByCanonicalId = new Map<string, SGraphNodeV1>();
  for (const node of graph.nodes) {
    if (nodeById.has(node.id)) throw new Error(`duplicate SGraph node id: ${node.id}`);
    if (nodeByCanonicalId.has(node.canonicalId)) {
      throw new Error(`duplicate SGraph canonicalId is ambiguous for search: ${node.canonicalId}`);
    }
    nodeById.set(node.id, node);
    nodeByCanonicalId.set(node.canonicalId, node);
  }

  const outgoing = new Map<string, SearchEdge[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);

  return { nodeById, nodeByCanonicalId, outgoing };
}

function edgeCost(
  edge: SGraphEdgeV1,
  model: SGraphEdgeCostModel,
  costs: Partial<Record<SGraphEdgeKind, number>> | undefined,
): number {
  if (model === 'UNIFORM') return 1;
  return finiteNonNegative(costs?.[edge.kind] ?? 1, `edge cost ${edge.kind}`);
}

function populateEdges(
  graph: SGraphV1,
  nodeById: Map<string, SGraphNodeV1>,
  outgoing: Map<string, SearchEdge[]>,
  model: SGraphEdgeCostModel,
  costs: Partial<Record<SGraphEdgeKind, number>> | undefined,
): void {
  for (const edge of graph.edges) {
    const target = nodeById.get(edge.target);
    if (!nodeById.has(edge.source) || !target) {
      throw new Error(`SGraph search edge references missing node: ${edge.source} -> ${edge.target}`);
    }
    outgoing.get(edge.source)?.push({ edge, target, cost: edgeCost(edge, model, costs) });
  }
  for (const [nodeId, edges] of outgoing) {
    outgoing.set(nodeId, edges.sort((a, b) =>
      a.target.canonicalId.localeCompare(b.target.canonicalId)
      || a.edge.kind.localeCompare(b.edge.kind)
      || a.edge.target.localeCompare(b.edge.target)));
  }
}

function heuristic(
  node: SGraphNodeV1,
  plan: SGraphSearchPlanV1,
  values: Readonly<Record<string, number>> | undefined,
): number {
  if (plan.heuristicKind === 'ZERO') return 0;
  const value = values?.[node.canonicalId] ?? 0;
  return finiteNonNegative(value, `heuristic ${node.canonicalId}`);
}

function validatePlan(plan: SGraphSearchPlanV1): void {
  if (plan.algorithm === 'BEAM' && plan.beamWidth === null) {
    throw new Error('BEAM search requires beamWidth');
  }
  if (plan.algorithm !== 'BEAM' && plan.beamWidth !== null) {
    throw new Error('beamWidth is only valid for BEAM search');
  }
  if (plan.algorithm === 'A_STAR' && plan.requireOptimalPath) {
    const admissible = plan.heuristicKind === 'ZERO'
      || plan.heuristicAdmissibility === 'PROVEN_LOWER_BOUND';
    if (!admissible) {
      throw new Error('Optimal A* requires ZERO or a proven lower-bound heuristic');
    }
  }
  if (plan.algorithm === 'BREADTH_FIRST' && plan.requireOptimalPath && plan.edgeCostModel !== 'UNIFORM') {
    throw new Error('BFS can claim an optimal path only for uniform edge costs');
  }
  if ((plan.algorithm === 'GREEDY_BEST_FIRST' || plan.algorithm === 'BEAM') && plan.requireOptimalPath) {
    throw new Error(`${plan.algorithm} cannot claim path optimality`);
  }
}

function reconstructPath(
  sourceId: string,
  targetId: string,
  parents: Map<string, ParentStep>,
  nodeById: Map<string, SGraphNodeV1>,
): { nodeIds: string[]; canonicalIds: string[]; edgeKinds: SGraphEdgeKind[] } {
  const nodeIds = [targetId];
  const edgeKinds: SGraphEdgeKind[] = [];
  let cursor = targetId;
  while (cursor !== sourceId) {
    const step = parents.get(cursor);
    if (!step) throw new Error(`broken parent chain at ${cursor}`);
    nodeIds.push(step.parentId);
    edgeKinds.push(step.edgeKind);
    cursor = step.parentId;
  }
  nodeIds.reverse();
  edgeKinds.reverse();
  return {
    nodeIds,
    canonicalIds: nodeIds.map((id) => {
      const node = nodeById.get(id);
      if (!node) throw new Error(`missing path node ${id}`);
      return node.canonicalId;
    }),
    edgeKinds,
  };
}

function runBreadthFirst(input: {
  source: SGraphNodeV1;
  targetIds: Set<string>;
  outgoing: Map<string, SearchEdge[]>;
  maxDepth: number;
  maxExpansions: number;
}): SearchCoreResult {
  const queue: FrontierState[] = [{ nodeId: input.source.id, g: 0, h: 0, depth: 0 }];
  const seen = new Set<string>([input.source.id]);
  const parents = new Map<string, ParentStep>();
  const bestG = new Map<string, number>([[input.source.id, 0]]);
  let expandedNodeCount = 0;
  let frontierPeak = 1;
  let maxDepthObserved = 0;

  while (queue.length > 0) {
    if (expandedNodeCount >= input.maxExpansions) {
      return { foundNodeId: null, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: true };
    }
    const current = queue.shift();
    if (!current) break;
    if (input.targetIds.has(current.nodeId)) {
      return { foundNodeId: current.nodeId, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: false };
    }
    if (current.depth >= input.maxDepth) continue;
    expandedNodeCount += 1;

    for (const next of input.outgoing.get(current.nodeId) ?? []) {
      if (seen.has(next.target.id)) continue;
      seen.add(next.target.id);
      parents.set(next.target.id, { parentId: current.nodeId, edgeKind: next.edge.kind });
      bestG.set(next.target.id, current.g + next.cost);
      const depth = current.depth + 1;
      maxDepthObserved = Math.max(maxDepthObserved, depth);
      queue.push({ nodeId: next.target.id, g: current.g + next.cost, h: 0, depth });
    }
    frontierPeak = Math.max(frontierPeak, queue.length);
  }

  return { foundNodeId: null, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: false };
}

function priorityFor(algorithm: SGraphSearchAlgorithm, state: FrontierState): number {
  switch (algorithm) {
    case 'UNIFORM_COST': return state.g;
    case 'GREEDY_BEST_FIRST': return state.h;
    case 'A_STAR': return state.g + state.h;
    case 'BREADTH_FIRST': return state.depth;
    case 'BEAM': return state.h;
  }
}

function runPrioritySearch(input: {
  algorithm: 'UNIFORM_COST' | 'GREEDY_BEST_FIRST' | 'A_STAR';
  source: SGraphNodeV1;
  targetIds: Set<string>;
  outgoing: Map<string, SearchEdge[]>;
  nodeById: Map<string, SGraphNodeV1>;
  plan: SGraphSearchPlanV1;
  heuristicValues?: Readonly<Record<string, number>>;
}): SearchCoreResult {
  const start: FrontierState = {
    nodeId: input.source.id,
    g: 0,
    h: heuristic(input.source, input.plan, input.heuristicValues),
    depth: 0,
  };
  const frontier: FrontierState[] = [start];
  const parents = new Map<string, ParentStep>();
  const bestG = new Map<string, number>([[input.source.id, 0]]);
  let expandedNodeCount = 0;
  let frontierPeak = 1;
  let maxDepthObserved = 0;

  const sortFrontier = (): void => {
    frontier.sort((a, b) => {
      const p = priorityFor(input.algorithm, a) - priorityFor(input.algorithm, b);
      if (p !== 0) return p;
      if (a.g !== b.g) return a.g - b.g;
      if (a.depth !== b.depth) return a.depth - b.depth;
      const aNode = input.nodeById.get(a.nodeId);
      const bNode = input.nodeById.get(b.nodeId);
      return (aNode?.canonicalId ?? a.nodeId).localeCompare(bNode?.canonicalId ?? b.nodeId);
    });
  };

  while (frontier.length > 0) {
    if (expandedNodeCount >= input.plan.maxExpansions) {
      return { foundNodeId: null, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: true };
    }
    sortFrontier();
    const current = frontier.shift();
    if (!current) break;

    const knownBest = bestG.get(current.nodeId);
    if (knownBest !== undefined && current.g > knownBest + 1e-12) continue;
    if (input.targetIds.has(current.nodeId)) {
      return { foundNodeId: current.nodeId, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: false };
    }
    if (current.depth >= input.plan.maxDepth) continue;
    expandedNodeCount += 1;

    for (const next of input.outgoing.get(current.nodeId) ?? []) {
      const nextG = current.g + next.cost;
      const previousG = bestG.get(next.target.id);
      const shouldRelax = previousG === undefined
        || nextG < previousG - 1e-12
        || input.algorithm === 'GREEDY_BEST_FIRST';
      if (!shouldRelax) continue;

      if (input.algorithm !== 'GREEDY_BEST_FIRST' || previousG === undefined || nextG < previousG - 1e-12) {
        bestG.set(next.target.id, nextG);
        parents.set(next.target.id, { parentId: current.nodeId, edgeKind: next.edge.kind });
      }
      const depth = current.depth + 1;
      maxDepthObserved = Math.max(maxDepthObserved, depth);
      frontier.push({
        nodeId: next.target.id,
        g: nextG,
        h: heuristic(next.target, input.plan, input.heuristicValues),
        depth,
      });
    }
    frontierPeak = Math.max(frontierPeak, frontier.length);
  }

  return { foundNodeId: null, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: false };
}

function runBeam(input: {
  source: SGraphNodeV1;
  targetIds: Set<string>;
  outgoing: Map<string, SearchEdge[]>;
  nodeById: Map<string, SGraphNodeV1>;
  plan: SGraphSearchPlanV1;
  heuristicValues?: Readonly<Record<string, number>>;
}): SearchCoreResult {
  const width = input.plan.beamWidth ?? 1;
  let frontier: FrontierState[] = [{
    nodeId: input.source.id,
    g: 0,
    h: heuristic(input.source, input.plan, input.heuristicValues),
    depth: 0,
  }];
  const parents = new Map<string, ParentStep>();
  const bestG = new Map<string, number>([[input.source.id, 0]]);
  const seen = new Set<string>([input.source.id]);
  let expandedNodeCount = 0;
  let frontierPeak = 1;
  let maxDepthObserved = 0;

  for (let depth = 0; frontier.length > 0 && depth <= input.plan.maxDepth; depth += 1) {
    const target = frontier.find((state) => input.targetIds.has(state.nodeId));
    if (target) {
      return { foundNodeId: target.nodeId, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: false };
    }
    if (depth === input.plan.maxDepth) break;
    if (expandedNodeCount >= input.plan.maxExpansions) {
      return { foundNodeId: null, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: true };
    }

    const nextLayer: FrontierState[] = [];
    for (const current of frontier) {
      if (expandedNodeCount >= input.plan.maxExpansions) break;
      expandedNodeCount += 1;
      for (const next of input.outgoing.get(current.nodeId) ?? []) {
        if (seen.has(next.target.id)) continue;
        const nextG = current.g + next.cost;
        const nextDepth = current.depth + 1;
        nextLayer.push({
          nodeId: next.target.id,
          g: nextG,
          h: heuristic(next.target, input.plan, input.heuristicValues),
          depth: nextDepth,
        });
        if (!parents.has(next.target.id)) {
          parents.set(next.target.id, { parentId: current.nodeId, edgeKind: next.edge.kind });
          bestG.set(next.target.id, nextG);
        }
      }
    }

    nextLayer.sort((a, b) => {
      if (a.h !== b.h) return a.h - b.h;
      if (a.g !== b.g) return a.g - b.g;
      const aNode = input.nodeById.get(a.nodeId);
      const bNode = input.nodeById.get(b.nodeId);
      return (aNode?.canonicalId ?? a.nodeId).localeCompare(bNode?.canonicalId ?? b.nodeId);
    });

    frontier = [];
    for (const state of nextLayer) {
      if (seen.has(state.nodeId)) continue;
      seen.add(state.nodeId);
      frontier.push(state);
      if (frontier.length >= width) break;
    }
    frontierPeak = Math.max(frontierPeak, frontier.length, nextLayer.length);
    maxDepthObserved = Math.max(maxDepthObserved, ...frontier.map((state) => state.depth), 0);
  }

  return { foundNodeId: null, parents, bestG, expandedNodeCount, frontierPeak, maxDepthObserved, budgetExhausted: expandedNodeCount >= input.plan.maxExpansions };
}

function optimalityClaim(plan: SGraphSearchPlanV1): SGraphSearchReceiptV1['optimalityClaim'] {
  if (plan.algorithm === 'BREADTH_FIRST' && plan.edgeCostModel === 'UNIFORM') return 'SHORTEST_HOPS';
  if (plan.algorithm === 'UNIFORM_COST') return 'LOWEST_NONNEGATIVE_COST';
  if (plan.algorithm === 'A_STAR' && (plan.heuristicKind === 'ZERO' || plan.heuristicAdmissibility === 'PROVEN_LOWER_BOUND')) {
    return plan.heuristicKind === 'ZERO'
      ? 'LOWEST_NONNEGATIVE_COST'
      : 'CONDITIONAL_ON_ADMISSIBLE_HEURISTIC';
  }
  return 'NONE';
}

/**
 * Deterministic bounded reference search.
 *
 * PCA/latent/spectral/learned heuristics may guide GREEDY, BEAM, or bounded A*,
 * but they are not assumed admissible. Exact A* optimality is allowed only
 * with a zero heuristic or a separately proven lower bound.
 */
export function searchSGraph(input: SGraphSearchRuntimeInput): SGraphSearchReceiptV1 {
  const graph = SGraphV1Schema.parse(input.graph);
  const plan = SGraphSearchPlanV1Schema.parse(input.plan);
  validatePlan(plan);

  if (graph.workspaceRevision !== plan.workspaceRevision) {
    throw new Error('SGraph workspace revision does not match search plan');
  }
  if (graph.graphRevision !== plan.graphRevision) {
    throw new Error('SGraph graph revision does not match search plan');
  }

  const { nodeById, nodeByCanonicalId, outgoing } = buildIndex(graph);
  populateEdges(graph, nodeById, outgoing, plan.edgeCostModel, input.edgeCostsByKind);

  const source = nodeByCanonicalId.get(plan.sourceCanonicalId);
  if (!source) throw new Error(`SGraph search source is missing: ${plan.sourceCanonicalId}`);
  const targetIds = new Set<string>();
  for (const canonicalId of plan.targetCanonicalIds) {
    const node = nodeByCanonicalId.get(canonicalId);
    if (node) targetIds.add(node.id);
  }
  if (targetIds.size === 0) throw new Error('None of the SGraph search targets exist in this graph revision');

  let core: SearchCoreResult;
  if (plan.algorithm === 'BREADTH_FIRST') {
    core = runBreadthFirst({
      source,
      targetIds,
      outgoing,
      maxDepth: plan.maxDepth,
      maxExpansions: plan.maxExpansions,
    });
  } else if (plan.algorithm === 'BEAM') {
    core = runBeam({ source, targetIds, outgoing, nodeById, plan, heuristicValues: input.heuristicByCanonicalId });
  } else {
    core = runPrioritySearch({
      algorithm: plan.algorithm,
      source,
      targetIds,
      outgoing,
      nodeById,
      plan,
      heuristicValues: input.heuristicByCanonicalId,
    });
  }

  let targetCanonicalId: string | null = null;
  let pathCanonicalIds: string[] = [];
  let pathEdgeKinds: SGraphEdgeKind[] = [];
  let pathCost: number | null = null;
  if (core.foundNodeId) {
    const path = reconstructPath(source.id, core.foundNodeId, core.parents, nodeById);
    targetCanonicalId = nodeById.get(core.foundNodeId)?.canonicalId ?? null;
    pathCanonicalIds = path.canonicalIds;
    pathEdgeKinds = path.edgeKinds;
    pathCost = core.bestG.get(core.foundNodeId) ?? null;
  }

  const claim = optimalityClaim(plan);
  const approximate = claim === 'NONE'
    || (claim === 'CONDITIONAL_ON_ADMISSIBLE_HEURISTIC' && plan.heuristicAdmissibility !== 'PROVEN_LOWER_BOUND');

  return SGraphSearchReceiptV1Schema.parse({
    schema: 'atlas.s-graph-search-receipt.v1',
    requestId: plan.requestId,
    workspaceRevision: plan.workspaceRevision,
    graphRevision: plan.graphRevision,
    algorithm: plan.algorithm,
    executor: 'TYPESCRIPT_REFERENCE',
    heuristicKind: plan.heuristicKind,
    heuristicAdmissibility: plan.heuristicAdmissibility,
    found: core.foundNodeId !== null,
    targetCanonicalId,
    pathCanonicalIds,
    pathEdgeKinds,
    pathCost,
    expandedNodeCount: core.expandedNodeCount,
    frontierPeak: core.frontierPeak,
    maxDepthObserved: core.maxDepthObserved,
    termination: core.foundNodeId
      ? 'TARGET_FOUND'
      : core.budgetExhausted
        ? 'BUDGET_EXHAUSTED'
        : 'UNREACHABLE',
    optimalityClaim: claim,
    approximate,
    exactPromotionRequired: true,
    canonicalWrites: false,
    producerRevision: plan.producerRevision,
  });
}
