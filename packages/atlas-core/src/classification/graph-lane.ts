/**
 * Graph Classification Lane
 *
 * Domain classification via Neo4j graph traversal.
 * Combines community detection and PageRank authority to score entities.
 *
 * Phase 2 Step 3: July 28, 2026
 */

import { domainScoreSchema, type DomainScore, CANONICAL_DOMAINS } from '../validation/hybrid-semantic-classification.js';

/**
 * Community metadata from Neo4j
 */
export interface CommunityNode {
  nodeId: string;
  communityId: number;
  pageRankScore: number;  // Global authority [0, 1]
  domainTags: string[];   // Inferred domains (optional)
  confidence: number;     // Trust in this node [0, 1]
}

/**
 * Graph traversal result
 */
export interface GraphTraversalResult {
  entityId: string;
  visited: CommunityNode[];
  hops: number;
  domainScores: Record<string, number>;  // domain -> aggregate score
}

/**
 * Compute domain affinity from graph neighborhood
 * Uses community membership + PageRank authority + domain tags
 *
 * Score formula:
 * domain_score = (community_weight × community_affinity + authority_weight × pagerank)
 *   × confidence
 *
 * Where:
 * - community_affinity: fraction of neighbors with domain in tags
 * - pagerank: node's global authority score [0, 1]
 * - confidence: domain confidence from tags (higher if more neighbors agree)
 */
export function computeGraphDomainScore(
  visited: CommunityNode[],
  domain: string,
  communityWeight: number = 0.6,
  authorityWeight: number = 0.4
): number {
  if (visited.length === 0) return 0;

  // Count neighbors with this domain in tags
  const nodesWithDomain = visited.filter((n) => n.domainTags.includes(domain));
  const communityAffinity = nodesWithDomain.length / visited.length;

  // Average PageRank of all visited nodes
  const avgPageRank = visited.reduce((sum, n) => sum + n.pageRankScore, 0) / visited.length;

  // Compute confidence as agreement rate (higher = more consistent)
  const confidence = nodesWithDomain.length > 0 ? communityAffinity : 0;

  // Blend community signal with authority signal
  const rawScore = communityWeight * communityAffinity + authorityWeight * avgPageRank;

  // Apply confidence scaling (low confidence = lower score)
  return Math.max(0, Math.min(1, rawScore * confidence));
}

/**
 * Classify entity using graph neighborhood
 *
 * Returns top-K domains from graph traversal results
 */
export function classifyGraphSingle(
  entityId: string,
  visited: CommunityNode[],
  confidenceThreshold: number = 0.3,
  topK: number = 5,
  communityWeight: number = 0.6,
  authorityWeight: number = 0.4
): DomainScore[] {
  if (visited.length === 0) {
    return [];
  }

  // Compute scores for all canonical domains
  const domainKeys = Object.keys(CANONICAL_DOMAINS);
  const scores: DomainScore[] = domainKeys.map((domain) => {
    const score = computeGraphDomainScore(visited, domain, communityWeight, authorityWeight);
    return {
      domain,
      score,
      source: 'GRAPH_COMMUNITY' as const,
      explanation: `Graph neighbors: ${visited.length} nodes, PageRank avg: ${(visited.reduce((s, n) => s + n.pageRankScore, 0) / visited.length).toFixed(3)}`,
    };
  });

  // Filter by threshold and sort
  return scores
    .filter((s) => s.score >= confidenceThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Classify multiple entities using graph neighborhoods
 */
export function classifyGraphBatch(
  entities: Array<{ entityId: string; visited: CommunityNode[] }>,
  confidenceThreshold: number = 0.3,
  topK: number = 5,
  communityWeight: number = 0.6,
  authorityWeight: number = 0.4
): Record<string, DomainScore[]> {
  const results: Record<string, DomainScore[]> = {};

  for (const entity of entities) {
    results[entity.entityId] = classifyGraphSingle(
      entity.entityId,
      entity.visited,
      confidenceThreshold,
      topK,
      communityWeight,
      authorityWeight
    );
  }

  return results;
}

/**
 * Compute metrics from graph classifications
 */
export interface GraphLaneMetrics {
  totalEntities: number;
  classifiedEntities: number;
  coveragePercentage: number;
  averageConfidence: number;
  averageNeighbors: number;
  minConfidenceObserved: number;
  maxConfidenceObserved: number;
  confidenceVariance: number;
  averagePageRankObserved: number;
  communityDensity: number;  // Fraction of multi-domain nodes
}

export function computeGraphMetrics(
  classifications: Record<string, DomainScore[]>,
  traversalResults?: Array<{ entityId: string; visited: CommunityNode[] }>
): GraphLaneMetrics {
  const totalEntities = Object.keys(classifications).length;
  const classifiedEntities = Object.values(classifications).filter((scores) => scores.length > 0).length;

  const allScores = Object.values(classifications).flat().map((s) => s.score);

  const avgNeighbors =
    traversalResults && traversalResults.length > 0
      ? traversalResults.reduce((sum, r) => sum + r.visited.length, 0) / traversalResults.length
      : 0;

  const avgPageRank =
    traversalResults && traversalResults.length > 0
      ? traversalResults.reduce((sum, r) => {
          const pr = r.visited.length > 0 ? r.visited.reduce((ps, n) => ps + n.pageRankScore, 0) / r.visited.length : 0;
          return sum + pr;
        }, 0) / traversalResults.length
      : 0;

  // Community density: fraction of entities with multiple domain tags in neighbors
  const multiDomainEntities =
    traversalResults && traversalResults.length > 0
      ? traversalResults.filter((r) => {
          const uniqueDomains = new Set(r.visited.flatMap((n) => n.domainTags));
          return uniqueDomains.size > 1;
        }).length
      : 0;

  const communityDensity =
    traversalResults && traversalResults.length > 0 ? multiDomainEntities / traversalResults.length : 0;

  const minConfidence = allScores.length > 0 ? Math.min(...allScores) : 0;
  const maxConfidence = allScores.length > 0 ? Math.max(...allScores) : 0;
  const avgConfidence = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

  let variance = 0;
  if (allScores.length > 1) {
    variance =
      allScores.reduce((sum, s) => sum + Math.pow(s - avgConfidence, 2), 0) / (allScores.length - 1);
  }

  return {
    totalEntities,
    classifiedEntities,
    coveragePercentage: totalEntities > 0 ? (classifiedEntities / totalEntities) * 100 : 0,
    averageConfidence: avgConfidence,
    averageNeighbors: avgNeighbors,
    minConfidenceObserved: minConfidence,
    maxConfidenceObserved: maxConfidence,
    confidenceVariance: variance,
    averagePageRankObserved: avgPageRank,
    communityDensity,
  };
}



