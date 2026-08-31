import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type KernelOperatorLibraryV1, findKernelOperator } from './kernel-operator-library-v1.js';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * AtlasKernelFunctionV1 (OAK-05) — a task-specific reasoning function
 * composed from operators already declared in an
 * `AtlasKernelOperatorLibraryV1`. This is the mechanism that keeps
 * `F` bounded: `buildAtlasKernelFunctionV1` refuses to build a function
 * whose `operatorGraph` references an operator not present in the
 * supplied library — there is no path to a kernel function that invokes
 * an undeclared operator.
 */
export const kernelFunctionOperatorStepSchema = z.object({
  stepId: id,
  operatorId: id,
  dependsOnStepIds: z.array(id).default([]),
}).strict();

export const atlasKernelFunctionV1Schema = z.object({
  schema: z.literal('atlas.kernel-function.v1').default('atlas.kernel-function.v1'),
  functionId: id,
  kernelRevision: revision,
  inputSchemaId: id,
  outputSchemaId: id,
  /** The exact operator library revision this function was compiled
   * against — bound automatically from the library passed to the builder,
   * never supplied independently by the caller, so it can't drift from
   * what `operatorGraph` was actually validated against. */
  operatorCatalogRevision: revision,
  operatorGraph: z.array(kernelFunctionOperatorStepSchema).min(1),
  preconditions: z.array(z.string().min(1)),
  postconditions: z.array(z.string().min(1)),
  requiredEvidenceKinds: z.array(z.string().min(1)),
  /** Relation types (from `HyperedgeV1`/`RelationshipKernelV1`'s closed
   * taxonomy) this function's execution depends on existing. */
  requiredRelationTypes: z.array(z.string().min(1)),
  /** Feature ids this function reads from — bounds which parts of the
   * candidate feature fabric a function is allowed to touch. */
  requiredFeatureIds: z.array(z.string().min(1)),
  /** Evidence classes this function's grounded results may cite — a
   * function cannot claim evidence of a kind not listed here, checked at
   * `QueryKernelGraphV1` binding time by the caller, not here (this field
   * only declares the allowlist). */
  allowedEvidenceClasses: z.array(z.string().min(1)).min(1),
  /** EXACT = every graph read must be against the frozen graphRevision the
   * kernel was compiled against; QUERY_SCOPED = graph reads may target the
   * graph revision live at query time. A function touching no graph
   * operator still declares this — EXACT is the safe default. */
  graphRevisionPolicy: z.enum(['EXACT', 'QUERY_SCOPED']),
  mutationPolicy: z.enum(['READ_ONLY', 'PROPOSE_ONLY', 'MUTATES_WITH_RECEIPT']),
  implementationChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const stepIds = new Set(value.operatorGraph.map((s) => s.stepId));
  for (const step of value.operatorGraph) {
    for (const dep of step.dependsOnStepIds) {
      if (!stepIds.has(dep)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['operatorGraph'], message: `Step ${step.stepId} depends on undeclared step ${dep}` });
      }
      if (dep === step.stepId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['operatorGraph'], message: `Step ${step.stepId} cannot depend on itself` });
      }
    }
  }
});

export type AtlasKernelFunctionV1 = z.infer<typeof atlasKernelFunctionV1Schema>;

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

export interface BuildAtlasKernelFunctionV1Input {
  functionId: string;
  kernelRevision: string;
  inputSchemaId: string;
  outputSchemaId: string;
  operatorLibrary: KernelOperatorLibraryV1;
  operatorGraph: { stepId: string; operatorId: string; dependsOnStepIds?: string[] }[];
  preconditions?: string[];
  postconditions?: string[];
  requiredEvidenceKinds?: string[];
  requiredRelationTypes?: string[];
  requiredFeatureIds?: string[];
  allowedEvidenceClasses: string[];
  graphRevisionPolicy?: 'EXACT' | 'QUERY_SCOPED';
  mutationPolicy: 'READ_ONLY' | 'PROPOSE_ONLY' | 'MUTATES_WITH_RECEIPT';
  producerRevision: string;
}

/**
 * The bounded-search-space guarantee lives here: this throws — it does not
 * silently drop the step or fall back — if any step's `operatorId` is not
 * present in `operatorLibrary`. A kernel function can only be built from
 * operators the library actually declares.
 */
export function buildAtlasKernelFunctionV1(input: BuildAtlasKernelFunctionV1Input): AtlasKernelFunctionV1 {
  for (const step of input.operatorGraph) {
    if (!findKernelOperator(input.operatorLibrary, step.operatorId)) {
      throw new Error(`KERNEL_FUNCTION_UNDECLARED_OPERATOR:${step.operatorId}`);
    }
  }
  const operatorGraph = input.operatorGraph.map((step) => ({
    stepId: step.stepId,
    operatorId: step.operatorId,
    dependsOnStepIds: step.dependsOnStepIds ?? [],
  }));
  const body = {
    schema: 'atlas.kernel-function.v1' as const,
    functionId: input.functionId,
    kernelRevision: input.kernelRevision,
    inputSchemaId: input.inputSchemaId,
    outputSchemaId: input.outputSchemaId,
    operatorCatalogRevision: input.operatorLibrary.libraryRevision,
    operatorGraph,
    preconditions: input.preconditions ?? [],
    postconditions: input.postconditions ?? [],
    requiredEvidenceKinds: input.requiredEvidenceKinds ?? [],
    requiredRelationTypes: input.requiredRelationTypes ?? [],
    requiredFeatureIds: input.requiredFeatureIds ?? [],
    allowedEvidenceClasses: input.allowedEvidenceClasses,
    graphRevisionPolicy: input.graphRevisionPolicy ?? 'EXACT',
    mutationPolicy: input.mutationPolicy,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return atlasKernelFunctionV1Schema.parse({ ...body, implementationChecksum: sha256(body) });
}
