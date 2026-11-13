import { describe, expect, it } from 'vitest';
import type { DailyGraphifyBoardData } from './daily-graphify-board.js';
import { buildAgenticErrorFixLane } from './agentic-error-fix-lane.js';

function board(): DailyGraphifyBoardData {
	return {
		generated: '2026-10-30T00:00:00.000Z',
		collection: 'fixture',
		boardSource: 'fixture.json',
		recommendationSource: 'fixture',
		workflowState: null,
		recommendationPromotion: { proposalCount: 0, promotedCount: 0, reviewRequiredCount: 0 },
		columns: [{
			id: 'all',
			label: 'All',
			tasks: [
				{ id: 'graph', priority: 'P0', label: 'Graph task', origin: 'daily_graphify' },
				{ id: 'err-z', priority: 'P1', label: 'Error task Z', origin: 'agentic_error_fixing_v1', reason_codes: ['RUNTIME'], evidence_refs: ['report#L2'] },
				{ id: 'err-a', priority: 'P0', label: 'Error task A', origin: 'agentic_error_fixing_v1', status: 'PROPOSED' },
			],
		}],
		promotedRecommendations: [],
		reviewRequiredRecommendations: [],
		temporalRecommendations: [],
		workflowDag: [],
		warnings: [],
	};
}

describe('agentic error-fix lane', () => {
	it('keeps only explicitly sourced error-fix tasks and orders by declared priority', () => {
		expect(buildAgenticErrorFixLane(board()).map((task) => task.id)).toEqual(['err-a', 'err-z']);
	});

	it('preserves evidence and blockers without granting execution authority', () => {
		const [task] = buildAgenticErrorFixLane(board());
		expect(task).toMatchObject({
			id: 'err-a',
			status: 'PROPOSED',
			sourceRef: null,
			evidenceRefs: [],
			blockedBy: [],
		});
		expect(task).not.toHaveProperty('execute');
	});

	it('carries the proposal-only OpenSpec reference through the daily error-fix lane', () => {
		const ref = {
			schema: 'atlas.openspec-workboard-task-ref.v1' as const,
			workboardTaskId: 'change-a:7', stableKey: 'change-a#0123456789abcdef', logicalTaskKey: null,
			taskRevision: `sha256:${'a'.repeat(64)}`, sourceRef: 'openspec/changes/change-a/tasks.md',
			sourceFileSha256: `sha256:${'b'.repeat(64)}`, workboardSnapshotSha256: `sha256:${'c'.repeat(64)}`,
			workboardGeneratedAt: '2026-11-12T08:00:00.000Z', currentHead: 'head-1',
			status: 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK' as const, dispatchRevalidation: 'REQUIRED' as const,
			authority: 'PROPOSAL_REFERENCE_ONLY' as const,
			canonicalAuthority: false as const,
		};
		const fixture = board();
		fixture.columns[0].tasks[1].openspec_task_ref = ref;
		const task = buildAgenticErrorFixLane(fixture).find((candidate) => candidate.id === 'err-z');

		expect(task?.id).toBe('err-z');
		expect(task?.openSpecTaskRef).toEqual(ref);
	});
});
