import { describe, expect, it } from 'vitest';
import {
  createQueryExecutionPolicyV1,
  createReadOnlySideEffectReceiptBuilderV1,
  shouldPopulateEmbeddingCacheV1,
} from './query-execution-policy-v1.js';

describe('QueryExecutionPolicyV1', () => {
  it('sets strict READ_ONLY to cache lookup-only and suppresses observable writes', () => {
    expect(createQueryExecutionPolicyV1('READ_ONLY')).toEqual({
      mode: 'READ_ONLY', cache: { read: true, populate: false },
      observations: { persistAudit: false, persistEngram: false }, promotion: { allow: false },
    });
  });

  it('aggregates attempted and committed writes into a validated receipt', () => {
    const receipt = createReadOnlySideEffectReceiptBuilderV1('READ_ONLY');
    receipt.record({ subsystem: 'embedding-cache', operation: 'populate-on-miss', reads: 1,
      attemptedWrites: 1, committedWrites: 0, suppressionReason: 'READ_ONLY_CACHE_LOOKUP_ONLY' });
    expect(receipt.build()).toMatchObject({ attemptedWrites: 1, committedWrites: 0, executionMode: 'READ_ONLY' });
  });

  it('allows embedding cache population only outside strict read-only and explicit lookup-only requests', () => {
    expect(shouldPopulateEmbeddingCacheV1({ executionMode: 'READ_ONLY' })).toBe(false);
    expect(shouldPopulateEmbeddingCacheV1({ executionMode: 'OBSERVED_READ_ONLY' })).toBe(true);
    expect(shouldPopulateEmbeddingCacheV1({ skipCacheWrite: true })).toBe(false);
  });
});
