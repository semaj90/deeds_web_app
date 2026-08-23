import { describe, expect, it } from 'vitest';
import { groupXgboostRankingCandidatesV1, rankingLineageChecksumV1 } from './xgboost-ranking-lineage-v1.js';

const row = (queryId: string, candidateOrdinal: number, overrides: Record<string, unknown> = {}) => ({
  queryId,
  candidateOrdinal,
  sourceRef: `src/${candidateOrdinal}.ts`,
  sourceRevision: 'git:abc',
  graphRevision: 'graph:1',
  featureRevision: 'features:1',
  providerRevision: 'ast-grep:1',
  labelRevision: 'labels:1',
  label: candidateOrdinal % 3,
  features: [0.1, 0.2],
  evidenceRefs: [`evidence:${candidateOrdinal}`],
  ...overrides,
});

describe('XGBoost ranking lineage preparation', () => {
  it('sorts queries and candidate ordinals independently of input order', () => {
    const groups = groupXgboostRankingCandidatesV1([row('q2', 1), row('q1', 2), row('q1', 1)]);
    expect(groups.map((group) => [group.qid, group.queryId, group.candidates.map((candidate) => candidate.candidateOrdinal)])).toEqual([
      [0, 'q1', [1, 2]], [1, 'q2', [1]],
    ]);
  });

  it('rejects mixed feature lineage inside one query group', () => {
    expect(() => groupXgboostRankingCandidatesV1([
      row('q1', 1), row('q1', 2, { featureRevision: 'features:2' }),
    ])).toThrow('XGBOOST_RANKING_LINEAGE_MISMATCH');
  });

  it('produces a stable checksum for the grouped evidence rows', () => {
    const first = groupXgboostRankingCandidatesV1([row('q1', 2), row('q1', 1)]);
    const second = groupXgboostRankingCandidatesV1([row('q1', 1), row('q1', 2)]);
    expect(rankingLineageChecksumV1(first)).toBe(rankingLineageChecksumV1(second));
  });
});
