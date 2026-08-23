import type { FeatureEnvelope } from '../contracts/feature-envelope';

export interface GraphEnricher {
  enrich(input: FeatureEnvelope): Promise<FeatureEnvelope>;
}

export function createNoopGraphEnricher(): GraphEnricher {
  return {
    async enrich(input: FeatureEnvelope): Promise<FeatureEnvelope> {
      return input;
    },
  };
}

