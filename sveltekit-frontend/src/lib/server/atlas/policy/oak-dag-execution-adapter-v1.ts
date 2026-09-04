import { createHash } from 'node:crypto';
import { resolveKernelDagParameterArtifactV1, type AdaptiveDagActionV1, type AdaptiveDagPlanV1, type DagActionKind, type KernelDagExecutionBindingV1, type ParameterArtifactV1 } from '@deeds/parent-atlas';
import { runBoundedExecutionPlan, type ExecutorLimits, type ResourceClass } from './bounded-executor.js';

export type OakDagActionHandlerV1 = {
	implementationRef: string;
	operatorId: string;
	operatorKind: string;
	actionKinds: readonly DagActionKind[];
	outputContract: string;
	run: (input: { action: AdaptiveDagActionV1; parentResults: readonly unknown[]; binding: KernelDagExecutionBindingV1 }) => Promise<unknown>;
};

export type OakDagActionExecutionReceiptV1 = {
	id: string;
	actionKind: DagActionKind;
	status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED_DEPENDENCY' | 'TIMED_OUT';
	inputChecksum: string;
	outputChecksum?: string;
	error?: string;
	durationMs: number;
	writesPerformed: false;
	canonicalAuthority: false;
};

export type OakExecutionReceiptV1 = {
	schema: 'atlas.oak-execution-receipt.v1';
	planId: string;
	planChecksum: string;
	actions: readonly OakDagActionExecutionReceiptV1[];
	deterministicExecutionChecksum: string;
	writesPerformed: false;
	canonicalAuthority: false;
};

const RESOURCE_BY_ACTION: Partial<Record<DagActionKind, ResourceClass>> = {
	FETCH_POSTGRES: 'IO', FETCH_QDRANT: 'IO', FETCH_FILE: 'IO', AST_SCAN: 'CPU_LIGHT',
	SIMDJSON_SCAN: 'CPU_LIGHT', GRAPH_EXPAND: 'CPU_HEAVY', RERANK: 'GPU_LIGHT', BUILD_CONTEXT: 'CPU_LIGHT',
};

function checksum(value: unknown): string {
	const stable = (item: unknown): unknown => {
		if (Array.isArray(item)) return item.map(stable);
		if (item && typeof item === 'object') {
			return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
				out[key] = stable((item as Record<string, unknown>)[key]);
				return out;
			}, {});
		}
		return item;
	};
	return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, actionId: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`OAK_EXEC_ACTION_TIMEOUT:${actionId}`)), timeoutMs);
		promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
	});
}

/** Binds OaK plans to the existing bounded scheduler; it never performs mutation actions. */
export async function executeOakDagThroughBoundedExecutorV1(input: {
	plan: AdaptiveDagPlanV1;
	handlers: readonly OakDagActionHandlerV1[];
	bindings: readonly KernelDagExecutionBindingV1[];
	parameterArtifacts?: ReadonlyMap<string, ParameterArtifactV1>;
	limits?: ExecutorLimits;
}): Promise<OakExecutionReceiptV1> {
	if (input.plan.actions.some((action) => action.mutationPolicy === 'MUTATES_WITH_RECEIPT')) {
		throw new Error('OAK_EXEC_MUTATION_REQUIRES_PROMOTION');
	}
	const byImplementationRef = new Map(input.handlers.map((handler) => [handler.implementationRef, handler]));
	const bindingByActionId = new Map(input.bindings.map((binding) => [binding.action.actionId, binding]));
	const actionById = new Map(input.plan.actions.map((action) => [action.actionId, action]));
	for (const action of input.plan.actions) {
		const binding = bindingByActionId.get(action.actionId);
		if (!binding) throw new Error(`OAK_EXEC_BINDING_MISSING:${action.actionId}`);
		const handler = byImplementationRef.get(binding.implementationRef);
		if (!handler) throw new Error(`OAK_EXEC_HANDLER_MISSING:${binding.implementationRef}`);
		if (!handler.actionKinds.includes(action.actionKind)) throw new Error(`OAK_EXEC_ACTION_KIND_MISMATCH:${action.actionId}`);
		if (handler.operatorId !== binding.operatorId || handler.operatorKind !== binding.operatorKind) throw new Error(`OAK_EXEC_OPERATOR_MISMATCH:${action.actionId}`);
		if (handler.outputContract !== binding.expectedOutputSchemaId) throw new Error(`OAK_EXEC_OUTPUT_CONTRACT_MISMATCH:${action.actionId}`);
		for (const parentId of action.parentActionIds) if (!actionById.has(parentId)) throw new Error(`OAK_EXEC_PARENT_MISSING:${parentId}`);
	}

	const completed = new Map<string, unknown>();
	const startedAt = new Map<string, number>();
	const tasks = input.plan.actions.map((action) => ({
		id: action.actionId,
		priority: input.plan.actions.length - input.plan.actions.indexOf(action),
		dependencies: action.parentActionIds,
		resourceClass: RESOURCE_BY_ACTION[action.actionKind] ?? 'CPU_LIGHT',
			run: async () => {
				startedAt.set(action.actionId, Date.now());
				const binding = bindingByActionId.get(action.actionId)!;
				const effectiveBinding = action.parameterArtifactRef
					? { ...binding, boundArguments: resolveKernelDagParameterArtifactV1({
						action,
						binding,
						artifact: input.parameterArtifacts?.get(action.parameterArtifactRef) ?? (() => { throw new Error(`OAK_EXEC_PARAMETER_ARTIFACT_MISSING:${action.actionId}`); })(),
					}) }
					: binding;
				const handler = byImplementationRef.get(effectiveBinding.implementationRef)!;
				const result = await withTimeout(
					handler.run({ action, parentResults: action.parentActionIds.map((id) => completed.get(id)), binding: effectiveBinding }),
				action.timeoutMs,
				action.actionId,
			);
			completed.set(action.actionId, result);
			return result;
		},
	}));
	const schedulerReceipts = await runBoundedExecutionPlan(tasks, input.limits);
	const actions: OakDagActionExecutionReceiptV1[] = schedulerReceipts.map((receipt) => {
		const action = actionById.get(receipt.id)!;
		const error = receipt.error;
		const timedOut = error?.includes(`OAK_EXEC_ACTION_TIMEOUT:${receipt.id}`) ?? false;
		return {
			id: receipt.id,
			actionKind: action.actionKind,
			status: timedOut ? 'TIMED_OUT' : receipt.status,
			inputChecksum: action.inputChecksum,
			...(receipt.status === 'SUCCEEDED' ? { outputChecksum: checksum(receipt.value) } : {}),
			...(error ? { error } : {}),
			durationMs: Math.max(0, Date.now() - (startedAt.get(receipt.id) ?? Date.now())),
			writesPerformed: false,
			canonicalAuthority: false,
		};
	});
	return {
		schema: 'atlas.oak-execution-receipt.v1',
		planId: input.plan.planId,
		planChecksum: input.plan.planChecksum,
		actions,
		deterministicExecutionChecksum: checksum(actions.map(({ id, actionKind, status, inputChecksum, outputChecksum, error }) => ({ id, actionKind, status, inputChecksum, outputChecksum, error }))),
		writesPerformed: false,
		canonicalAuthority: false,
	};
}
