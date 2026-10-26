import { describe, expect, it } from 'vitest';
import {
	diffOpenSpecTaskSnapshotsV1,
	resolveOpenSpecTaskObservationIdentityV1,
} from './task-transition-events-v1.js';
import { OpenSpecWorkboardTaskV1Schema } from './workboard-contract-v1.js';

const task = OpenSpecWorkboardTaskV1Schema.parse({
	taskKey: 'sample-change:1',
	change: 'sample-change',
	source: 'openspec/changes/sample-change/tasks.md',
	line: 1,
	text: 'Sample task',
	state: 'OPEN',
	kind: 'WORK_ITEM',
	executionState: 'ACTIONABLE',
	declaredSourceRef: null,
	declaredSourceRevision: null,
	priority: 50,
	lastUpdatedAt: '2026-10-13T00:00:00.000Z',
	timestampMethod: 'FILESYSTEM_MTIME',
	blockHash: `sha256:${'a'.repeat(64)}`,
	stableKey: 'sample-change#stable',
	logicalTaskKey: null,
	taskIdentity: {
		logicalTaskKey: null,
		taskRevision: `sha256:${'a'.repeat(64)}`,
		sourceLine: 1,
		migrationKey: 'sample-change#stable',
		basis: 'MIGRATION_TITLE_HASH',
	},
	eta: { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' },
});

const snapshot = (overrides: Record<string, unknown> = {}) => ({
	schema: 'atlas.openspec.workboard.v1',
	taskInventory: [task],
	sourceFileHashes: { [task.source]: `sha256:${'b'.repeat(64)}` },
	...overrides,
});

describe('OpenSpec observation event diff', () => {
	it('emits deterministic observation events for a source and task change', () => {
		const changedTask = { ...task, state: 'DONE', executionState: 'DONE', blockHash: `sha256:${'c'.repeat(64)}` };
		const next = snapshot({
			taskInventory: [changedTask],
			sourceFileHashes: { [task.source]: `sha256:${'d'.repeat(64)}` },
		});
		const first = diffOpenSpecTaskSnapshotsV1({ previous: snapshot(), next });
		const replay = diffOpenSpecTaskSnapshotsV1({ previous: snapshot(), next });
		expect(first).toEqual(replay);
		expect(first.map((event) => event.kind).sort()).toEqual(['SOURCE_FILE_CHANGED', 'TASK_CHANGED']);
		expect(first.every((event) => event.writesPerformed === false)).toBe(true);
		expect(first.every((event) => event.classification === 'OBSERVATION_ONLY_RECONCILIATION_REQUEST')).toBe(true);
		expect(first.every((event) => event.evidenceRefs.length === 0)).toBe(true);
	});

	it('emits no events for an unchanged source snapshot', () => {
		expect(diffOpenSpecTaskSnapshotsV1({ previous: snapshot(), next: snapshot() })).toEqual([]);
	});

	it('emits a task change when state changes without a block-hash change', () => {
		const nextTask = { ...task, state: 'DONE', executionState: 'DONE' };
		const events = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [nextTask] }),
		});
		const transition = events.find((event) => event.kind === 'TASK_CHANGED');

		expect(events).toHaveLength(1);
		expect(transition?.taskBefore).toEqual({
			state: 'OPEN',
			executionState: 'ACTIONABLE',
			blockHash: task.blockHash,
		});
		expect(transition?.taskAfter).toEqual({
			state: 'DONE',
			executionState: 'DONE',
			blockHash: task.blockHash,
		});
	});

	it('emits a task change when its task key changes without a block-hash change', () => {
		const nextTask = { ...task, taskKey: 'sample-change:renamed' };
		const events = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [nextTask] }),
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: 'TASK_CHANGED',
			taskStableKey: task.stableKey,
			taskKey: 'sample-change:renamed',
		});
	});

	it('binds moved tasks to their before and after source revisions', () => {
		const movedTask = {
			...task,
			source: 'openspec/changes/other-change/tasks.md',
			change: 'other-change',
			line: 12,
		};
		const next = snapshot({
			taskInventory: [movedTask],
			sourceFileHashes: {
				[task.source]: `sha256:${'b'.repeat(64)}`,
				[movedTask.source]: `sha256:${'c'.repeat(64)}`,
			},
		});
		const events = diffOpenSpecTaskSnapshotsV1({ previous: snapshot(), next });
		const transition = events.find((event) => event.kind === 'TASK_CHANGED');

		expect(transition).toMatchObject({
			sourcePathBefore: task.source,
			sourcePathAfter: movedTask.source,
			taskSourceRefBefore: `${task.source}#L1`,
			taskSourceRefAfter: `${movedTask.source}#L12`,
			sourceRevisionBefore: `sha256:${'b'.repeat(64)}`,
			sourceRevisionAfter: `sha256:${'c'.repeat(64)}`,
		});
	});

	it('resolves only an exact current task and source revision to canonicalTaskRef', () => {
		const nextTask = { ...task, state: 'DONE', executionState: 'DONE' };
		const event = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [nextTask] }),
		}).find((item) => item.kind === 'TASK_CHANGED');
		const resolution = resolveOpenSpecTaskObservationIdentityV1(event, {
			schema: 'atlas.openspec-evidence-portfolio-census.v2',
			source: { workspaceRevision: `sha256:${'d'.repeat(64)}` },
			tasks: [{
				taskRef: `${task.source}#L${task.line}`,
				changeId: task.change,
				canonicalTaskRef: 'openspec-task:openspec://root/sample-change/KAFKA-01',
				taskHash: task.blockHash,
				sourceFileRevision: `sha256:${'b'.repeat(64)}`,
				taskIdStatus: 'DECLARED_ID',
			}],
		});

		expect(resolution).toMatchObject({
			status: 'BOUND_TO_CURRENT_TASK',
			canonicalTaskRef: 'openspec-task:openspec://root/sample-change/KAFKA-01',
			canonicalAuthority: false,
			dispatchAuthorized: false,
			writesPerformed: false,
		});
		expect(resolution.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('rejects stale source revisions and ambiguous canonical task identities', () => {
		const nextTask = { ...task, state: 'DONE', executionState: 'DONE' };
		const event = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [nextTask] }),
		}).find((item) => item.kind === 'TASK_CHANGED');
		const census = (taskStatus: string, sourceRevision: string) => ({
			schema: 'atlas.openspec-evidence-portfolio-census.v2',
			source: { workspaceRevision: `sha256:${'d'.repeat(64)}` },
			tasks: [{
				taskRef: `${task.source}#L${task.line}`,
				changeId: task.change,
				canonicalTaskRef: 'openspec-task:openspec://root/sample-change/KAFKA-01',
				taskHash: task.blockHash,
				sourceFileRevision: sourceRevision,
				taskIdStatus: taskStatus,
			}],
		});

		expect(resolveOpenSpecTaskObservationIdentityV1(event, census('DECLARED_ID', `sha256:${'e'.repeat(64)}`)).status)
			.toBe('SOURCE_REVISION_MISMATCH');
		expect(resolveOpenSpecTaskObservationIdentityV1(event, census('AMBIGUOUS', `sha256:${'b'.repeat(64)}`)).status)
			.toBe('TASK_IDENTITY_AMBIGUOUS');
	});

	it('does not let a declared task ID mask ambiguous nested identity', () => {
		const nextTask = { ...task, state: 'DONE', executionState: 'DONE' };
		const event = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [nextTask] }),
		}).find((item) => item.kind === 'TASK_CHANGED');
		const result = resolveOpenSpecTaskObservationIdentityV1(event, {
			schema: 'atlas.openspec-evidence-portfolio-census.v2',
			source: { workspaceRevision: `sha256:${'d'.repeat(64)}` },
			tasks: [{
				taskRef: `${task.source}#L${task.line}`,
				changeId: task.change,
				canonicalTaskRef: 'openspec-task:openspec://root/sample-change/KAFKA-01',
				taskHash: task.blockHash,
				sourceFileRevision: `sha256:${'b'.repeat(64)}`,
				taskIdStatus: 'DECLARED_ID',
				taskIdentity: { identityState: 'AMBIGUOUS' },
			}],
		});

		expect(result.status).toBe('TASK_IDENTITY_AMBIGUOUS');
	});

	it('rejects a changed event payload when its hashes were not recomputed', () => {
		const nextTask = { ...task, state: 'DONE', executionState: 'DONE' };
		const event = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [nextTask] }),
		}).find((item) => item.kind === 'TASK_CHANGED');
		const result = resolveOpenSpecTaskObservationIdentityV1({ ...event, changeId: 'different-change' }, {
			schema: 'atlas.openspec-evidence-portfolio-census.v2',
			source: { workspaceRevision: `sha256:${'d'.repeat(64)}` },
			tasks: [{
				taskRef: `${task.source}#L${task.line}`,
				changeId: task.change,
				canonicalTaskRef: 'openspec-task:openspec://root/sample-change/KAFKA-01',
				taskHash: task.blockHash,
				sourceFileRevision: `sha256:${'b'.repeat(64)}`,
				taskIdStatus: 'DECLARED_ID',
			}],
		});

		expect(result.status).toBe('EVENT_CHECKSUM_MISMATCH');
	});

	it('rejects an event whose declared change ID conflicts with the exact task source', () => {
		const changedTask = { ...task, change: 'different-change', state: 'DONE', executionState: 'DONE' };
		const event = diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [changedTask] }),
		}).find((item) => item.kind === 'TASK_CHANGED');
		const result = resolveOpenSpecTaskObservationIdentityV1(event, {
			schema: 'atlas.openspec-evidence-portfolio-census.v2',
			source: { workspaceRevision: `sha256:${'d'.repeat(64)}` },
			tasks: [{
				taskRef: `${task.source}#L${task.line}`,
				changeId: task.change,
				canonicalTaskRef: 'openspec-task:openspec://root/sample-change/KAFKA-01',
				taskHash: task.blockHash,
				sourceFileRevision: `sha256:${'b'.repeat(64)}`,
				taskIdStatus: 'DECLARED_ID',
			}],
		});

		expect(result.status).toBe('TASK_CHANGE_ID_MISMATCH');
	});

	it('rejects missing or malformed source revisions instead of inventing them', () => {
		expect(() => diffOpenSpecTaskSnapshotsV1({ previous: snapshot(), next: snapshot({ sourceFileHashes: {} }) })).toThrow();
		expect(() => diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ sourceFileHashes: { [task.source]: 'latest' } }),
		})).toThrow();
	});

	it('rejects duplicate stable task identities instead of collapsing snapshot rows', () => {
		const duplicate = { ...task, taskKey: 'sample-change:2' };
		expect(() => diffOpenSpecTaskSnapshotsV1({
			previous: snapshot(),
			next: snapshot({ taskInventory: [task, duplicate] }),
		})).toThrow(/DUPLICATE_TASK_STABLE_KEY/);
	});

	it('distinguishes removed tasks from completion', () => {
		const events = diffOpenSpecTaskSnapshotsV1({ previous: snapshot(), next: snapshot({ taskInventory: [] }) });
		const removed = events.find((event) => event.kind === 'TASK_REMOVED');
		expect(removed?.taskAfter).toBeNull();
		expect(removed?.taskBefore?.state).toBe('OPEN');
	});
});
