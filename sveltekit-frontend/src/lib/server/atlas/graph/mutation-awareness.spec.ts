import { describe, expect, it } from 'vitest';
import { normalizeMutationSourceRef } from './mutation-awareness';

describe('mutation source_ref normalization', () => {
  it('normalizes Git/Windows slash syntax without changing case', () => {
    expect(normalizeMutationSourceRef('.\\src\\lib\\Atlas.ts')).toBe('src/lib/Atlas.ts');
    expect(normalizeMutationSourceRef('./src/lib/Atlas.ts')).toBe('src/lib/Atlas.ts');
    expect(normalizeMutationSourceRef('src//lib///Atlas.ts')).toBe('src/lib/Atlas.ts');
  });

  it('preserves case because repository filesystem semantics may differ', () => {
    expect(normalizeMutationSourceRef('src/lib/Atlas.ts')).not.toBe(
      normalizeMutationSourceRef('src/lib/atlas.ts'),
    );
  });
});
