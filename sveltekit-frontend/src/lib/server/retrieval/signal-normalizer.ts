/**
 * @module signal-normalizer
 * @description Normalization and computation of topology-aware retrieval signals.
 * Converts canonical packet fields (topolog_cluster, community_id) into RRF-compatible scores.
 */

import type { CanonicalPacket } from '$lib/server/topology/feature-tracking-layer';

/**
 * Topology-aware signal: SOM cluster membership match.
 * Scores higher when query and candidate are in the same topological cluster.
 */
export function computeTopologClusterMatchSignal(
  candidatePacket: CanonicalPacket,
  queryPacket: CanonicalPacket | null,
  defaultScore: number = 0.5
): number {
  if (!queryPacket) return defaultScore;

  // Both packets must have topolog_cluster for meaningful comparison
  if (!candidatePacket.topolog_cluster || !queryPacket.topolog_cluster) {
    return defaultScore;
  }

  // Perfect match: same cluster
  if (candidatePacket.topolog_cluster === queryPacket.topolog_cluster) {
    return 1.0;
  }

  // Partial match: not ideal but better than default
  // This helps with cross-cluster relevance when direct clustering fails
  return defaultScore;
}

/**
 * Topology-aware signal: Community authority scoring.
 * Scores higher for candidates in high-authority communities (PageRank-adjacent).
 * Uses community_id as a proxy for authority grouping.
 */
export function computeCommunityAuthoritySignal(
  candidatePacket: CanonicalPacket,
  communityAuthority: Map<number, number> | null,
  defaultScore: number = 0.5
): number {
  if (!candidatePacket.community_id || !communityAuthority) {
    return defaultScore;
  }

  // Look up authority score for the candidate's community
  const authority = communityAuthority.get(candidatePacket.community_id);

  if (authority === undefined) {
    // Community exists but has no pre-computed authority
    return defaultScore;
  }

  // Authority is expected to be in range [0, 1] or [0, max_score]
  // Normalize to [0, 1] if needed
  const normalized = Math.min(authority, 1.0);
  return normalized;
}

/**
 * Combined topology signal: Weighted blend of cluster match + community authority.
 * Used in RRF fusion to boost candidates that are both semantically similar
 * AND topologically cohesive.
 */
export function computeTopologyBlendSignal(
  candidatePacket: CanonicalPacket,
  queryPacket: CanonicalPacket | null,
  communityAuthority: Map<number, number> | null,
  weights: { clusterMatch?: number; communityAuthority?: number } = {}
): number {
  const {
    clusterMatch: clusterWeight = 0.5,
    communityAuthority: authorityWeight = 0.5
  } = weights;

  const clusterScore = computeTopologClusterMatchSignal(candidatePacket, queryPacket, 0.5);
  const authorityScore = computeCommunityAuthoritySignal(candidatePacket, communityAuthority, 0.5);

  // Normalize weights to sum to 1.0
  const totalWeight = clusterWeight + authorityWeight;
  const normalizedClusterWeight = clusterWeight / totalWeight;
  const normalizedAuthorityWeight = authorityWeight / totalWeight;

  return normalizedClusterWeight * clusterScore + normalizedAuthorityWeight * authorityScore;
}

/**
 * Extract canonical packet from metadata or result object.
 * Handles different metadata formats (camelCase, snake_case, aliased).
 */
export function extractCanonicalPacketFromMetadata(
  metadata: Record<string, unknown> | undefined
): Partial<CanonicalPacket> | null {
  if (!metadata) return null;

  return {
    packet_key: (metadata.packet_key ?? metadata.packetKey ?? metadata.packet_id) as string,
    source_ref: (metadata.source_ref ?? metadata.sourceRef) as string,
    feature_id: (metadata.feature_id ?? metadata.featureId) as string,
    tree_node_id: (metadata.tree_node_id ?? metadata.treeNodeId) as string,
    domain_class: (metadata.domain_class ?? metadata.domainClass) as string,
    title_id: (metadata.title_id ?? metadata.titleId) as string,
    topolog_cluster: parseInt(
      String(metadata.topolog_cluster ?? metadata.topologCluster ?? metadata.som_cluster ?? 0)
    ),
    som_cluster: (metadata.som_cluster ?? metadata.somCluster) as string,
    community_id: parseInt(String(metadata.community_id ?? metadata.communityId ?? 0)),
    qdrant_point_id: (metadata.qdrant_point_id ?? metadata.qdrantPointId) as string,
    retrieval_strategy: (metadata.retrieval_strategy ?? metadata.retrievalStrategy) as string
  };
}

/**
 * Normalize RRF lane name for topology signals.
 * Maps generic lane names to specific topology lanes.
 */
export function getTopologyLaneName(
  baseSignal: 'cluster' | 'community',
  context?: string
): string {
  if (baseSignal === 'cluster') {
    return context === 'som' ? 'som_topology' : 'som_topology';
  }
  return 'neo4j_graph'; // community authority is neo4j-derived
}

/**
 * Build a community authority map from Neo4j PageRank scores.
 * Caches authority scores by community ID for fast lookup.
 */
export function buildCommunityAuthorityMap(
  pageRankScores: Array<{
    packet_id: string;
    community_id: number;
    pagerank: number;
  }>,
  communityAggregationStrategy: 'max' | 'mean' | 'median' = 'max'
): Map<number, number> {
  const communityScores = new Map<number, number[]>();

  // Group page rank scores by community
  for (const score of pageRankScores) {
    if (!score.community_id) continue;
    if (!communityScores.has(score.community_id)) {
      communityScores.set(score.community_id, []);
    }
    communityScores.get(score.community_id)!.push(score.pagerank);
  }

  // Aggregate scores within each community
  const communityAuthority = new Map<number, number>();
  for (const [communityId, scores] of communityScores) {
    let authority = 0;

    if (communityAggregationStrategy === 'max') {
      authority = Math.max(...scores);
    } else if (communityAggregationStrategy === 'mean') {
      authority = scores.reduce((a, b) => a + b, 0) / scores.length;
    } else if (communityAggregationStrategy === 'median') {
      const sorted = [...scores].sort((a, b) => a - b);
      authority = sorted[Math.floor(sorted.length / 2)] ?? 0;
    }

    communityAuthority.set(communityId, authority);
  }

  return communityAuthority;
}

/**
 * RRF weight configuration for topology signals.
 * These weights should be blended with base retrieval signal weights.
 *
 * Base signals (from current rrf-integration.ts):
 * - postgres_trigram: 1.0
 * - concept_overlap: 1.2
 * - qdrant_vector: 1.0
 * - turbovec_ann: 0.9
 * - neo4j_graph: 0.8
 *
 * New topology signals (P1 addition):
 * - topolog_cluster_match: 0.5 (adds 0.05 to total blend when query has cluster)
 * - community_authority: 0.3 (adds 0.03 to total blend when community exists)
 *
 * Total effective weights after normalization:
 * - postgres_trigram: 1.0
 * - concept_overlap: 1.2
 * - qdrant_vector: 1.0
 * - turbovec_ann: 0.9
 * - neo4j_graph: 0.8
 * - topolog_cluster_match: 0.5 (conditional)
 * - community_authority: 0.3 (conditional)
 */
export const TOPOLOGY_RRF_WEIGHTS = {
  topolog_cluster_match: 0.5,
  community_authority: 0.3
} as const;

/**
 * Helper to merge base RRF weights with topology weights.
 * Topology weights are conditional (only applied when relevant data available).
 */
export function mergeTopologyWeights(
  baseWeights: Record<string, number>,
  includeTopology: boolean = true
): Record<string, number> {
  if (!includeTopology) return baseWeights;

  return {
    ...baseWeights,
    topolog_cluster_match: TOPOLOGY_RRF_WEIGHTS.topolog_cluster_match,
    community_authority: TOPOLOGY_RRF_WEIGHTS.community_authority
  };
}