import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * OakJudgeFeedbackV1 (OAK-08) — the contract shape only, per spec.md's
 * `OakJudgeFeedbackV1` field list. This file does NOT implement a working
 * judge (no automatic failure classification, no live calibration) — that
 * remains genuinely open per this change's own tasks.md, which correctly
 * says OAK-08/09 need real failing-task execution data and that
 * fabricating synthetic failures would defeat the point.
 *
 * What this file adds: the schema + a checksum-sealed builder (same
 * pattern as every other OAK-XX contract in this family), plus ONE real,
 * non-fabricated instance in `oak-judge-feedback-f02-fixture-v0.ts` —
 * built from this session's own actual F02 rebuild failure (a genuine
 * VALIDATOR_FAILURE event: `ontology-kernel-end-to-end.spec.ts` had 6
 * `buildAtlasKernelFunctionV1()` call sites that failed real Zod
 * validation with `allowedEvidenceClasses expected array, received
 * undefined` after the F02 schema extension landed — recorded in this
 * change's own `tasks.md`, not invented for this file). That single
 * fixture proves the shape is usable against a real event; it is
 * explicitly NOT a working judge and NOT "OAK-08 done" — a real judge
 * needs to classify failures automatically from live execution receipts,
 * which nothing here does.
 */
export const OAK_JUDGE_FAILURE_CLASS_VALUES = [
  'SCHEMA_MISSING_CONCEPT', 'SCHEMA_WRONG_RELATION', 'SCHEMA_CONTRADICTION',
  'FUNCTION_MISSING', 'FUNCTION_BAD_PRECONDITION', 'FUNCTION_BAD_COMPOSITION',
  'GRAPH_EXTRACTION_FAILURE', 'EVIDENCE_MISSING',
  'AGENT_TOOL_SELECTION_ERROR', 'AGENT_ARGUMENT_BINDING_ERROR',
  'EXECUTOR_FAILURE', 'VALIDATOR_FAILURE',
] as const;
export const oakJudgeFailureClassSchema = z.enum(OAK_JUDGE_FAILURE_CLASS_VALUES);
export type OakJudgeFailureClass = z.infer<typeof oakJudgeFailureClassSchema>;

export const schemaPatchProposalSchema = z.object({
  patchKind: z.enum(['ADD_CONCEPT', 'ADD_RELATION', 'REMOVE_CONTRADICTION', 'WIDEN_FIELD', 'NARROW_FIELD']),
  targetSchemaRevision: revision,
  description: z.string().min(1),
}).strict();

export const functionPatchProposalSchema = z.object({
  patchKind: z.enum(['ADD_OPERATOR_STEP', 'REMOVE_OPERATOR_STEP', 'ADD_PRECONDITION', 'FIX_ARGUMENT_BINDING', 'ADD_REQUIRED_FIELD']),
  targetFunctionId: id,
  targetFunctionRevision: revision,
  description: z.string().min(1),
}).strict();

export const oakJudgeFeedbackV1Schema = z.object({
  schema: z.literal('atlas.oak-judge-feedback.v1').default('atlas.oak-judge-feedback.v1'),
  feedbackId: id,
  kernelRevision: revision,
  /** GEPA program layer (OAK-12) does not exist yet — null until then. */
  programRevision: revision.nullable(),
  workflowRunId: id,
  failureClass: oakJudgeFailureClassSchema,
  evidenceRefs: z.array(id).min(1),
  executionReceiptRefs: z.array(id),
  proposedSchemaPatch: schemaPatchProposalSchema.nullable(),
  proposedFunctionPatch: functionPatchProposalSchema.nullable(),
  confidence: z.number().min(0).max(1),
  judgeRevision: revision,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  /** The judge diagnoses and proposes; it never applies a mutation itself. */
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (!value.proposedSchemaPatch && !value.proposedFunctionPatch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposedSchemaPatch'],
      message: 'A judge must propose at least one patch (schema or function) — a failure classification with no proposed remediation is not useful feedback',
    });
  }
  if (value.proposedSchemaPatch && value.proposedFunctionPatch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposedFunctionPatch'],
      message: 'A single judge feedback record diagnoses one layer (schema OR function), not both — split into two records if both layers are implicated',
    });
  }
});

export type OakJudgeFeedbackV1 = z.infer<typeof oakJudgeFeedbackV1Schema>;
export type SchemaPatchProposalV1 = z.infer<typeof schemaPatchProposalSchema>;
export type FunctionPatchProposalV1 = z.infer<typeof functionPatchProposalSchema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export interface BuildOakJudgeFeedbackV1Input {
  feedbackId: string;
  kernelRevision: string;
  programRevision?: string | null;
  workflowRunId: string;
  failureClass: OakJudgeFailureClass;
  evidenceRefs: string[];
  executionReceiptRefs?: string[];
  proposedSchemaPatch?: SchemaPatchProposalV1 | null;
  proposedFunctionPatch?: FunctionPatchProposalV1 | null;
  confidence: number;
  judgeRevision: string;
}

export function buildOakJudgeFeedbackV1(input: BuildOakJudgeFeedbackV1Input): OakJudgeFeedbackV1 {
  const body = {
    schema: 'atlas.oak-judge-feedback.v1' as const,
    feedbackId: input.feedbackId,
    kernelRevision: input.kernelRevision,
    programRevision: input.programRevision ?? null,
    workflowRunId: input.workflowRunId,
    failureClass: input.failureClass,
    evidenceRefs: input.evidenceRefs,
    executionReceiptRefs: input.executionReceiptRefs ?? [],
    proposedSchemaPatch: input.proposedSchemaPatch ?? null,
    proposedFunctionPatch: input.proposedFunctionPatch ?? null,
    confidence: input.confidence,
    judgeRevision: input.judgeRevision,
    canonicalAuthority: false as const,
  };
  return oakJudgeFeedbackV1Schema.parse({ ...body, checksum: sha256(body) });
}
