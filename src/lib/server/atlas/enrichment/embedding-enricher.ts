import type { FeatureEnvelope } from '../contracts/feature-envelope';

export interface EmbeddingEnricher {
  enrich(input: FeatureEnvelope): Promise<FeatureEnvelope>;
}

export function createNoopEmbeddingEnricher(): EmbeddingEnricher {
  return {
    async enrich(input: FeatureEnvelope): Promise<FeatureEnvelope> {
      return input;
    },
  };
}

