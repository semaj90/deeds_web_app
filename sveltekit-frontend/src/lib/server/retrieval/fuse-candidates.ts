/**
 * Stage 2: Reciprocal Rank Fusion (RRF)
 *
 * Only one fusion implementation. All candidate merging happens here.
 * No other score combiners exist in the codebase.
 *
 * RRF formula: score = Σ(1 / (k + rank))
 * - k = 60 (standard constant)
 * - Sums across all retrieval sources
 * - Deterministic ranking for reproducibility
 */

import type { Candidate } from './search-runtime.js';

export interface FusedCandidate extends Candidate {
  fusionScore: number;
  rankBefore: number;
  sourceCount: number;
  contributingLanes?: Candidate['scoreSource'][];
}

const RRF_CONSTANT = 60;

/**
 * Fuse candidates from multiple retrieval sources using RRF
 * Returns ranked list with fusion scores
 */
export function fuseCandidates(candidates: Candidate[]): FusedCandidate[] {
  // Validate at adapter boundary — drop malformed candidates before grouping
  const valid = candidates.filter(c =>
    c.packetKey && c.packetKey.trim() !== '' &&
    c.sourceRef && c.sourceRef.trim() !== ''
  );

  const identityKey = (candidate: Candidate) => candidate.symbolVersionId?.trim() || candidate.packetKey;

  // Group candidates by packet_key to identify which sources mentioned each
  const groupedByKey = new Map<string, Candidate[]>();
  for (const candidate of valid) {
    const key = identityKey(candidate);
    if (!groupedByKey.has(key)) {
      groupedByKey.set(key, []);
    }
    groupedByKey.get(key)!.push(candidate);
  }

  // Get unique sources
  const sources = new Set<string>();
  for (const candidate of valid) {
    sources.add(candidate.scoreSource);
  }

  // Rank candidates within each source
  const sourceRanks = new Map<string, Map<string, number>>();
  for (const source of sources) {
    const sourceCards = valid.filter(c => c.scoreSource === source);
    // Sort by original score (descending)
    const sorted = [...sourceCards].sort((a, b) => b.score - a.score || identityKey(a).localeCompare(identityKey(b)));
    const ranks = new Map<string, number>();
    sorted.forEach((c, idx) => {
      ranks.set(identityKey(c), idx + 1);
    });
    sourceRanks.set(source, ranks);
  }

  // Compute RRF scores
  const rrfScores = new Map<string, number>();
  for (const [packetKey, cardsWithKey] of groupedByKey) {
    let rrfScore = 0;
    for (const source of sources) {
      const sourceRanking = sourceRanks.get(source);
      if (sourceRanking) {
        const rank = sourceRanking.get(packetKey);
        if (rank) {
          rrfScore += 1 / (RRF_CONSTANT + rank);
        }
      }
    }
    rrfScores.set(packetKey, rrfScore);
  }

  // Sort by RRF score (descending) and create fused candidates
  const sorted = Array.from(groupedByKey.entries())
    .sort(([keyA], [keyB]) => {
      const scoreA = rrfScores.get(keyA) ?? 0;
      const scoreB = rrfScores.get(keyB) ?? 0;
      return scoreB - scoreA;
    })
    .map(([packetKey, cardsWithKey], rank) => {
      // Use first occurrence as base (they're all the same packet)
      const base = cardsWithKey[0]!;
      const contributingLanes = Array.from(new Set(cardsWithKey.map((candidate) => candidate.scoreSource)));
      return {
        ...base,
        fusionScore: rrfScores.get(packetKey) ?? 0,
        rankBefore: rank + 1,
        sourceCount: cardsWithKey.length,
        contributingLanes,
      };
    });

  return sorted;
}

/**
 * Explain fusion result for a specific candidate
 * Useful for debugging and transparency
 */
export function explainFusionScore(
  candidate: FusedCandidate,
  allCandidates: Candidate[],
): {
  packetKey: string;
  fusionScore: number;
  contributors: Array<{
    source: string;
    originalScore: number;
    rank: number;
    rrfContribution: number;
  }>;
} {
  const contributors = [];

  const identityKey = (row: Candidate) => row.symbolVersionId?.trim() || row.packetKey;
  // Find all instances of this symbol or packet from different sources
  const instances = allCandidates.filter(c => identityKey(c) === identityKey(candidate));

  // Group by source and get ranking
  const sourceRanks = new Map<string, number>();
  const sources = new Set<string>();

  for (const instance of instances) {
    sources.add(instance.scoreSource);
  }

  // Compute ranks for this candidate within each source
  for (const source of sources) {
    const sourceCards = allCandidates.filter(c => c.scoreSource === source);
    const sorted = [...sourceCards].sort((a, b) => b.score - a.score || identityKey(a).localeCompare(identityKey(b)));
    const rankInSource = sorted.findIndex(c => identityKey(c) === identityKey(candidate)) + 1;
    if (rankInSource > 0) {
      sourceRanks.set(source, rankInSource);
    }
  }

  // Build contributor list
  for (const [source, rank] of sourceRanks) {
    const rrfContribution = 1 / (RRF_CONSTANT + rank);
    const originalScore = instances.find(i => i.scoreSource === source)?.score ?? 0;
    contributors.push({
      source,
      originalScore,
      rank,
      rrfContribution,
    });
  }

  return {
    packetKey: candidate.packetKey,
    fusionScore: candidate.fusionScore,
    contributors,
  };
}
