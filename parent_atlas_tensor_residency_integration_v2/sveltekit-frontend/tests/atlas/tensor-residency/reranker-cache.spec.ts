import { describe, expect, it } from 'vitest';
import { cacheResultValid, rerankerCacheKey } from '../../../src/lib/server/atlas/tensors/reranker-cache';

describe('reranker cache', () => {
  it('qualifies cache by revisions and candidate-set hash', () => {
    const key = rerankerCacheKey({queryHash:'q',candidateSetHash:'c',representationRevision:'r1',featureRevision:'f1',rerankerRevision:'rr1',modelRevision:'m1',precision:'fp16'});
    expect(key).toContain('rr1:m1:fp16:r1:f1:q:c');
    expect(cacheResultValid({packetKeys:['p'],scores:[0.5],createdAtMs:1,expiresAtMs:100}, 50)).toBe(true);
  });
});
