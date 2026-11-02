import { describe, expect, it } from 'vitest';
import { RetrievalFeatureRowV1Schema } from './retrieval-feature-row-v1.js';

describe('retrieval feature row v1', () => {
  it('keeps query-time scores revisioned and derived', () => {
    const row = RetrievalFeatureRowV1Schema.parse({
      schema: 'atlas.retrieval-feature-row.v1',
      canonicalId: 'packet:83',
      workspaceRevision: 'workspace:W1',
      sourceRevision: 'source:S1',
      representationRevision: 'embeddinggemma-native-768-v1',
      denseSemanticScore: 0.91,
      lexicalScore: 2.1,
      astSameSymbol: 1,
      astSameFile: 1,
      graphDistance: 1,
      graphAuthority: 0.7,
      domainAffinity: 0.8,
      processAffinity: 0.6,
      executionSuccessPrior: 0.5,
      fusedRank: 1,
      rerankScore: 0.88,
      evidenceRefs: ['candidate:83'],
      producerRevision: 'search-runtime:1',
      canonicalWrites: false,
    });
    expect(row.canonicalWrites).toBe(false);
  });
});
