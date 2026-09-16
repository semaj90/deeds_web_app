import { describe, expect, it } from 'vitest';

import {
	ATLAS_WORKFLOW_ACTION_SCHEMA,
	fromCanonicalWorkflowActionEvent,
	toCanonicalWorkflowActionEvent,
	WorkflowActionEventSchema,
	type WorkflowActionEventV1,
} from './contracts.js';

/**
 * WORKFLOW-ACTION-SCHEMA-OWNER-01: round-trip test for the compiler-lifecycle
 * adapter added to contracts.ts. Proves the local shape (runId/executor/
 * revisions/inputRefs/outputRefs/errorRef/checksum) converts to and from the
 * canonical `@deeds/parent-atlas/core/workflow-action-event` schema losslessly
 * for every field the compiler actually reads.
 */
function localEvent(overrides: Partial<WorkflowActionEventV1> = {}): WorkflowActionEventV1 {
	return WorkflowActionEventSchema.parse({
		schema: ATLAS_WORKFLOW_ACTION_SCHEMA,
		workflowId: 'wf-compiler-1',
		workflowRevision: 3,
		runId: 'run-abc',
		sequence: 7,
		actionId: 'action-compile-1',
		parentActionId: null,
		dagNodeId: 'node-compile-1',
		attempt: 1,
		lane: 'materializer',
		transport: 'local',
		executor: { family: 'temporal', runtimeId: 'worker-9', runtimeRevision: 'rev-9' },
		kind: 'materialized',
		revisions: { workspace: 'ws-1', graph: 'graph-1', feature: 'feat-1', representation: 'repr-1' },
		inputRefs: ['input-1'],
		outputRefs: ['output-1'],
		evidenceRefs: ['evidence-1'],
		errorRef: null,
		emittedAt: '2026-09-14T00:00:00.000Z',
		producerRevision: 'producer-rev-1',
		checksum: 'a'.repeat(40),
		...overrides,
	});
}

describe('agentic-file-compiler contracts.ts -- canonical workflow-action adapter', () => {
	it('round-trips every field the compiler actually reads', () => {
		const local = localEvent();
		const canonical = toCanonicalWorkflowActionEvent(local);

		expect(canonical.schema).toBe('atlas.workflow-action.v1');
		expect(canonical.runId).toBe(local.runId);
		expect(canonical.executor).toEqual(local.executor);
		expect(canonical.revisions).toEqual(local.revisions);
		expect(canonical.inputRefs).toEqual(local.inputRefs);
		expect(canonical.outputRefs).toEqual(local.outputRefs);
		expect(canonical.checksum).toBe(local.checksum);
		expect(canonical.kind).toBe('materialized');

		const roundTripped = fromCanonicalWorkflowActionEvent(canonical, {
			runId: local.runId,
			revisions: local.revisions,
			emittedAt: local.emittedAt,
			checksum: local.checksum,
		});

		expect(roundTripped.workflowId).toBe(local.workflowId);
		expect(roundTripped.workflowRevision).toBe(local.workflowRevision);
		expect(roundTripped.runId).toBe(local.runId);
		expect(roundTripped.sequence).toBe(local.sequence);
		expect(roundTripped.actionId).toBe(local.actionId);
		expect(roundTripped.dagNodeId).toBe(local.dagNodeId);
		expect(roundTripped.attempt).toBe(local.attempt);
		expect(roundTripped.lane).toBe(local.lane);
		expect(roundTripped.executor).toEqual(local.executor);
		expect(roundTripped.kind).toBe(local.kind);
		expect(roundTripped.revisions).toEqual(local.revisions);
		expect(roundTripped.inputRefs).toEqual(local.inputRefs);
		expect(roundTripped.outputRefs).toEqual(local.outputRefs);
		expect(roundTripped.evidenceRefs).toEqual(local.evidenceRefs);
		expect(roundTripped.producerRevision).toBe(local.producerRevision);
		expect(roundTripped.checksum).toBe(local.checksum);
	});

	it('throws rather than silently drop a canonical-only kind this local shape cannot represent', () => {
		// The local compiler shape's kind enum already includes suspended/resumed/validated/
		// materialized -- construct a canonical value with a kind genuinely absent from it instead
		// (none exist today since the canonical enum is now a strict superset of this file's own,
		// so this test documents the guard exists even though it is currently unreachable via any
		// real canonical producer -- proves the guard code path itself, not a live gap).
		const canonical = toCanonicalWorkflowActionEvent(localEvent());
		const unrepresentable = { ...canonical, kind: 'not-a-real-kind' as never };
		expect(() =>
			fromCanonicalWorkflowActionEvent(unrepresentable, {
				runId: 'run-abc',
				revisions: { workspace: 'ws-1' },
				emittedAt: '2026-09-14T00:00:00.000Z',
				checksum: 'b'.repeat(40),
			}),
		).toThrow(/WORKFLOW_ACTION_EVENT_KIND_NOT_REPRESENTABLE_IN_COMPILER_SHAPE/);
	});
});
