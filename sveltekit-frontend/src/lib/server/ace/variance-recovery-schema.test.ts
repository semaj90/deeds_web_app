import { describe, expect, it } from 'vitest';
import { VarianceRecoverySchema } from './variance-recovery-schema';

describe('VarianceRecoverySchema', () => {
  it('accepts semantic recovery ladder payloads with defaults', () => {
    const parsed = VarianceRecoverySchema.parse({
      exactMatchFailed: true,
      fuzzySearchCandidates: ['src/lib/server/ace/tool-description.ts'],
      didYouMean: ['tool-description.ts'],
      semanticSearchHits: ['qdrant:cluster:ace'],
      qdrantTags: ['ace', 'retrieval'],
      clusterTagRecall: ['feature:retrieval'],
      langextractEntities: ['ACE', 'Qdrant'],
      semanticCacheHits: ['ace:packet:abc'],
      acePacket: 'compact-packet',
      nextSteps: ['run /recover:graph']
    });

    expect(parsed.fuzzySearchCandidates).toEqual(['src/lib/server/ace/tool-description.ts']);
    expect(parsed.semanticSearchHits).toEqual(['qdrant:cluster:ace']);
    expect(parsed.clusterTagRecall).toEqual(['feature:retrieval']);
    expect(parsed.acePacket).toBe('compact-packet');
  });

  it('fills defaults for optional ladder arrays', () => {
    const parsed = VarianceRecoverySchema.parse({ exactMatchFailed: false });

    expect(parsed.fuzzySearchCandidates).toEqual([]);
    expect(parsed.didYouMean).toEqual([]);
    expect(parsed.semanticSearchHits).toEqual([]);
    expect(parsed.qdrantTags).toEqual([]);
    expect(parsed.clusterTagRecall).toEqual([]);
    expect(parsed.langextractEntities).toEqual([]);
    expect(parsed.semanticCacheHits).toEqual([]);
    expect(parsed.nextSteps).toEqual([]);
    expect(parsed.acePacket).toBeUndefined();
  });
});
