import { describe, expect, it } from 'vitest';

import { searchResultToHyperRagResult } from './canonical-hyperrag-adapter.js';

describe('canonical hyperrag adapter provenance', () => {
  it('treats the canonical dense qdrant lane as qdrant provenance', () => {
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
        retrievalSources: ['qdrant_768'],
        fusionMethod: 'rrf',
        rerankModel: 'mixedbread-ai/mxbai-rerank-base-v2',
        rerankerUsed: true,
      },
    });

    expect(result.provenance.qdrant).toBe(true);
    expect(result.provenance.redis).toBe(false);
  });

  it('drops hits that do not carry canonical packet and source identity', () => {
    const result = searchResultToHyperRagResult({
      packets: [
        {
          packetKey: 'packet-1',
          sourceRef: 'docs/a.md',
          summary: 'kept',
          content: '',
          score: 0.9,
          scoreSource: 'qdrant',
        } as any,
        {
          id: 'point-only',
          summary: 'dropped',
          content: '',
          score: 0.8,
          scoreSource: 'qdrant',
        } as any,
      ],
      metadata: {
        query: 'canonical identity',
        candidatesRetrieved: 2,
        candidatesFused: 2,
        candidatesScored: 2,
        candidatesReranked: 2,
        candidatesPostProcessed: 2,
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
        retrievalSources: ['qdrant_768'],
        fusionMethod: 'rrf',
        rerankModel: 'mixedbread-ai/mxbai-rerank-base-v2',
        rerankerUsed: true,
      },
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.packetKey).toBe('packet-1');
    expect(result.hits[0]?.sourceRef).toBe('docs/a.md');
  });
});
