import { describe, expect, it } from 'vitest';

import { WorkflowActionEventSchema, type WorkflowActionEventV1 } from './contracts.js';
import {
	workflowEventToActionWriterRequest,
	workflowEventToCanonicalActionWriterRequest,
} from './workflow-action-event-adapter.js';

function event(overrides: Partial<WorkflowActionEventV1> = {}): WorkflowActionEventV1 {
	return WorkflowActionEventSchema.parse({
		schema: 'atlas.workflow-action.v1',
		workflowId: 'workflow:compiler',
		workflowRevision: 4,
		runId: 'run-compiler-1',
		sequence: 2,
		actionId: 'action-compiler-1',
		parentActionId: 'action-parent-1',
		dagNodeId: 'validate',
		attempt: 1,
		lane: 'materializer',
		transport: 'local',
		executor: { family: 'local', runtimeId: 'worker-1', runtimeRevision: 'runtime-1' },
		kind: 'validated',
		revisions: { workspace: 'workspace-1', graph: 'graph-1', feature: 'feature-1', representation: 'representation-1' },
		inputRefs: ['input-1'],
		outputRefs: ['output-1'],
		evidenceRefs: ['evidence-1'],
		errorRef: null,
		emittedAt: '2026-09-18T00:00:00.000Z',
		producerRevision: 'compiler-adapter-v1',
		checksum: 'a'.repeat(40),
		...overrides,
	});
}

describe('workflow action event adapter', () => {
	it('maps the compiler event into the existing action-writer request', () => {
		const input = event();
		const result = workflowEventToActionWriterRequest(input, {
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			permissionScope: ['workflow:read'],
			riskLevel: 2,
		});

		expect(result).toMatchObject({
			workflowName: 'workflow:compiler',
			workflowVersion: '4',
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			actionType: 'atlas.workflow.validated',
			permissionScope: ['workflow:read'],
			riskLevel: 2,
			causationId: 'action-parent-1',
		});
		expect(result.inputPacket).toEqual(input);
		expect(result.idempotencyKey).toBe('workflow:compiler:4:run-compiler-1:validate:1:validated');
	});

	it('preserves caller-owned permissions without mutating the source array', () => {
		const permissionScope = ['workflow:read'];
		const result = workflowEventToActionWriterRequest(event({ parentActionId: null }), {
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			permissionScope,
		});

		result.permissionScope.push('workflow:write');
		expect(permissionScope).toEqual(['workflow:read']);
		expect(result.causationId).toBeUndefined();
		expect(result.riskLevel).toBeUndefined();
	});

	it('changes the idempotency key when the attempt or event kind changes', () => {
		const first = workflowEventToActionWriterRequest(event(), {
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			permissionScope: [],
		});
		const retry = workflowEventToActionWriterRequest(event({ attempt: 2, kind: 'retrying' }), {
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			permissionScope: [],
		});

		expect(retry.idempotencyKey).not.toBe(first.idempotencyKey);
	});

	it('converts supported lifecycle events into the canonical writer shape', () => {
		const result = workflowEventToCanonicalActionWriterRequest(event({ kind: 'started' }), {
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			permissionScope: ['workflow:write'],
		});

		expect(result.event).toMatchObject({
			schema: 'atlas.workflow-action.v1',
			workflowId: 'workflow:compiler',
			kind: 'started',
			evidenceRefs: ['evidence-1'],
		});
		expect(result.event).not.toHaveProperty('inputRefs');
		expect(result.event).not.toHaveProperty('checksum');
		expect(result.actionType).toBe('atlas.workflow.started');
	});

	it('rejects compiler-only lifecycle kinds instead of relabeling them', () => {
		expect(() => workflowEventToCanonicalActionWriterRequest(event({ kind: 'validated' }), {
			tenantId: 'tenant-1',
			initiatedBy: 'agent-1',
			permissionScope: [],
		})).toThrow("WORKFLOW_ACTION_EVENT_KIND_NOT_CANONICAL_PERSISTENCE: 'validated'");
	});
});
