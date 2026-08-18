import { describe, expect, it } from 'vitest';
import { compileCandidateFeatureView, makeFeatureSignal } from '../src/lib/server/retrieval/candidate-feature-view.js';

describe('CandidateFeatureViewV1', () => {
  it('keeps unavailable enrichment null rather than zero', () => {
    const view = compileCandidateFeatureView({
      requestId: 'r1', candidateOrdinal: 0, canonicalId: 'c1', packetKey: 'p1', sourceRef: 'src/a.ts',
      featureRevision: 'f1', workspaceRevision: 'w1', graphRevision: 'g1', representationRevision: 'semantic_768:v1',
      signals: [
        makeFeatureSignal({ label: 'semantic_similarity', state: 'OBSERVED', value: 0.8, logicalOwner: 'semantic', executor: 'qdrant', producerRevision: 'q1' }),
        makeFeatureSignal({ label: 'pagerank_global', state: 'UNAVAILABLE', value: 0, logicalOwner: 'pagerank', executor: 'cugraph', producerRevision: 'g1' }),
      ],
    });
    expect(view.observedLabels).toEqual(['semantic_similarity']);
    expect(view.missingLabels).toEqual(['pagerank_global']);
    expect(view.signals.find((s)=>s.label === 'pagerank_global')?.value).toBeNull();
  });

  it('rejects duplicate logical signals even from different executors', () => {
    expect(() => compileCandidateFeatureView({
      requestId: 'r1', candidateOrdinal: 0, canonicalId: 'c1', sourceRef: 'src/a.ts', featureRevision: 'f1', workspaceRevision: 'w1', representationRevision: 'semantic_768:v1',
      signals: [
        makeFeatureSignal({ label: 'semantic_similarity', state: 'OBSERVED', value: .8, logicalOwner: 'semantic', executor: 'qdrant', producerRevision: 'q1' }),
        makeFeatureSignal({ label: 'semantic_similarity', state: 'OBSERVED', value: .81, logicalOwner: 'semantic', executor: 'cagra', producerRevision: 'c1' }),
      ],
    })).toThrow(/duplicate logical feature signal/);
  });
});
