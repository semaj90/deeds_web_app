import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AtlasKernelFunctionV1 } from './kernel-function-v1.js';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * QueryKernelGraphV1 (OAK-06) — the per-query evidence graph a
 * kernel-bound execution produces: which function(s) were selected, what
 * typed arguments they were bound with, and what grounded evidence
 * resulted. This is a QUERY-TIME artifact — it produces no new canonical
 * identity, matches the rule already enforced everywhere else in this
 * repo for retrieval-time structures (`atlas/research/*`'s
 * `canonicalAuthority: false`, `ast-grep-observation-adapter.ts`'s
 * `canonical_authority: false`).
 */
export const groundedEvidenceRefSchema = z.object({
  evidenceKind: z.string().min(1),
  evidenceRef: id,
  evidenceChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const functionSelectionStepSchema = z.object({
  stepId: id,
  functionId: id,
  functionImplementationChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  boundArguments: z.record(z.string(), z.unknown()),
  groundedResult: z.unknown(),
  groundedEvidence: z.array(groundedEvidenceRefSchema),
  status: z.enum(['SUCCEEDED', 'FAILED', 'SKIPPED']),
}).strict();

export const queryKernelGraphV1Schema = z.object({
  schema: z.literal('atlas.query-kernel-graph.v1').default('atlas.query-kernel-graph.v1'),
  queryGraphId: id,
  kernelRevision: revision,
  queryText: z.string().min(1),
  functionSelections: z.array(functionSelectionStepSchema).min(1),
  queryGraphChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  for (const step of value.functionSelections) {
    if (step.status === 'SUCCEEDED' && step.groundedEvidence.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['functionSelections'],
        message: `Step ${step.stepId} is SUCCEEDED but cites zero grounded evidence — OaK requires selections to be evidence-grounded, not just successful`,
      });
    }
  }
});

export type QueryKernelGraphV1 = z.infer<typeof queryKernelGraphV1Schema>;
export type FunctionSelectionStepV1 = z.infer<typeof functionSelectionStepSchema>;

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

export interface BuildQueryKernelGraphV1Input {
  queryGraphId: string;
  kernelRevision: string;
  queryText: string;
  /**
   * Every selected function must come from the active kernel's own
   * function set — passing a function whose `kernelRevision` doesn't
   * match is refused, the same guarantee `ontology-kernel-manifest-v1.ts`
   * enforces at freeze time.
   */
  selections: {
    stepId: string;
    calledFunction: AtlasKernelFunctionV1;
    boundArguments: Record<string, unknown>;
    groundedResult: unknown;
    groundedEvidence: { evidenceKind: string; evidenceRef: string; evidenceChecksum?: string }[];
    status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  }[];
  producerRevision: string;
}

export function buildQueryKernelGraphV1(input: BuildQueryKernelGraphV1Input): QueryKernelGraphV1 {
  for (const selection of input.selections) {
    if (selection.calledFunction.kernelRevision !== input.kernelRevision) {
      throw new Error(`QUERY_KERNEL_GRAPH_FUNCTION_KERNEL_MISMATCH:${selection.calledFunction.functionId}`);
    }
  }
  const functionSelections = input.selections.map((selection) => ({
    stepId: selection.stepId,
    functionId: selection.calledFunction.functionId,
    functionImplementationChecksum: selection.calledFunction.implementationChecksum,
    boundArguments: selection.boundArguments,
    groundedResult: selection.groundedResult,
    groundedEvidence: selection.groundedEvidence,
    status: selection.status,
  }));
  const body = {
    schema: 'atlas.query-kernel-graph.v1' as const,
    queryGraphId: input.queryGraphId,
    kernelRevision: input.kernelRevision,
    queryText: input.queryText,
    functionSelections,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return queryKernelGraphV1Schema.parse({ ...body, queryGraphChecksum: sha256(body) });
}
