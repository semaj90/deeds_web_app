import { createHash } from 'node:crypto';
import { z } from 'zod';
import { adaptiveDagPlanV1Schema, type AdaptiveDagActionV1, type AdaptiveDagPlanV1, type DagActionKind } from './adaptive-dag-plan-v1.js';
import { resolveKernelDagParameterArtifactV1, type KernelDagExecutionBindingV1 } from './kernel-dag-execution-binding-v1.js';
import { type ParameterArtifactV1 } from './parameter-artifact-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const kernelBoundDagExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.kernel-bound-dag-execution-receipt.v1'),
  planId: z.string().min(1),
  planChecksum: sha256,
  actionOrder: z.array(z.string().min(1)),
  actionResults: z.array(z.object({
    actionId: z.string().min(1),
    actionChecksum: sha256,
    outputChecksum: sha256,
    status: z.literal('SUCCEEDED'),
  }).strict()),
  receiptChecksum: sha256,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type KernelBoundDagExecutionReceiptV1 = z.infer<typeof kernelBoundDagExecutionReceiptV1Schema>;
export type KernelBoundDagHandlerV1 = (input: {
  action: AdaptiveDagActionV1;
  parentResults: readonly unknown[];
  binding?: KernelDagExecutionBindingV1;
}) => Promise<unknown>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => { out[key] = item[key]; return out; }, {})
    : item);
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

/** Execute an admitted DAG without granting it mutation authority. */
export async function executeKernelBoundDagReadOnlyV1(input: {
  plan: AdaptiveDagPlanV1;
  handlers: Partial<Record<DagActionKind, KernelBoundDagHandlerV1>>;
  bindings?: ReadonlyMap<string, KernelDagExecutionBindingV1>;
  implementationHandlers?: Readonly<Record<string, KernelBoundDagHandlerV1>>;
  parameterArtifacts?: ReadonlyMap<string, ParameterArtifactV1>;
}): Promise<KernelBoundDagExecutionReceiptV1> {
  const plan = adaptiveDagPlanV1Schema.parse(input.plan);
  if (plan.actions.some((action) => action.mutationPolicy === 'MUTATES_WITH_RECEIPT')) {
    throw new Error('KERNEL_BOUND_EXECUTOR_MUTATION_FORBIDDEN');
  }

  const byId = new Map(plan.actions.map((action) => [action.actionId, action]));
  const completed = new Map<string, unknown>();
  const order: string[] = [];
  const results: KernelBoundDagExecutionReceiptV1['actionResults'] = [];

  const visit = async (action: AdaptiveDagActionV1): Promise<void> => {
    if (completed.has(action.actionId)) return;
    for (const parentId of action.parentActionIds) {
      const parent = byId.get(parentId);
      if (!parent) throw new Error(`KERNEL_BOUND_EXECUTOR_PARENT_MISSING:${parentId}`);
      await visit(parent);
    }
    const binding = input.bindings?.get(action.actionId);
    const handler = binding
      ? input.implementationHandlers?.[binding.implementationRef]
      : input.handlers[action.actionKind];
    if (binding && binding.action.actionId !== action.actionId) throw new Error(`KERNEL_BOUND_EXECUTOR_BINDING_ACTION_MISMATCH:${action.actionId}`);
    if (!handler) throw new Error(`KERNEL_BOUND_EXECUTOR_HANDLER_MISSING:${action.actionKind}`);
    const resolvedBinding = binding && action.parameterArtifactRef
      ? { ...binding, boundArguments: resolveKernelDagParameterArtifactV1({ action, binding, artifact: input.parameterArtifacts?.get(action.parameterArtifactRef) ?? (() => { throw new Error(`KERNEL_BOUND_EXECUTOR_PARAMETER_ARTIFACT_MISSING:${action.actionId}`); })() }) }
      : binding;
    const parentResults = action.parentActionIds.map((parentId) => completed.get(parentId));
    const output = await handler({ action, parentResults, binding: resolvedBinding });
    completed.set(action.actionId, output);
    order.push(action.actionId);
    results.push({ actionId: action.actionId, actionChecksum: action.inputChecksum, outputChecksum: digest(output), status: 'SUCCEEDED' });
  };

  for (const action of plan.actions) await visit(action);
  const body = { schema: 'atlas.kernel-bound-dag-execution-receipt.v1' as const, planId: plan.planId, planChecksum: plan.planChecksum, actionOrder: order, actionResults: results, canonicalAuthority: false as const, writesPerformed: false as const };
  return kernelBoundDagExecutionReceiptV1Schema.parse({ ...body, receiptChecksum: digest(body) });
}
