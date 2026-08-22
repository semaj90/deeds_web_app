import { describe, expect, it } from 'vitest';

import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import { attachDomainEvidence } from './search-runtime';

function candidate(overrides: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    packet_key: 'packet-1',
    source_ref: 'src/lib/server/retrieval/search-runtime.ts',
    lane: 'qdrant_dense',
    rank: 3,
    score: 0.87,
    packet_id: 'packet-row-1',
    qdrant_point_id: 'qdrant-1',
    metadata: {
      summary: 'Qdrant dense candidate retrieval and reranking pipeline',
    },
    ...overrides,
  };
}

describe('SearchRuntime domain evidence', () => {
  it('attaches deterministic classifier evidence without changing retrieval identity or rank', () => {
    const input = candidate();
    const output = attachDomainEvidence(input);

    expect(output.packet_key).toBe(input.packet_key);
    expect(output.source_ref).toBe(input.source_ref);
    expect(output.lane).toBe(input.lane);
    expect(output.rank).toBe(input.rank);
    expect(output.score).toBe(input.score);
    expect(output.packet_id).toBe(input.packet_id);
    expect(output.qdrant_point_id).toBe(input.qdrant_point_id);

    expect(output.metadata.domain_class).toBe('retrieval');
    expect(output.metadata.domain_class_source).toBe('keyword_classifier');
    expect(output.metadata.domain_classifier_observation).toEqual(
      expect.objectContaining({
        domain: 'retrieval',
        confidence: expect.any(Number),
        counts: expect.objectContaining({ retrieval: expect.any(Number) }),
      }),
    );

    expect(attachDomainEvidence(input)).toEqual(output);
  });

  it('preserves a pre-existing domain authority while retaining disagreement as observation', () => {
    const input = candidate({
      metadata: {
        domain_class: 'graph',
        domain_class_source: 'graphify-domain-v2',
        summary: 'Qdrant dense candidate retrieval ranking search',
      },
    });

    const output = attachDomainEvidence(input);

    expect(output.metadata.domain_class).toBe('graph');
    expect(output.metadata.domain_class_source).toBe('graphify-domain-v2');
    expect(output.metadata.domain_classifier_observation).toEqual(
      expect.objectContaining({ domain: 'retrieval' }),
    );
  });

  it('uses general only as classifier fallback and never invents a retrieval vote', () => {
    const input = candidate({
      source_ref: 'src/lib/plain-file.ts',
      lane: 'exact',
      rank: 1,
      score: null,
      metadata: {},
    });

    const output = attachDomainEvidence(input);

    expect(output.metadata.domain_class).toBe('general');
    expect(output.metadata.domain_class_source).toBe('keyword_classifier');
    expect(output.metadata.domain_classifier_observation).toEqual(
      expect.objectContaining({ domain: 'general', confidence: 0 }),
    );
    expect(output.lane).toBe('exact');
    expect(output.rank).toBe(1);
    expect(output.score).toBeNull();
  });
});
