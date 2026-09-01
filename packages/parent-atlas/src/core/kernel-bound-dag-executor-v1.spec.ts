import { describe, expect, it } from 'vitest';
import { executeKernelBoundDagReadOnlyV1 } from './kernel-bound-dag-executor-v1.js';
import { buildAdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';

const hash = 'a'.repeat(64);

describe('KernelBoundDagExecutorV1', () => {
  it('executes dependencies first and produces a replayable non-authoritative receipt', async () => {
    const plan = buildAdaptiveDagPlanV1({
      planId: 'plan:1', queryId: 'query:1', dagRevision: 'dag:v1', plannerRevision: 'planner:v1', classificationRevision: 'class:v1',
      actions: [
        { actionId: 'b', actionKind: 'BUILD_CONTEXT', parentActionIds: ['a'], inputArtifactRefs: ['e'], inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: null, outputContract: 'context:v1', mutationPolicy: 'PROPOSE_ONLY', timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' },
        { actionId: 'a', actionKind: 'FETCH_FILE', parentActionIds: [], inputArtifactRefs: ['e'], inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: null, outputContract: 'file:v1', mutationPolicy: 'READ_ONLY', timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' },
      ],
    });
    const receipt = await executeKernelBoundDagReadOnlyV1({ plan, handlers: {
      FETCH_FILE: async () => ({ file: 'ok' }),
      BUILD_CONTEXT: async ({ parentResults }) => ({ context: parentResults[0] }),
    }});
    expect(receipt.actionOrder).toEqual(['a', 'b']);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.receiptChecksum).toHaveLength(64);
  });

  it('rejects mutation actions', async () => {
    const plan = buildAdaptiveDagPlanV1({ planId: 'plan:2', queryId: 'query:2', dagRevision: 'dag:v1', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', actions: [{ actionId: 'a', actionKind: 'FETCH_FILE', parentActionIds: [], inputArtifactRefs: ['e'], inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: null, outputContract: 'file:v1', mutationPolicy: 'MUTATES_WITH_RECEIPT', timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' }] });
    await expect(executeKernelBoundDagReadOnlyV1({ plan, handlers: { FETCH_FILE: async () => null } })).rejects.toThrow('KERNEL_BOUND_EXECUTOR_MUTATION_FORBIDDEN');
  });
});
