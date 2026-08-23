import type { FeatureEnvelope } from '../contracts/feature-envelope';

export interface TelemetryEnricher {
  enrich(input: FeatureEnvelope): Promise<FeatureEnvelope>;
}

export function createNoopTelemetryEnricher(): TelemetryEnricher {
  return {
    async enrich(input: FeatureEnvelope): Promise<FeatureEnvelope> {
      return input;
    },
  };
}

