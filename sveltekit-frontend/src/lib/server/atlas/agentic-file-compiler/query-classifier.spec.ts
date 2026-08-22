import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';

describe('classifyAtlasQuery', () => {
  it('classifies a bounded file create and asks for exact promotion', () => {
    const out = classifyAtlasQuery({ requestId: 'r1', query: 'Create src/lib/cache/foo.ts with method invalidate for Parent Atlas cache' });
    expect(out.operation).toBe('FILE_MUTATION');
    expect(out.mutationKind).toBe('CREATE');
    expect(out.targetHints).toContain('src/lib/cache/foo.ts');
    expect(out.retrievalNeeds.semantic).toBe(true);
    expect(out.exactPromotionRequired).toBe(true);
  });
});
