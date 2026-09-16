import { describe, expect, it } from 'vitest';
import {
  admitPhase17FeatureProviderV1,
  type RevisionQualifiedFeatureInputV1,
} from './phase17-schema';

const featureInput: RevisionQualifiedFeatureInputV1 = {
  candidateOrdinal: 3,
  canonicalId: 'candidate:3',
  packetKey: 'packet:3',
  sourceRef: 'src/example.ts',
  sourceRevision: 'sha256:source',
  workspaceRevision: 'sha256:workspace',
  representationRevision: null,
  graphRevision: null,
  evidenceRefs: ['evidence:3'],
};

describe('Phase 17 provider admission', () => {
  it('admits an available provider with required lineage', () => {
    const result = admitPhase17FeatureProviderV1({
      provider: {
        providerId: 'lexical-v1',
        providerRevision: 'lexical-v1',
        requiredInputs: ['sourceRef', 'sourceRevision', 'workspaceRevision'],
        producedFeatures: ['lexicalRelevance'],
        status: 'AVAILABLE',
      },
      featureInput,
    });
    expect(result.status).toBe('ADMITTED');
  });

  it('blocks missing optional-layer revisions without fabricating them', () => {
    const result = admitPhase17FeatureProviderV1({
      provider: {
        providerId: 'graph-v1',
        providerRevision: 'graph-v1',
        requiredInputs: ['graphRevision'],
        producedFeatures: ['pageRank'],
        status: 'AVAILABLE',
      },
      featureInput,
    });
    expect(result).toMatchObject({ status: 'BLOCKED', reason: 'GRAPH_REVISION_REQUIRED' });
  });

  it('keeps unavailable providers non-promotional', () => {
    const result = admitPhase17FeatureProviderV1({
      provider: {
        providerId: 'gpu-v1',
        providerRevision: 'gpu-v1',
        requiredInputs: [],
        producedFeatures: ['gpuScore'],
        status: 'UNAVAILABLE',
      },
      featureInput,
    });
    expect(result).toMatchObject({ status: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE' });
  });
});
