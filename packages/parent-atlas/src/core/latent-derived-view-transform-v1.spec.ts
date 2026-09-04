import { describe, expect, it } from 'vitest';
import {
  NESTED_PREFIX_L2_RENORMALIZE_TRANSFORM_ID,
  deriveNestedPrefixL2RenormalizedView,
} from './latent-derived-view-transform-v1.js';

describe('deriveNestedPrefixL2RenormalizedView', () => {
  it('has a frozen transform id', () => {
    expect(NESTED_PREFIX_L2_RENORMALIZE_TRANSFORM_ID).toBe('NESTED_PREFIX_L2_RENORMALIZE');
  });

  it('prefixes then L2-normalizes to unit norm', () => {
    const parent = [3, 4, 0, 0];
    const out = deriveNestedPrefixL2RenormalizedView(parent, 2);
    expect(out).toEqual([0.6, 0.8]);
    const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it('is deterministic for the same input', () => {
    const parent = Array.from({ length: 256 }, (_, i) => Math.sin(i) * 7);
    const a = deriveNestedPrefixL2RenormalizedView(parent, 128);
    const b = deriveNestedPrefixL2RenormalizedView(parent, 128);
    expect(a).toEqual(b);
    expect(a).toHaveLength(128);
  });

  it('throws when target dimensions exceed parent length', () => {
    expect(() => deriveNestedPrefixL2RenormalizedView([1, 2, 3], 4)).toThrow(
      'LATENT_DERIVED_VIEW_TARGET_DIMENSIONS_EXCEEDS_PARENT',
    );
  });

  it('throws on non-positive-integer target dimensions', () => {
    expect(() => deriveNestedPrefixL2RenormalizedView([1, 2, 3], 0)).toThrow(
      'LATENT_DERIVED_VIEW_TARGET_DIMENSIONS_NOT_POSITIVE_INTEGER',
    );
    expect(() => deriveNestedPrefixL2RenormalizedView([1, 2, 3], 1.5)).toThrow(
      'LATENT_DERIVED_VIEW_TARGET_DIMENSIONS_NOT_POSITIVE_INTEGER',
    );
  });

  it('throws on a non-finite parent vector entry', () => {
    expect(() => deriveNestedPrefixL2RenormalizedView([1, NaN, 3], 2)).toThrow(
      'LATENT_DERIVED_VIEW_PARENT_VECTOR_NON_FINITE',
    );
  });

  it('throws on an all-zero prefix (zero norm)', () => {
    expect(() => deriveNestedPrefixL2RenormalizedView([0, 0, 5], 2)).toThrow(
      'LATENT_DERIVED_VIEW_ZERO_OR_NON_FINITE_NORM',
    );
  });
});
