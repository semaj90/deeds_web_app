/**
 * Read-only grouped ranking baseline for retrieval-logic convergence.
 *
 * This is an evaluation profile, not a replacement for runtime-reranker.ts.
 * Missing signals are omitted from their group and active group weights are
 * renormalized. Executor identity is deliberately not a scoring input.
 */

export const GROUPED_RANKING_BASELINE_V1_SCHEMA = 'atlas.grouped-ranking-baseline.v1' as const;

export const GROUPED_RANKING_BASELINE_V1_WEIGHTS = {
  semantic: 0.5,
  lexical: 0.2,
  structural: 0.15,
  ontologyGraph: 0.1,
  directoryDomainTopology: 0.05,
} as const;

export type GroupedRankingBaselineGroup = keyof typeof GROUPED_RANKING_BASELINE_V1_WEIGHTS;

export interface GroupedRankingSignalsV1 {
  semantic?: number;
  lexical?: number;
  structural?: number;
  ontology?: number;
  graph?: number;
  directory?: number;
  domain?: number;
  topology?: number;
}

export interface GroupedRankingCandidateV1 {
  packetKey: string;
  retrievedRank: number;
  signals: GroupedRankingSignalsV1;
}

export interface GroupedRankingResultV1 extends GroupedRankingCandidateV1 {
  score: number;
  rank: number;
  groupScores: Record<GroupedRankingBaselineGroup, number | null>;
  activeGroups: GroupedRankingBaselineGroup[];
}

function finiteScore(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function mean(values: Array<number | undefined>): number | null {
  const present = values.map(finiteScore).filter((value): value is number => value !== undefined);
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function groupScores(signals: GroupedRankingSignalsV1): Record<GroupedRankingBaselineGroup, number | null> {
  return {
    semantic: mean([signals.semantic]),
    lexical: mean([signals.lexical]),
    structural: mean([signals.structural]),
    ontologyGraph: mean([signals.ontology, signals.graph]),
    directoryDomainTopology: mean([signals.directory, signals.domain, signals.topology]),
  };
}

export function scoreGroupedRankingBaselineV1(
  candidates: GroupedRankingCandidateV1[],
): GroupedRankingResultV1[] {
  const scored = candidates.map((candidate) => {
    const scores = groupScores(candidate.signals);
    const activeGroups = (Object.keys(GROUPED_RANKING_BASELINE_V1_WEIGHTS) as GroupedRankingBaselineGroup[])
      .filter((group) => scores[group] !== null);
    const activeWeight = activeGroups.reduce(
      (sum, group) => sum + GROUPED_RANKING_BASELINE_V1_WEIGHTS[group],
      0,
    );
    const score = activeWeight === 0
      ? 0
      : activeGroups.reduce(
          (sum, group) => sum + (scores[group] as number) * GROUPED_RANKING_BASELINE_V1_WEIGHTS[group],
          0,
        ) / activeWeight;

    return {
      ...candidate,
      score,
      rank: 0,
      groupScores: scores,
      activeGroups,
    } satisfies GroupedRankingResultV1;
  });

  return scored
    .sort((a, b) => b.score - a.score || a.retrievedRank - b.retrievedRank || a.packetKey.localeCompare(b.packetKey))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

/** Adapter for the existing candidate owner; no executor identity is included. */
export function groupedSignalsFromRerankCandidate(candidate: {
  denseScore?: number;
  bm25Score?: number;
  astScore?: number;
  graphScore?: number;
  pagerankScore?: number;
  domainScore?: number;
}): GroupedRankingSignalsV1 {
  return {
    semantic: candidate.denseScore,
    lexical: candidate.bm25Score,
    structural: candidate.astScore,
    graph: candidate.graphScore,
    domain: candidate.domainScore,
    topology: candidate.pagerankScore,
  };
}
