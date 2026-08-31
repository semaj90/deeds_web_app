import { buildOakJudgeFeedbackV1, type OakJudgeFeedbackV1 } from './oak-judge-feedback-v1.js';

/**
 * ONE real, non-fabricated `OakJudgeFeedbackV1` instance, grounded in an
 * event that actually happened in this repo during this session's F02
 * work (see `openspec/changes/parent-atlas-ontology-kernel/tasks.md`,
 * the "F02 `TaskReasoningFunctionV1`/`TaskFunctionCatalogV1`" row):
 *
 * `kernel-function-v1.ts` was extended to require a new field
 * (`allowedEvidenceClasses`, min 1) on every `AtlasKernelFunctionV1`. The
 * first rebuild+test pass after that change reported 4 of 21 tests
 * failing with the real error `ZodError: allowedEvidenceClasses expected
 * array, received undefined`, from 6 `buildAtlasKernelFunctionV1()` call
 * sites in `ontology-kernel-end-to-end.spec.ts` that were missed in the
 * initial edit. This is a genuine `VALIDATOR_FAILURE`: a schema validator
 * (Zod's own `.strict().parse()`) correctly rejected inputs that no
 * longer satisfied the (intentionally tightened) contract. The fix
 * actually applied was adding the missing field to those 6 call sites —
 * exactly what `proposedFunctionPatch` below describes.
 *
 * This is retrospective, not a live judge output: it demonstrates the
 * `OakJudgeFeedbackV1` shape can represent a real historical failure and
 * its real fix, not that an automatic judge exists. Do not read this as
 * "OAK-08 is done" — see `oak-judge-feedback-v1.ts`'s own docstring.
 */
export function buildF02ValidatorFailureFixtureV0(): OakJudgeFeedbackV1 {
  return buildOakJudgeFeedbackV1({
    feedbackId: 'judge-feedback:f02-validator-failure:v0',
    kernelRevision: 'kernel-schema:symbol-repair:v0',
    programRevision: null,
    workflowRunId: 'session:2026-08-31:oak-f02-rebuild',
    failureClass: 'VALIDATOR_FAILURE',
    evidenceRefs: [
      'openspec/changes/parent-atlas-ontology-kernel/tasks.md#f02-taskreasoningfunctionv1-taskfunctioncatalogv1',
      'packages/parent-atlas/src/core/ontology-kernel-end-to-end.spec.ts',
    ],
    executionReceiptRefs: [
      'vitest:ontology-kernel-end-to-end.spec.ts:pre-fix-run:4-failed-of-21',
    ],
    proposedFunctionPatch: {
      patchKind: 'ADD_REQUIRED_FIELD',
      targetFunctionId: 'test-fixture:ontology-kernel-end-to-end',
      targetFunctionRevision: 'kernel-function-catalog:v1:post-f02',
      description: 'Add allowedEvidenceClasses: [\'test_evidence\'] to every buildAtlasKernelFunctionV1() call site missing it (6 sites, fixed via replace_all)',
    },
    confidence: 1,
    judgeRevision: 'human-diagnosed:not-automated:v0',
  });
}
