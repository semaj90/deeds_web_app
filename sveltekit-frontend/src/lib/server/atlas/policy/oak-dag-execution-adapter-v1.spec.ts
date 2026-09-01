import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1, buildKernelDagExecutionBindingV1, checksumKernelDagBoundArguments } from '@deeds/parent-atlas';
import { executeOakDagThroughBoundedExecutorV1 } from './oak-dag-execution-adapter-v1.js';

const hash = 'c'.repeat(64);
const boundArguments = { sourceRef: 'x' };
const action = { actionId: 'fetch', actionKind: 'FETCH_FILE' as const, parentActionIds: [], inputArtifactRefs: ['e'], inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: checksumKernelDagBoundArguments(boundArguments), outputContract: 'file:v1', mutationPolicy: 'READ_ONLY' as const, timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' as const };

describe('OakDagExecutionAdapterV1', () => {
	it('replays through the existing bounded executor', async () => {
		const plan = buildAdaptiveDagPlanV1({ planId: 'p', queryId: 'q', dagRevision: 'd', plannerRevision: 'r', classificationRevision: 'c', actions: [action] });
		const handler = { implementationRef: 'file:read', operatorId: 'op:source-span', operatorKind: 'GET_SOURCE_SPAN', actionKinds: ['FETCH_FILE'] as const, outputContract: 'file:v1', run: async () => ({ sourceRef: 'x' }) };
		const binding = buildKernelDagExecutionBindingV1({ action: plan.actions[0], functionId: 'fn:file', stepId: 'step:1', operatorId: 'op:source-span', operatorKind: 'GET_SOURCE_SPAN', implementationRef: 'file:read', boundArguments, expectedOutputSchemaId: 'file:v1' });
		const first = await executeOakDagThroughBoundedExecutorV1({ plan, handlers: [handler], bindings: [binding] });
		const second = await executeOakDagThroughBoundedExecutorV1({ plan, handlers: [handler], bindings: [binding] });
		expect(first.deterministicExecutionChecksum).toBe(second.deterministicExecutionChecksum);
		expect(first.writesPerformed).toBe(false);
		expect(first.actions[0]).toMatchObject({ actionKind: 'FETCH_FILE', inputChecksum: hash, outputChecksum: expect.any(String), writesPerformed: false });
	});

	it('fails a timed-out read-only action closed', async () => {
		const plan = buildAdaptiveDagPlanV1({ planId: 'timeout', queryId: 'q', dagRevision: 'd', plannerRevision: 'r', classificationRevision: 'c', actions: [{ ...action, actionId: 'slow', timeoutMs: 1 }] });
		const receipt = await executeOakDagThroughBoundedExecutorV1({
			plan,
			handlers: [{ implementationRef: 'file:slow', operatorId: 'op:source-span', operatorKind: 'GET_SOURCE_SPAN', actionKinds: ['FETCH_FILE'], outputContract: 'file:v1', run: async () => new Promise((resolve) => setTimeout(() => resolve({ sourceRef: 'late' }), 20)) }],
			bindings: [buildKernelDagExecutionBindingV1({ action: { ...plan.actions[0], actionId: 'slow' }, functionId: 'fn:file', stepId: 'step:1', operatorId: 'op:source-span', operatorKind: 'GET_SOURCE_SPAN', implementationRef: 'file:slow', boundArguments, expectedOutputSchemaId: 'file:v1' })],
		});
		expect(receipt.actions[0]).toMatchObject({ status: 'TIMED_OUT', error: 'Error: OAK_EXEC_ACTION_TIMEOUT:slow', writesPerformed: false });
	});
});
