import { describe, expect, it } from 'vitest';
import {
  GROUPED_RANKING_BASELINE_V1_SCHEMA,
  GROUPED_RANKING_BASELINE_V1_WEIGHTS,
  groupedSignalsFromRerankCandidate,
  scoreGroupedRankingBaselineV1,
} from './grouped-ranking-baseline-v1.js';

describe('grouped ranking baseline v1', () => {
  it('uses the documented experiment weights and stable tie breaks', () => {
    expect(GROUPED_RANKING_BASELINE_V1_SCHEMA).toBe('atlas.grouped-ranking-baseline.v1');
    expect(Object.values(GROUPED_RANKING_BASELINE_V1_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(1);

    const ranked = scoreGroupedRankingBaselineV1([
      { packetKey: 'b', retrievedRank: 2, signals: { semantic: 0.8, lexical: 0.2 } },
      { packetKey: 'a', retrievedRank: 2, signals: { semantic: 0.8, lexical: 0.2 } },
    ]);

    expect(ranked.map((candidate) => candidate.packetKey)).toEqual(['a', 'b']);
    expect(ranked.map((candidate) => candidate.rank)).toEqual([1, 2]);
  });

  it('renormalizes only over groups with present finite signals', () => {
    const [result] = scoreGroupedRankingBaselineV1([
      {
        packetKey: 'p1',
        retrievedRank: 1,
        signals: { semantic: 1, ontology: 1, graph: 1 },
      },
    ]);

    expect(result.score).toBeCloseTo(1, 8);
    expect(result.activeGroups).toEqual(['semantic', 'ontologyGraph']);
    expect(result.groupScores.ontologyGraph).toBe(1);
  });

  it('does not silently convert missing signals into evidence', () => {
    const [result] = scoreGroupedRankingBaselineV1([
      { packetKey: 'p1', retrievedRank: 1, signals: { semantic: 0.8 } },
    ]);

    expect(result.score).toBe(0.8);
    expect(result.groupScores.lexical).toBeNull();
    expect(result.groupScores.ontologyGraph).toBeNull();
    expect(result.groupScores.directoryDomainTopology).toBeNull();
  });

  it('maps existing reranker signals without executor-specific weighting', () => {
    expect(groupedSignalsFromRerankCandidate({
      denseScore: 0.9,
      bm25Score: 0.7,
      astScore: 0.6,
      graphScore: 0.5,
      domainScore: 0.4,
      pagerankScore: 0.3,
    })).toEqual({
      semantic: 0.9,
      lexical: 0.7,
      structural: 0.6,
      graph: 0.5,
      domain: 0.4,
      topology: 0.3,
    });
  });

  it('keeps semantic executor identity outside the grouped evidence score', () => {
    const qdrant = groupedSignalsFromRerankCandidate({
      denseScore: 0.91,
      bm25Score: 0.4,
      astScore: 0.3,
    });
    const cuvs = groupedSignalsFromRerankCandidate({
      denseScore: 0.91,
      bm25Score: 0.4,
      astScore: 0.3,
    });

    expect(scoreGroupedRankingBaselineV1([
      { packetKey: 'q', retrievedRank: 1, signals: qdrant },
    ])[0].score).toBe(
      scoreGroupedRankingBaselineV1([
        { packetKey: 'c', retrievedRank: 1, signals: cuvs },
      ])[0].score,
    );
  });
});
