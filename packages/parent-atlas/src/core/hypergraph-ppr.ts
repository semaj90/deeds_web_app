import type { FeatureRelationshipV1 } from './feature-intelligence.js';
import { projectRelationshipToIncidence } from './hypergraph-retrieval.js';

export type HypergraphPprConfigV1 = {
  /** Edge-follow damping factor; aligned with cuGraph/PageRank semantics. */
  alpha?: number;
  maximum_iterations?: number;
  tolerance?: number;
};

export type HypergraphPprReceiptV1 = {
  schema: 'atlas.hypergraph-ppr-receipt.v1';
  query_id: string;
  source_snapshot_revision: string;
  seed_entity_ids: string[];
  /** Edge-follow damping factor. Teleport probability is 1-alpha. */
  alpha: number;
  teleport_probability: number;
  iterations: number;
  converged: boolean;
  tolerance: number;
  node_count: number;
  incidence_edge_count: number;
  relationship_scores: Record<string, number>;
  entity_scores: Record<string, number>;
};

function normalizeDistribution(scores: Map<string, number>): void {
  const total = [...scores.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;
  for (const [key, value] of scores) scores.set(key, value / total);
}

/**
 * CPU reference PPR over the lossless bipartite incidence graph.
 * `alpha` matches cuGraph: probability of following an outgoing edge.
 * Teleport probability is therefore `1 - alpha`.
 */
export function runHypergraphPersonalizedPageRank(input: {
  query_id: string;
  source_snapshot_revision: string;
  seed_entity_ids: string[];
  relationships: FeatureRelationshipV1[];
  config?: HypergraphPprConfigV1;
}): HypergraphPprReceiptV1 {
  const alpha = input.config?.alpha ?? 0.85;
  const teleportProbability = 1 - alpha;
  const maximumIterations = input.config?.maximum_iterations ?? 100;
  const tolerance = input.config?.tolerance ?? 1e-10;
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha must be between 0 and 1');
  if (!Number.isInteger(maximumIterations) || maximumIterations < 1) throw new RangeError('maximum_iterations must be positive');
  if (!(tolerance > 0)) throw new RangeError('tolerance must be positive');

  const adjacency = new Map<string, Set<string>>();
  const entityCanonicalIds = new Map<string, string>();
  const relationshipCanonicalIds = new Map<string, string>();
  let incidenceEdgeCount = 0;

  const connect = (a: string, b: string) => {
    const left = adjacency.get(a) ?? new Set<string>();
    const right = adjacency.get(b) ?? new Set<string>();
    if (!left.has(b)) incidenceEdgeCount += 1;
    left.add(b);
    right.add(a);
    adjacency.set(a, left);
    adjacency.set(b, right);
  };

  for (const relationship of input.relationships) {
    const projection = projectRelationshipToIncidence(relationship);
    for (const node of projection.nodes) {
      if (!adjacency.has(node.node_id)) adjacency.set(node.node_id, new Set());
      if (node.node_kind === 'entity') entityCanonicalIds.set(node.node_id, node.canonical_id);
      else relationshipCanonicalIds.set(node.node_id, node.canonical_id);
    }
    for (const edge of projection.edges) connect(edge.entity_node_id, edge.relationship_node_id);
  }

  const nodes = [...adjacency.keys()].sort((a, b) => a.localeCompare(b));
  const seedNodeIds = nodes.filter((nodeId) => {
    const canonicalId = entityCanonicalIds.get(nodeId);
    return canonicalId != null && input.seed_entity_ids.includes(canonicalId);
  });
  if (seedNodeIds.length === 0) {
    return {
      schema: 'atlas.hypergraph-ppr-receipt.v1', query_id: input.query_id,
      source_snapshot_revision: input.source_snapshot_revision,
      seed_entity_ids: [...new Set(input.seed_entity_ids)].sort(),
      alpha, teleport_probability: teleportProbability, iterations: 0, converged: true,
      tolerance, node_count: nodes.length, incidence_edge_count: incidenceEdgeCount,
      relationship_scores: {}, entity_scores: {},
    };
  }

  const personalization = new Map<string, number>(nodes.map((nodeId) => [nodeId, 0]));
  const seedMass = 1 / seedNodeIds.length;
  for (const seed of seedNodeIds) personalization.set(seed, seedMass);

  let scores = new Map(personalization);
  let converged = false;
  let iterations = 0;

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const next = new Map<string, number>(
      nodes.map((nodeId) => [nodeId, teleportProbability * (personalization.get(nodeId) ?? 0)]),
    );
    let danglingMass = 0;

    for (const nodeId of nodes) {
      const neighbors = adjacency.get(nodeId) ?? new Set<string>();
      const score = scores.get(nodeId) ?? 0;
      if (neighbors.size === 0) { danglingMass += score; continue; }
      const share = alpha * score / neighbors.size;
      for (const neighbor of neighbors) next.set(neighbor, (next.get(neighbor) ?? 0) + share);
    }

    if (danglingMass > 0) {
      for (const nodeId of nodes) {
        next.set(nodeId, (next.get(nodeId) ?? 0) + alpha * danglingMass * (personalization.get(nodeId) ?? 0));
      }
    }

    normalizeDistribution(next);
    const delta = nodes.reduce(
      (sum, nodeId) => sum + Math.abs((next.get(nodeId) ?? 0) - (scores.get(nodeId) ?? 0)), 0,
    );
    scores = next;
    iterations = iteration;
    if (delta <= tolerance) { converged = true; break; }
  }

  const relationshipScores: Record<string, number> = {};
  const entityScores: Record<string, number> = {};
  for (const nodeId of nodes) {
    const score = scores.get(nodeId) ?? 0;
    const relationshipId = relationshipCanonicalIds.get(nodeId);
    const entityId = entityCanonicalIds.get(nodeId);
    if (relationshipId) relationshipScores[relationshipId] = score;
    if (entityId) entityScores[entityId] = (entityScores[entityId] ?? 0) + score;
  }

  return {
    schema: 'atlas.hypergraph-ppr-receipt.v1', query_id: input.query_id,
    source_snapshot_revision: input.source_snapshot_revision,
    seed_entity_ids: [...new Set(input.seed_entity_ids)].sort(), alpha,
    teleport_probability: teleportProbability, iterations, converged, tolerance,
    node_count: nodes.length, incidence_edge_count: incidenceEdgeCount,
    relationship_scores: relationshipScores, entity_scores: entityScores,
  };
}
