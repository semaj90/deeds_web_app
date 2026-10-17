export const STAGE5_PAGERANK_CONFIGURATION_V1 = Object.freeze({
  algorithm: 'networkx.pagerank',
  alpha: 0.85,
  max_iter: 100,
  tol: 1e-8,
  weight: null,
  dangling: 'uniform',
  graphKind: 'directed-unweighted-simple',
  nodeOrder: 'unicode-codepoint',
  edgeOrder: 'source-target-unicode-codepoint',
});

function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

export function computePageRankV1({ nodes, edges, alpha = 0.85, maxIterations = 100, tolerance = 1e-8 }) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new TypeError('PAGERANK_GRAPH_INPUT_INVALID');
  if (!Number.isFinite(alpha) || alpha < 0 || alpha >= 1) throw new RangeError('PAGERANK_ALPHA_INVALID');
  if (!Number.isInteger(maxIterations) || maxIterations < 1) throw new RangeError('PAGERANK_ITERATIONS_INVALID');
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('PAGERANK_TOLERANCE_INVALID');

  const orderedNodes = [...new Set(nodes)];
  if (orderedNodes.some((node) => typeof node !== 'string' || node.length === 0)) {
    throw new TypeError('PAGERANK_NODE_KEY_INVALID');
  }
  orderedNodes.sort(compareCodePoints);
  if (orderedNodes.length === 0) return new Map();

  const nodeSet = new Set(orderedNodes);
  const edgeKeys = new Set();
  const orderedEdges = [];
  for (const edge of edges) {
    if (!edge || typeof edge.source !== 'string' || typeof edge.target !== 'string'
      || !nodeSet.has(edge.source) || !nodeSet.has(edge.target)) {
      throw new Error('PAGERANK_EDGE_ENDPOINT_UNKNOWN');
    }
    const key = `${edge.source}\u0000${edge.target}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    orderedEdges.push({ source: edge.source, target: edge.target });
  }
  orderedEdges.sort((left, right) => compareCodePoints(left.source, right.source)
    || compareCodePoints(left.target, right.target));

  const outgoing = new Map(orderedNodes.map((node) => [node, 0]));
  const incoming = new Map(orderedNodes.map((node) => [node, []]));
  for (const edge of orderedEdges) {
    outgoing.set(edge.source, outgoing.get(edge.source) + 1);
    incoming.get(edge.target).push(edge.source);
  }

  const initial = 1 / orderedNodes.length;
  let scores = new Map(orderedNodes.map((node) => [node, initial]));
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let danglingMass = 0;
    for (const node of orderedNodes) {
      if (outgoing.get(node) === 0) danglingMass += scores.get(node);
    }
    const baseScore = (1 - alpha) / orderedNodes.length + alpha * danglingMass / orderedNodes.length;
    const nextScores = new Map();
    for (const node of orderedNodes) {
      let incomingMass = 0;
      for (const source of incoming.get(node)) incomingMass += scores.get(source) / outgoing.get(source);
      nextScores.set(node, baseScore + alpha * incomingMass);
    }
    const error = orderedNodes.reduce((sum, node) => sum + Math.abs(nextScores.get(node) - scores.get(node)), 0);
    scores = nextScores;
    if (error < orderedNodes.length * tolerance) break;
  }
  return scores;
}

export function getTopPageRankV1(scores, limit = 20) {
  if (!(scores instanceof Map) || !Number.isInteger(limit) || limit < 0) throw new TypeError('PAGERANK_TOP_K_INPUT_INVALID');
  return [...scores.entries()]
    .sort(([leftNode, leftScore], [rightNode, rightScore]) => rightScore - leftScore || compareCodePoints(leftNode, rightNode))
    .slice(0, limit);
}
