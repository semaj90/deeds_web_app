import type { RankingFeatures } from './ranking-features';

export interface XgboostRanker {
  score(features: RankingFeatures): Promise<number>;
}

export function createNoopXgboostRanker(): XgboostRanker {
  return {
    async score(): Promise<number> {
      return 0;
    },
  };
}

