import { createHash } from 'node:crypto';
import { z } from 'zod';
import { OpenSpecWorkboardTaskV1Schema } from './workboard-contract-v1.js';

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const snapshotSchema = z.object({
	schema: z.literal('atlas.openspec.workboard.v1'),
	taskInventory: z.array(OpenSpecWorkboardTaskV1Schema),
	sourceFileHashes: z.record(z.string(), digestSchema),
}).passthrough().superRefine((snapshot, ctx) => {
	const paths = new Set(Object.keys(snapshot.sourceFileHashes));
	const stableKeys = new Set<string>();
	for (const [index, task] of snapshot.taskInventory.entries()) {
		if (!paths.has(task.source)) {
			ctx.addIssue({ code: 'custom', path: ['taskInventory', index, 'source'], message: 'task source must have a source-file revision' });
		}
		if (stableKeys.has(task.stableKey)) {
			ctx.addIssue({ code: 'custom', path: ['taskInventory', index, 'stableKey'], message: 'DUPLICATE_TASK_STABLE_KEY' });
		}
		stableKeys.add(task.stableKey);
	}
});

const taskStateSchema = z.object({
	state: z.string(),
	executionState: z.string(),
	blockHash: z.string(),
}).strict();

export const openSpecTaskObservationEventV1Schema = z.object({
	schema: z.literal('atlas.openspec-task-observation.v1'),
	eventId: digestSchema,
	payloadHash: digestSchema,
	kind: z.enum(['SOURCE_FILE_CHANGED', 'TASK_ADDED', 'TASK_REMOVED', 'TASK_CHANGED']),
	changeId: z.string().min(1),
	taskStableKey: z.string().min(1).nullable(),
	taskKey: z.string().min(1).nullable(),
	sourcePath: z.string().min(1),
	sourcePathBefore: z.string().min(1).nullable(),
	sourcePathAfter: z.string().min(1).nullable(),
	taskSourceRefBefore: z.string().min(1).nullable(),
	taskSourceRefAfter: z.string().min(1).nullable(),
	sourceRevisionBefore: digestSchema.nullable(),
	sourceRevisionAfter: digestSchema.nullable(),
	taskBefore: taskStateSchema.nullable(),
	taskAfter: taskStateSchema.nullable(),
	fromWorkboardRevision: digestSchema,
	toWorkboardRevision: digestSchema,
	evidenceRefs: z.array(z.string().min(1)),
	classification: z.literal('OBSERVATION_ONLY_RECONCILIATION_REQUEST'),
	writesPerformed: z.literal(false),
}).strict();

export type OpenSpecTaskObservationEventV1 = z.infer<typeof openSpecTaskObservationEventV1Schema>;

const taskIdentityCensusSchema = z.object({
	schema: z.literal('atlas.openspec-evidence-portfolio-census.v2'),
	source: z.object({ workspaceRevision: digestSchema }).passthrough(),
	tasks: z.array(z.object({
		taskRef: z.string().min(1),
		changeId: z.string().min(1),
		canonicalTaskRef: z.string().min(1).nullable(),
		taskHash: digestSchema,
		sourceFileRevision: digestSchema.nullable(),
		taskIdStatus: z.enum(['DECLARED_ID', 'DERIVED_ID', 'AMBIGUOUS']),
		taskIdentity: z.object({ identityState: z.string().optional() }).passthrough().optional(),
	}).passthrough()),
}).passthrough();

const taskIdentityResolutionStatusSchema = z.enum([
	'BOUND_TO_CURRENT_TASK',
	'NOT_A_TASK_EVENT',
	'INVALID_EVENT',
	'EVENT_CHECKSUM_MISMATCH',
	'INVALID_CENSUS',
	'TASK_SOURCE_REF_MISSING',
	'TASK_SOURCE_REF_NOT_FOUND',
	'TASK_SOURCE_REF_AMBIGUOUS',
	'TASK_CHANGE_ID_MISMATCH',
	'TASK_REVISION_MISMATCH',
	'SOURCE_REVISION_MISMATCH',
	'TASK_IDENTITY_AMBIGUOUS',
	'CANONICAL_TASK_REF_MISSING',
]);

const taskIdentityResolutionBodySchema = z.object({
	schema: z.literal('atlas.openspec-task-identity-resolution.v1'),
	eventId: digestSchema.nullable(),
	eventKind: z.string().nullable(),
	taskSourceRef: z.string().nullable(),
	canonicalTaskRef: z.string().nullable(),
	taskRevision: digestSchema.nullable(),
	sourceRevision: digestSchema.nullable(),
	workspaceRevision: digestSchema.nullable(),
	status: taskIdentityResolutionStatusSchema,
	canonicalAuthority: z.literal(false),
	dispatchAuthorized: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();

export const OpenSpecTaskIdentityResolutionV1Schema = taskIdentityResolutionBodySchema.extend({
	checksum: digestSchema,
}).strict();

export type OpenSpecTaskIdentityResolutionV1 = z.infer<typeof OpenSpecTaskIdentityResolutionV1Schema>;

function taskIdentityResolution(input: z.input<typeof taskIdentityResolutionBodySchema>): OpenSpecTaskIdentityResolutionV1 {
	const body = taskIdentityResolutionBodySchema.parse(input);
	return OpenSpecTaskIdentityResolutionV1Schema.parse({ ...body, checksum: digest(body) });
}

export function resolveOpenSpecTaskObservationIdentityV1(eventInput: unknown, censusInput: unknown): OpenSpecTaskIdentityResolutionV1 {
	const eventResult = openSpecTaskObservationEventV1Schema.safeParse(eventInput);
	const event = eventResult.success ? eventResult.data : null;
	const censusResult = taskIdentityCensusSchema.safeParse(censusInput);
	const census = censusResult.success ? censusResult.data : null;
	const base = {
		schema: 'atlas.openspec-task-identity-resolution.v1' as const,
		eventId: event?.eventId ?? null,
		eventKind: event?.kind ?? null,
		taskSourceRef: null,
		canonicalTaskRef: null,
		taskRevision: null,
		sourceRevision: null,
		workspaceRevision: census?.source.workspaceRevision ?? null,
		canonicalAuthority: false as const,
		dispatchAuthorized: false as const,
		writesPerformed: false as const,
	};
	if (!event) return taskIdentityResolution({ ...base, status: 'INVALID_EVENT' });
	const { schema, eventId, payloadHash, evidenceRefs: _evidenceRefs, ...payload } = event;
	if (_evidenceRefs.length !== 0 || payloadHash !== digest(payload) || eventId !== digest({ schema, payloadHash })) {
		return taskIdentityResolution({ ...base, status: 'EVENT_CHECKSUM_MISMATCH' });
	}
	if (!census) return taskIdentityResolution({ ...base, status: 'INVALID_CENSUS' });
	if (event.kind === 'SOURCE_FILE_CHANGED') return taskIdentityResolution({ ...base, status: 'NOT_A_TASK_EVENT' });

	const isAfter = event.kind !== 'TASK_REMOVED';
	const taskSourceRef = isAfter ? event.taskSourceRefAfter : event.taskSourceRefBefore;
	const taskState = isAfter ? event.taskAfter : event.taskBefore;
	const sourceRevision = isAfter ? event.sourceRevisionAfter : event.sourceRevisionBefore;
	const sourcePath = isAfter ? event.sourcePathAfter : event.sourcePathBefore;
	if (!taskSourceRef || !taskState || !sourceRevision || !sourcePath) {
		return taskIdentityResolution({ ...base, status: 'TASK_SOURCE_REF_MISSING' });
	}
	if (!taskSourceRef.startsWith(`${sourcePath}#L`)) {
		return taskIdentityResolution({ ...base, taskSourceRef, taskRevision: taskState.blockHash, sourceRevision, status: 'TASK_SOURCE_REF_MISSING' });
	}
	const matches = census.tasks.filter((task) => task.taskRef === taskSourceRef);
	if (!matches.length) return taskIdentityResolution({ ...base, taskSourceRef, taskRevision: taskState.blockHash, sourceRevision, status: 'TASK_SOURCE_REF_NOT_FOUND' });
	if (matches.length !== 1) return taskIdentityResolution({ ...base, taskSourceRef, taskRevision: taskState.blockHash, sourceRevision, status: 'TASK_SOURCE_REF_AMBIGUOUS' });
	const task = matches[0];
	const resolvedBase = { ...base, taskSourceRef, taskRevision: task.taskHash, sourceRevision: task.sourceFileRevision };
	if (task.changeId !== event.changeId) return taskIdentityResolution({ ...resolvedBase, status: 'TASK_CHANGE_ID_MISMATCH' });
	if (task.taskHash !== taskState.blockHash) return taskIdentityResolution({ ...resolvedBase, status: 'TASK_REVISION_MISMATCH' });
	if (!task.sourceFileRevision || task.sourceFileRevision !== sourceRevision) return taskIdentityResolution({ ...resolvedBase, status: 'SOURCE_REVISION_MISMATCH' });
	if (task.taskIdStatus === 'AMBIGUOUS' || ['AMBIGUOUS', 'INVALID', 'CONFLICTING'].includes(task.taskIdentity?.identityState ?? '')) {
		return taskIdentityResolution({ ...resolvedBase, status: 'TASK_IDENTITY_AMBIGUOUS' });
	}
	if (!task.canonicalTaskRef) return taskIdentityResolution({ ...resolvedBase, status: 'CANONICAL_TASK_REF_MISSING' });
	return taskIdentityResolution({ ...resolvedBase, canonicalTaskRef: task.canonicalTaskRef, status: 'BOUND_TO_CURRENT_TASK' });
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): `sha256:${string}` {
	return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

function taskState(task: z.infer<typeof OpenSpecWorkboardTaskV1Schema> | undefined) {
	return task ? {
		state: task.state,
		executionState: task.executionState,
		blockHash: task.blockHash,
	} : null;
}

function snapshotRevision(snapshot: z.infer<typeof snapshotSchema>): `sha256:${string}` {
	return digest({
		sourceFileHashes: snapshot.sourceFileHashes,
		tasks: snapshot.taskInventory.map((task) => ({
			stableKey: task.stableKey,
			taskKey: task.taskKey,
			change: task.change,
			source: task.source,
			line: task.line,
			blockHash: task.blockHash,
			state: task.state,
			executionState: task.executionState,
		})).sort((left, right) => left.stableKey.localeCompare(right.stableKey)),
	});
}

function eventFromPayload(payload: Omit<OpenSpecTaskObservationEventV1, 'schema' | 'eventId' | 'payloadHash' | 'evidenceRefs'>): OpenSpecTaskObservationEventV1 {
	const payloadHash = digest(payload);
	return openSpecTaskObservationEventV1Schema.parse({
		schema: 'atlas.openspec-task-observation.v1',
		...payload,
		evidenceRefs: [],
		payloadHash,
		eventId: digest({ schema: 'atlas.openspec-task-observation.v1', payloadHash }),
	});
}

export function diffOpenSpecTaskSnapshotsV1(input: {
	previous: unknown;
	next: unknown;
}): OpenSpecTaskObservationEventV1[] {
	const previous = snapshotSchema.parse(input.previous);
	const next = snapshotSchema.parse(input.next);
	const previousRevision = snapshotRevision(previous);
	const nextRevision = snapshotRevision(next);
	if (previousRevision === nextRevision) return [];

	const events: OpenSpecTaskObservationEventV1[] = [];
	const paths = [...new Set([
		...Object.keys(previous.sourceFileHashes),
		...Object.keys(next.sourceFileHashes),
	])].sort();

	for (const sourcePath of paths) {
		const before = previous.sourceFileHashes[sourcePath] ?? null;
		const after = next.sourceFileHashes[sourcePath] ?? null;
		if (before === after) continue;
		events.push(eventFromPayload({
			kind: 'SOURCE_FILE_CHANGED',
			changeId: sourcePath.match(/^openspec\/changes\/([^/]+)\/tasks\.md$/)?.[1] ?? 'UNSCOPED_SOURCE',
			taskStableKey: null,
			taskKey: null,
			sourcePath,
			sourcePathBefore: sourcePath,
			sourcePathAfter: sourcePath,
			taskSourceRefBefore: null,
			taskSourceRefAfter: null,
			sourceRevisionBefore: before,
			sourceRevisionAfter: after,
			taskBefore: null,
			taskAfter: null,
			fromWorkboardRevision: previousRevision,
			toWorkboardRevision: nextRevision,
			classification: 'OBSERVATION_ONLY_RECONCILIATION_REQUEST',
			writesPerformed: false,
		}));
	}

	const previousTasks = new Map(previous.taskInventory.map((task) => [task.stableKey, task]));
	const nextTasks = new Map(next.taskInventory.map((task) => [task.stableKey, task]));
	const taskKeys = [...new Set([...previousTasks.keys(), ...nextTasks.keys()])].sort();
	for (const stableKey of taskKeys) {
		const before = previousTasks.get(stableKey);
		const after = nextTasks.get(stableKey);
		if (before && after
			&& before.taskKey === after.taskKey
			&& before.change === after.change
			&& before.source === after.source
			&& before.line === after.line
			&& before.blockHash === after.blockHash
			&& before.state === after.state
			&& before.executionState === after.executionState) continue;
		const sourcePathBefore = before?.source ?? null;
		const sourcePathAfter = after?.source ?? null;
		const sourcePath = sourcePathAfter ?? sourcePathBefore;
		if (!sourcePath) continue;
		events.push(eventFromPayload({
			kind: !before ? 'TASK_ADDED' : !after ? 'TASK_REMOVED' : 'TASK_CHANGED',
			changeId: (after ?? before)!.change,
			taskStableKey: stableKey,
			taskKey: (after ?? before)!.taskKey,
			sourcePath,
			sourcePathBefore,
			sourcePathAfter,
			taskSourceRefBefore: before ? `${before.source}#L${before.line}` : null,
			taskSourceRefAfter: after ? `${after.source}#L${after.line}` : null,
			sourceRevisionBefore: sourcePathBefore ? previous.sourceFileHashes[sourcePathBefore] ?? null : null,
			sourceRevisionAfter: sourcePathAfter ? next.sourceFileHashes[sourcePathAfter] ?? null : null,
			taskBefore: taskState(before),
			taskAfter: taskState(after),
			fromWorkboardRevision: previousRevision,
			toWorkboardRevision: nextRevision,
			classification: 'OBSERVATION_ONLY_RECONCILIATION_REQUEST',
			writesPerformed: false,
		}));
	}

	return events.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)
		|| (left.taskStableKey ?? '').localeCompare(right.taskStableKey ?? '')
		|| left.kind.localeCompare(right.kind));
}
