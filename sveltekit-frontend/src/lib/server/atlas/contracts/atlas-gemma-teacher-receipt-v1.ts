/**
 * AtlasGemmaTeacherReceiptV1 — MICRO-03's first slice
 * (`openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md`, root tree): "Build teacher/
 * evaluation receipts from the existing mxbai, LangExtract, ACE, and workflow-outcome owners
 * before distillation."
 *
 * This is a formal contract for teacher scores AtlasGemmaRankV1's future training would distill
 * from. It does NOT itself run new inference — a populator reads already-collected real results
 * (e.g. `docs/reports/rerank-shadow-01-live-fixture-v1.json`) into this shape. Critically, it
 * carries `candidateIdentityQualified` forward from the source rather than silently upgrading it:
 * a receipt built from a non-revision-qualified fixture must say so, so MICRO-04's stricter
 * "frozen, revision-qualified candidates" bar is never confused with MICRO-03's looser
 * "teacher receipt exists" bar.
 */

import { z } from 'zod';

export const AtlasGemmaTeacherObservationV1Schema = z.object({
  query: z.string().min(1),
  candidateId: z.string().min(1),
  teacherModel: z.enum(['MXBAI_RERANK_BASE_V2', 'EMBEDDINGGEMMA_COSINE', 'ORNITH_JUDGE']),
  rawScore: z.number().finite(),
  rank: z.number().int().nonnegative(),
  relevantGroundTruth: z.boolean().nullable(),
}).strict();

export type AtlasGemmaTeacherObservationV1 = z.infer<typeof AtlasGemmaTeacherObservationV1Schema>;

export const AtlasGemmaTeacherReceiptV1Schema = z.object({
  schema: z.literal('atlas.atlas-gemma-teacher-receipt.v1').default('atlas.atlas-gemma-teacher-receipt.v1'),
  sourceReport: z.string().min(1),
  generatedAt: z.string().min(1),
  candidateIdentityQualified: z.boolean(),
  observations: z.array(AtlasGemmaTeacherObservationV1Schema),
  queryCount: z.number().int().nonnegative(),
  distillationEligible: z.boolean(),
  distillationIneligibleReason: z.string().min(1).nullable(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.distillationEligible && !receipt.candidateIdentityQualified) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['distillationEligible'],
      message: 'DISTILLATION_ELIGIBLE_REQUIRES_CANDIDATE_IDENTITY_QUALIFIED',
    });
  }
  if (!receipt.distillationEligible && receipt.distillationIneligibleReason === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['distillationIneligibleReason'],
      message: 'INELIGIBLE_RECEIPT_MUST_STATE_WHY',
    });
  }
});

export type AtlasGemmaTeacherReceiptV1 = z.infer<typeof AtlasGemmaTeacherReceiptV1Schema>;
