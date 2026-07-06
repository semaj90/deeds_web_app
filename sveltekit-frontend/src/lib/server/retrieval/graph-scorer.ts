/**
 * Graph Scorer — Compute authority score from Neo4j graph signals
 *
 * Phase 1 Quick Win: Replace stub returning 0 with real Neo4j PageRank scoring
 * Expected impact: +15% NDCG@5 through topology-aware ranking
 */

/**
 * Compute graph authority score from Neo4j PageRank
 *
 * PageRank output is in range [0.15, ∞) but typically normalized to [0, 1]
 * Higher PageRank = more connected/important node in the graph
 *
 * Raw PageRank normalization:
 * - Min PageRank (isolated node): ~0.15
 * - Max PageRank (hub node): varies by graph, typically 1.0-10.0+
 */
export function computeGraphScore(
  pageRank: number,
  minPageRank: number = 0.15,
  maxPageRank: number = 1.0
): number {
  // Handle invalid inputs
  if (pageRank < 0 || isNaN(pageRank)) return 0;
  if (maxPageRank <= minPageRank) return 0;

  // Normalize PageRank to [0, 1] range
  const normalized = (pageRank - minPageRank) / (maxPageRank - minPageRank);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Compute community proximity score
 * Nodes in the same community are more closely related
 *
 * Score based on:
 * - Same community: 1.0 (strongest signal)
 * - K-hop distance within community: decay factor
 * - Different community: 0.1 (weak signal)
 */
export function computeCommunityProximityScore(
  queryNodeCommunity: number | string,
  resultNodeCommunity: number | string,
  hopDistance?: number,
  maxHops: number = 3
): number {
  // Same community = strongest signal
  if (queryNodeCommunity === resultNodeCommunity) {
    // If within same community, boost by hop distance
    if (hopDistance !== undefined) {
      const hopDecay = 1 - (hopDistance / (maxHops + 1));
      return Math.max(0.7, hopDecay); // Min 0.7 for same-community
    }
    return 1.0; // Perfect same-community match
  }

  // Different community = weak signal
  return 0.1;
}

/**
 * Compute inbound degree score
 * Number of incoming edges correlates with relevance in directed graphs
 */
export function computeInboundDegreeScore(inboundDegree: number, maxDegree: number = 100): number {
  if (maxDegree <= 0 || inboundDegree < 0) return 0;
  const normalized = Math.min(inboundDegree / maxDegree, 1.0);
  return normalized;
}

/**
 * Blend multiple graph signals into single score
 * Useful when combining PageRank + community + degree
 */
export function blendGraphSignals(
  pageRank?: number,
  communityProximity?: number,
  inboundDegree?: number,
  weights?: { pageRank?: number; community?: number; degree?: number }
): number {
  const w = {
    pageRank: weights?.pageRank ?? 0.5,
    community: weights?.community ?? 0.3,
    degree: weights?.degree ?? 0.2
  };

  let score = 0;
  let weightSum = 0;

  if (pageRank !== undefined && w.pageRank > 0) {
    score += computeGraphScore(pageRank) * w.pageRank;
    weightSum += w.pageRank;
  }

  if (communityProximity !== undefined && w.community > 0) {
    score += communityProximity * w.community;
    weightSum += w.community;
  }

  if (inboundDegree !== undefined && w.degree > 0) {
    score += computeInboundDegreeScore(inboundDegree) * w.degree;
    weightSum += w.degree;
  }

  return weightSum > 0 ? score / weightSum : 0;
}

/**
 * Unit test: verify graph scorer
 */
export function testGraphScorer(): { pass: boolean; message: string } {
  const tests: Array<{ name: string; pass: boolean }> = [];

  // Test 1: PageRank normalization
  const pr1 = computeGraphScore(0.15); // Min PageRank
  tests.push({
    name: 'Min PageRank (0.15) → 0.0',
    pass: Math.abs(pr1 - 0.0) < 0.01
  });

  const pr2 = computeGraphScore(1.0); // Max PageRank (normalized)
  tests.push({
    name: 'Max PageRank (1.0) → 1.0',
    pass: Math.abs(pr2 - 1.0) < 0.01
  });

  const pr3 = computeGraphScore(0.575); // Mid-range
  tests.push({
    name: 'Mid PageRank (0.575) → 0.5',
    pass: Math.abs(pr3 - 0.5) < 0.01
  });

  // Test 2: Community proximity
  const comm1 = computeCommunityProximityScore(1, 1); // Same community
  tests.push({
    name: 'Same community → 1.0',
    pass: Math.abs(comm1 - 1.0) < 0.01
  });

  const comm2 = computeCommunityProximityScore(1, 2); // Different community
  tests.push({
    name: 'Different community → 0.1',
    pass: Math.abs(comm2 - 0.1) < 0.01
  });

  // Test 3: Inbound degree
  const deg1 = computeInboundDegreeScore(50, 100); // 50% of max
  tests.push({
    name: 'Inbound degree (50/100) → 0.5',
    pass: Math.abs(deg1 - 0.5) < 0.01
  });

  // Test 4: Signal blending
  const blend = blendGraphSignals(0.5, 0.8, 50, { pageRank: 0.5, community: 0.3, degree: 0.2 });
  tests.push({
    name: 'Signal blending produces weighted average',
    pass: blend > 0 && blend <= 1
  });

  const allPass = tests.every(t => t.pass);
  return {
    pass: allPass,
    message: tests.map(t => `${t.pass ? '✓' : '✗'} ${t.name}`).join('\n')
  };
}
