import {
  AtlasPairJudgmentV1Schema,
  type AtlasPairJudgmentV1,
} from './atlas-learning-recommendation-v1.js';

export const ATLAS_PAIR_JUDGMENT_LABEL_REVISION = 'atlas.pair-label.teacher-exact-execution.v1' as const;

export interface PairJudgmentTeacherEvidenceV1 {
  modelId: string;
  modelRevision: string;
  score: number;
  rank: number;
  receiptRef: string;
}

export interface PairJudgmentExactPromotionEvidenceV1 {
  passed: boolean;
  receiptRef: string;
}

export interface PairJudgmentExecutionEvidenceV1 {
  success: boolean;
  testPassed: boolean | null;
  repairSucceeded: boolean | null;
  receiptRefs: string[];
}

export function finalizeAtlasPairJudgmentV1(input: {
  seed: AtlasPairJudgmentV1;
  teacher: PairJudgmentTeacherEvidenceV1 | null;
  exactPromotion: PairJudgmentExactPromotionEvidenceV1 | null;
  execution: PairJudgmentExecutionEvidenceV1 | null;
  humanRelevanceGrade?: number | null;
}): AtlasPairJudgmentV1 {
  const seed = AtlasPairJudgmentV1Schema.parse(input.seed);
  const blockReasons: string[] = [];

  if (!input.teacher) blockReasons.push('TEACHER_SCORE_MISSING');
  if (!input.exactPromotion) blockReasons.push('EXACT_PROMOTION_OUTCOME_MISSING');
  if (!input.execution) blockReasons.push('EXECUTION_OUTCOME_MISSING');

  if (input.teacher) {
    if (!Number.isFinite(input.teacher.score)) blockReasons.push('TEACHER_SCORE_NON_FINITE');
    if (!Number.isInteger(input.teacher.rank) || input.teacher.rank <= 0) blockReasons.push('TEACHER_RANK_INVALID');
    if (!input.teacher.modelId.trim() || !input.teacher.modelRevision.trim() || !input.teacher.receiptRef.trim()) {
      blockReasons.push('TEACHER_PROVENANCE_INCOMPLETE');
    }
  }

  if (input.exactPromotion && !input.exactPromotion.receiptRef.trim()) {
    blockReasons.push('EXACT_PROMOTION_RECEIPT_MISSING');
  }

  if (input.execution) {
    if (!input.execution.receiptRefs.length) blockReasons.push('EXECUTION_RECEIPT_MISSING');
    if (input.execution.receiptRefs.some((ref) => !ref.trim())) blockReasons.push('EXECUTION_RECEIPT_INVALID');
  }

  const trainingEligible = blockReasons.length === 0;

  return AtlasPairJudgmentV1Schema.parse({
    ...seed,
    teacher: input.teacher
      ? {
          modelId: input.teacher.modelId,
          modelRevision: input.teacher.modelRevision,
          score: input.teacher.score,
          rank: input.teacher.rank,
        }
      : null,
    exactPromotion: input.exactPromotion
      ? {
          attempted: true,
          passed: input.exactPromotion.passed,
          receiptRef: input.exactPromotion.receiptRef,
        }
      : {
          attempted: false,
          passed: null,
          receiptRef: null,
        },
    executionOutcome: input.execution
      ? {
          attempted: true,
          success: input.execution.success,
          testPassed: input.execution.testPassed,
          repairSucceeded: input.execution.repairSucceeded,
          receiptRefs: [...input.execution.receiptRefs],
        }
      : {
          attempted: false,
          success: null,
          testPassed: null,
          repairSucceeded: null,
          receiptRefs: [],
        },
    humanRelevanceGrade: input.humanRelevanceGrade ?? seed.humanRelevanceGrade,
    labelRevision: ATLAS_PAIR_JUDGMENT_LABEL_REVISION,
    trainingEligible,
    trainingBlockReasons: blockReasons,
    canonicalWritesAllowed: false,
  });
}
