import { type DagActionKind } from './adaptive-dag-plan-v1.js';
import { executeKernelBoundDagReadOnlyV1, type KernelBoundDagExecutionReceiptV1, type KernelBoundDagHandlerV1 } from './kernel-bound-dag-executor-v1.js';
import { type AdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';
import { type KernelDagExecutionBindingV1 } from './kernel-dag-execution-binding-v1.js';

export type KernelBoundDagAdapterV1 = KernelBoundDagHandlerV1 & {
  implementationRef: string;
  operatorId: string;
  operatorKind: string;
  actionKinds: readonly DagActionKind[];
  outputContract: string;
};

export type KernelBoundDagAdapterRegistryV1 = {
  implementationHandlers: Readonly<Record<string, KernelBoundDagHandlerV1>>;
  adapters: Readonly<Record<string, KernelBoundDagAdapterV1>>;
  registeredImplementationRefs: readonly string[];
  canonicalAuthority: false;
};

/** Build a registry from existing runtime owners; this function performs no I/O. */
export function buildKernelBoundDagAdapterRegistryV1(adapters: readonly KernelBoundDagAdapterV1[]): KernelBoundDagAdapterRegistryV1 {
  const implementationHandlers: Record<string, KernelBoundDagHandlerV1> = {};
  const registeredAdapters: Record<string, KernelBoundDagAdapterV1> = {};
  for (const adapter of adapters) {
    if (implementationHandlers[adapter.implementationRef]) throw new Error(`DAG_ADAPTER_DUPLICATE_IMPLEMENTATION:${adapter.implementationRef}`);
    if (!adapter.actionKinds.length) throw new Error(`DAG_ADAPTER_ACTION_KINDS_MISSING:${adapter.implementationRef}`);
    implementationHandlers[adapter.implementationRef] = adapter;
    registeredAdapters[adapter.implementationRef] = adapter;
  }
  return { implementationHandlers, adapters: registeredAdapters, registeredImplementationRefs: Object.keys(implementationHandlers).sort(), canonicalAuthority: false };
}

export async function executeWithKernelBoundDagAdapterRegistryV1(input: {
  plan: AdaptiveDagPlanV1;
  registry: KernelBoundDagAdapterRegistryV1;
  bindings: readonly KernelDagExecutionBindingV1[];
}): Promise<KernelBoundDagExecutionReceiptV1> {
  const bindings = new Map<string, KernelDagExecutionBindingV1>();
  for (const binding of input.bindings) {
    if (bindings.has(binding.action.actionId)) throw new Error(`DAG_ADAPTER_DUPLICATE_BINDING:${binding.action.actionId}`);
    const adapter = input.registry.adapters[binding.implementationRef];
    if (!adapter) throw new Error(`DAG_ADAPTER_NOT_REGISTERED:${binding.implementationRef}`);
    if (!adapter.actionKinds.includes(binding.action.actionKind)) throw new Error(`DAG_ADAPTER_ACTION_KIND_MISMATCH:${binding.action.actionId}`);
    if (adapter.operatorId !== binding.operatorId || adapter.operatorKind !== binding.operatorKind) throw new Error(`DAG_ADAPTER_OPERATOR_MISMATCH:${binding.action.actionId}`);
    if (adapter.outputContract !== binding.expectedOutputSchemaId) throw new Error(`DAG_ADAPTER_OUTPUT_CONTRACT_MISMATCH:${binding.action.actionId}`);
    bindings.set(binding.action.actionId, binding);
  }
  for (const action of input.plan.actions) {
    if (!bindings.has(action.actionId)) throw new Error(`DAG_ADAPTER_BINDING_MISSING:${action.actionId}`);
  }
  return executeKernelBoundDagReadOnlyV1({ plan: input.plan, handlers: {}, bindings, implementationHandlers: input.registry.implementationHandlers });
}

export function assertReadOnlyApprovalBoundaryV1(plan: AdaptiveDagPlanV1, approved: boolean): void {
  if (!approved) throw new Error('DAG_APPROVAL_REQUIRED');
  if (plan.actions.some((action) => action.mutationPolicy === 'MUTATES_WITH_RECEIPT')) throw new Error('DAG_MUTATION_REQUIRES_PROMOTION_GATE');
}
