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
});
