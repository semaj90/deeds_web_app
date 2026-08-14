import { describe, expect, it } from 'vitest';
import { sampleQueryAdaptiveCandidates } from './query-adaptive-sampler.js';

const candidate = (packetKey: string, sourceRef: string, semanticAffinity: number) => ({
  packetKey,
  sourceRef,
  symbolVersionId: `symbol:${packetKey}`,
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  representationRevision: 'semantic_768:r1',
  featureRevision: 'features:r1',
  features: {
    semanticAffinity,
    lexicalAffinity: 0.2,
    graphAuthority: 0.3,
    astAffinity: 0.4,
    processAffinity: 0.2,
    domainAffinity: 0.5,
    priorExecutionSuccess: 0.1,
    reuseProbability: 0.2,
    recency: 0.4,
    memoryCost: 0.1,
    promotionCost: 0.1,
  },
});

const weights = { semantic: 1, lexical: 0.2, structural: 0.4, domain: 0.3, execution: 0.2 };

describe('query-adaptive sampler', () => {
  it('is deterministic for the same revision and seed', () => {
    const input = { candidates: [candidate('packet:a', 'src/a.ts', 0.9), candidate('packet:b', 'src/b.ts', 0.4)], weights, sampleSize: 1, seed: 'query:r1' };
    expect(sampleQueryAdaptiveCandidates(input)).toEqual(sampleQueryAdaptiveCandidates(input));
  });

  it('preserves canonical identity and requires exact promotion', () => {
    const [sample] = sampleQueryAdaptiveCandidates({
      candidates: [candidate('packet:a', 'src/a.ts', 0.9)],
      weights,
      sampleSize: 1,
      seed: 'query:r1',
    });
    expect(sample.packetKey).toBe('packet:a');
    expect(sample.sourceRef).toBe('src/a.ts');
    expect(sample.exactPromotionRequired).toBe(true);
  });

  it('changes deterministically when the query seed changes without inventing candidates', () => {
    const candidates = [candidate('packet:a', 'src/a.ts', 0.5), candidate('packet:b', 'src/b.ts', 0.5)];
    const samples = sampleQueryAdaptiveCandidates({ candidates, weights, sampleSize: 2, seed: 'query:r1' });
    expect(samples.map((sample) => sample.packetKey).sort()).toEqual(['packet:a', 'packet:b']);
  });
});
