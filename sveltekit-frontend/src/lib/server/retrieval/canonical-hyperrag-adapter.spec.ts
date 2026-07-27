import { describe, expect, it } from 'vitest';

import { searchResultToHyperRagResult } from './canonical-hyperrag-adapter.js';

describe('canonical hyperrag adapter provenance', () => {
  it('treats split dense qdrant lanes as qdrant provenance', () => {
    const result = searchResultToHyperRagResult({
      packets: [],
      metadata: {
        query: 'hybrid retrieval',
        candidatesRetrieved: 1,
        candidatesFused: 1,
        candidatesScored: 1,
        candidatesReranked: 1,
        candidatesPostProcessed: 1,
        durationMs: 1,
        stages: {
          retrieve: 1,
          fuse: 1,
          score: 1,
          hydrate: 1,
          rerank: 1,
          postProcess: 1,
        },
      },
      provenance: {
        retrievalSources: ['qdrant_384'],
        fusionMethod: 'rrf',
        rerankModel: 'mixedbread-ai/mxbai-rerank-base-v2',
        rerankerUsed: true,
      },
    });

    expect(result.provenance.qdrant).toBe(true);
    expect(result.provenance.redis).toBe(false);
  });
});
