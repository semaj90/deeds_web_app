import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';
import { buildKernelDagExecutionBindingV1, checksumKernelDagBoundArguments } from './kernel-dag-execution-binding-v1.js';
import { assertReadOnlyApprovalBoundaryV1, buildKernelBoundDagAdapterRegistryV1, executeWithKernelBoundDagAdapterRegistryV1 } from './kernel-bound-dag-adapter-registry-v1.js';

const hash = 'b'.repeat(64);
const boundArguments = { symbol: 'foo' };
const action = { actionId: 'a', actionKind: 'FETCH_POSTGRES' as const, parentActionIds: [], inputArtifactRefs: ['e'], inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: checksumKernelDagBoundArguments(boundArguments), outputContract: 'rows:v1', mutationPolicy: 'READ_ONLY' as const, timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' as const };

describe('KernelBoundDagAdapterRegistryV1', () => {
  it('registers an existing owner and replays through the shared executor', async () => {
    const plan = buildAdaptiveDagPlanV1({ planId: 'plan:adapter', queryId: 'query:adapter', dagRevision: 'dag:v1', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', actions: [action] });
    const handler = Object.assign(async () => ({ rows: [] }), { implementationRef: 'postgres:lookup-symbol', operatorId: 'op:lookup-symbol', operatorKind: 'LOOKUP_SYMBOL', actionKinds: ['FETCH_POSTGRES'] as const, outputContract: 'rows:v1' });
    const registry = buildKernelBoundDagAdapterRegistryV1([handler]);
    const binding = buildKernelDagExecutionBindingV1({ action: plan.actions[0], functionId: 'fn:symbol', stepId: 'step:1', operatorId: 'op:lookup-symbol', operatorKind: 'LOOKUP_SYMBOL', implementationRef: 'postgres:lookup-symbol', boundArguments, expectedOutputSchemaId: 'rows:v1' });
    const first = await executeWithKernelBoundDagAdapterRegistryV1({ plan, registry, bindings: [binding] });
    const second = await executeWithKernelBoundDagAdapterRegistryV1({ plan, registry, bindings: [binding] });
    expect(first.receiptChecksum).toBe(second.receiptChecksum);
    expect(first.writesPerformed).toBe(false);
  });

  it('rejects missing owners and requires explicit approval', async () => {
    const plan = buildAdaptiveDagPlanV1({ planId: 'plan:adapter-2', queryId: 'query:adapter-2', dagRevision: 'dag:v1', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', actions: [action] });
    const binding = buildKernelDagExecutionBindingV1({ action: plan.actions[0], functionId: 'fn:symbol', stepId: 'step:1', operatorId: 'op:lookup-symbol', operatorKind: 'LOOKUP_SYMBOL', implementationRef: 'missing:owner', boundArguments, expectedOutputSchemaId: 'rows:v1' });
    await expect(executeWithKernelBoundDagAdapterRegistryV1({ plan, registry: buildKernelBoundDagAdapterRegistryV1([]), bindings: [binding] })).rejects.toThrow('DAG_ADAPTER_NOT_REGISTERED');
    expect(() => assertReadOnlyApprovalBoundaryV1(plan, false)).toThrow('DAG_APPROVAL_REQUIRED');
    expect(() => assertReadOnlyApprovalBoundaryV1(plan, true)).not.toThrow();
  });
});
