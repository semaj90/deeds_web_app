import { describe, expect, it } from 'vitest';
import type { WorkflowEvent } from '$lib/client/workflow-event-stream.js';
import { buildWorkflowAgentVisualState, mergeWorkflowAgentVisualState } from './workflow-agent-visual.js';

describe('workflow-agent-visual', () => {
	const sessionId = 'session-123';

	it('builds a stable agent visual state from a workflow event', () => {
		const event: WorkflowEvent = {
			type: 'PIPELINE_STAGE_START',
			sessionId,
			label: 'deep research queued',
			data: { jobId: 'dr-1' },
		};

		const state = buildWorkflowAgentVisualState(event, sessionId);

		expect(state.agentId).toBe('session-123:deep-research-queued');
		expect(state.state).toBe('SEARCHING');
		expect(state.progress).toBeGreaterThanOrEqual(8);
		expect(state.progress).toBeLessThanOrEqual(100);
		expect(state.updatedAtMs).toBeGreaterThan(0);
	});

	it('merges workflow events without duplicating the same visual lane', () => {
		const start: WorkflowEvent = {
			type: 'PIPELINE_STAGE_START',
			sessionId,
			label: 'scan stage',
		};
		const done: WorkflowEvent = {
			type: 'PIPELINE_STAGE_DONE',
			sessionId,
			label: 'scan stage',
		};

		const afterStart = mergeWorkflowAgentVisualState([], start, sessionId);
		const afterDone = mergeWorkflowAgentVisualState(afterStart, done, sessionId);

		expect(afterDone).toHaveLength(1);
		expect(afterDone[0]?.agentId).toBe('session-123:scan-stage');
		expect(afterDone[0]?.state).toBe('ANALYZING');
		expect(afterDone[0]?.progress).toBeGreaterThanOrEqual(afterStart[0]?.progress ?? 0);
	});

	it('keeps supported workflow events in the live visual lane', () => {
		const states = mergeWorkflowAgentVisualState([], { type: 'SSE_CONNECTED', sessionId } as WorkflowEvent, sessionId);
		expect(states).toHaveLength(1);
	});
});
