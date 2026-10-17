import { describe, expect, it } from 'vitest';
import { clampGraphQualificationV1 } from './graph-runtime-contracts.js';

describe('clampGraphQualificationV1', () => {
  it('never lets a proposal reach STRUCTURAL_PROVEN without a source span', () => {
    expect(clampGraphQualificationV1('STRUCTURAL_PROVEN', { hasSourceSpan: false, humanReviewed: false })).toBe('PROPOSED');
    expect(clampGraphQualificationV1('STRUCTURAL_PROVEN', { hasSourceSpan: true, humanReviewed: false })).toBe('STRUCTURAL_PROVEN');
  });

  it('never lets HUMAN_REVIEWED stand without a reviewer', () => {
    expect(clampGraphQualificationV1('HUMAN_REVIEWED', { hasSourceSpan: true, humanReviewed: false })).toBe('PROPOSED');
    expect(clampGraphQualificationV1('HUMAN_REVIEWED', { hasSourceSpan: true, humanReviewed: true })).toBe('HUMAN_REVIEWED');
  });

  it('passes PROPOSED, STALE and REJECTED through unchanged', () => {
    for (const s of ['PROPOSED', 'STALE', 'REJECTED'] as const) {
      expect(clampGraphQualificationV1(s, { hasSourceSpan: false, humanReviewed: false })).toBe(s);
    }
  });
});
