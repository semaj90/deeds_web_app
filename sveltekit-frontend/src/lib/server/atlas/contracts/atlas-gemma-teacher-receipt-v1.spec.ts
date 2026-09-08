// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AtlasGemmaTeacherReceiptV1Schema } from './atlas-gemma-teacher-receipt-v1.js';

const baseReceipt = {
  sourceReport: 'docs/reports/rerank-shadow-01-live-fixture-v1.json',
  generatedAt: '2026-09-06T20:40:05.914Z',
  candidateIdentityQualified: false,
  observations: [
    { query: 'q1', candidateId: 'cand:1', teacherModel: 'MXBAI_RERANK_BASE_V2' as const, rawScore: 0.61, rank: 0, relevantGroundTruth: true },
  ],
  queryCount: 1,
  distillationEligible: false,
  distillationIneligibleReason: 'candidateIdentityQualified=false (fixture, not revision-qualified)',
};

describe('AtlasGemmaTeacherReceiptV1', () => {
  it('accepts a valid ineligible receipt with a stated reason', () => {
    expect(() => AtlasGemmaTeacherReceiptV1Schema.parse(baseReceipt)).not.toThrow();
  });

  it('rejects an eligible receipt whose candidateIdentityQualified is false', () => {
    expect(() =>
      AtlasGemmaTeacherReceiptV1Schema.parse({ ...baseReceipt, distillationEligible: true, distillationIneligibleReason: null })
    ).toThrow(/DISTILLATION_ELIGIBLE_REQUIRES_CANDIDATE_IDENTITY_QUALIFIED/);
  });

  it('rejects an ineligible receipt with no stated reason', () => {
    expect(() =>
      AtlasGemmaTeacherReceiptV1Schema.parse({ ...baseReceipt, distillationIneligibleReason: null })
    ).toThrow(/INELIGIBLE_RECEIPT_MUST_STATE_WHY/);
  });

  it('accepts an eligible receipt when identity is actually qualified', () => {
    expect(() =>
      AtlasGemmaTeacherReceiptV1Schema.parse({
        ...baseReceipt,
        candidateIdentityQualified: true,
        distillationEligible: true,
        distillationIneligibleReason: null,
      })
    ).not.toThrow();
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => AtlasGemmaTeacherReceiptV1Schema.parse({ ...baseReceipt, extra: true })).toThrow();
  });
});
