import type { FeatureEnvelope } from '../contracts/feature-envelope';

export interface TopologyEnricher {
  enrich(input: FeatureEnvelope): Promise<FeatureEnvelope>;
}

export function createNoopTopologyEnricher(): TopologyEnricher {
  return {
    async enrich(input: FeatureEnvelope): Promise<FeatureEnvelope> {
      return input;
    },
  };
}

