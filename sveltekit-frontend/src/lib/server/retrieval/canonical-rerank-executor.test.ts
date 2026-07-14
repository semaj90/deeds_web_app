import { describe, expect, it } from 'vitest';
import {
  canonicalEnvelopeToRerankCandidate,
  rerankedCandidateToCanonicalEnvelope,
  type CanonicalRerankEnvelope,
} from './canonical-rerank-executor.js';

describe('canonical rerank executor bridge', () => {
  it('hydrates a feature envelope into the canonical rerank candidate shape', () => {
    const envelope: CanonicalRerankEnvelope = {
      chunk_id: 'chunk-1',
      packet_key: 'packet-1',
      source_ref: 'src/lib/example.ts',
      relative_path: 'src/lib/example.ts',
      content: 'hello world',
      summary: 'hello',
      retrieved_rank: 7,
      dense: {
        name: 'dense',
        score: 0.91,
        qdrant_point_id: 'q-1',
        metric: 'cosine',
        confidence: 0.9,
      },
      lexical: {
        name: 'lexical',
        score: 0.8,
        matched_terms: ['hello'],
        query_coverage: 0.5,
        confidence: 0.8,
      },
      authority: {
        name: 'authority',
        score: 0.7,
        page_rank: 0.42,
        confidence: 0.7,
      },
    };

    const candidate = canonicalEnvelopeToRerankCandidate(envelope);

    expect(candidate.packetKey).toBe('packet-1');
    expect(candidate.sourceRef).toBe('src/lib/example.ts');
    expect(candidate.content).toBe('hello world');
    expect(candidate.retrievedRank).toBe(7);
    expect(candidate.denseScore).toBe(0.91);
    expect(candidate.bm25Score).toBe(0.8);
    expect(candidate.pagerankScore).toBe(0.42);
  });

  it('round-trips a reranked candidate back into the canonical envelope', () => {
    const envelope: CanonicalRerankEnvelope = {
      chunk_id: 'chunk-2',
      source_ref: 'src/lib/other.ts',
      content: 'other',
    };

    const updated = rerankedCandidateToCanonicalEnvelope(envelope, {
      packetKey: 'packet-2',
      sourceRef: 'src/lib/other.ts',
      content: 'other',
      retrievedRank: 2,
      denseScore: 0.6,
      bm25Score: 0.5,
      astScore: 0.2,
      graphScore: 0.3,
      pagerankScore: 0.4,
      domainScore: 0.7,
      crossEncoderScore: 0.88,
      blendedScore: 0.84,
      rankAfter: 1,
      modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
      blendWeights: {
        dense: 0.3,
        bm25: 0.2,
        ast: 0.05,
        graph: 0.05,
        pagerank: 0.1,
        domain: 0.0,
        crossEncoder: 0.3,
      },
    });

    expect(updated.packet_key).toBe('packet-2');
    expect(updated.cross_encoder_score).toBe(0.88);
    expect(updated.blended_score).toBe(0.84);
    expect(updated.rank_after).toBe(1);
    expect(updated.model_version).toBe('mixedbread-ai/mxbai-rerank-base-v2');
  });
});
