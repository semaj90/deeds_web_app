import { describe, expect, it } from 'vitest';
import { rankDailyGraphifyBoardTasks } from './daily-graphify-task-priority.js';
import type { DailyGraphifyBoardData } from './daily-graphify-board.js';

function board(tasks: Array<{
	id: string;
	priority: 'P0' | 'P1' | 'P2' | 'P3';
	status?: string;
	blockedBy?: string[];
	source_ref?: string | null;
}>): DailyGraphifyBoardData {
	return {
		generated: '2026-10-19T00:00:00.000Z',
		collection: 'test',
		boardSource: 'fixture',
		recommendationSource: 'fixture',
		workflowState: null,
		recommendationPromotion: { proposalCount: 0, promotedCount: 0, reviewRequiredCount: 0 },
		columns: [{
			id: 'all',
			label: 'All',
			tasks: tasks.map((task) => ({
				...task,
				label: task.id,
				evidence_refs: [],
				reason_codes: [],
			})),
		}],
		promotedRecommendations: [],
		reviewRequiredRecommendations: [],
		temporalRecommendations: [],
		workflowDag: [],
		warnings: [],
	};
}

describe('daily Graphify task priority projection', () => {
	it('uses only declared P0-P3 priority and stable task-id ties', () => {
		const ranked = rankDailyGraphifyBoardTasks(board([
			{ id: 'z-p1', priority: 'P1' },
			{ id: 'p0', priority: 'P0' },
			{ id: 'a-p1', priority: 'P1' },
			{ id: 'p3', priority: 'P3' },
		]));

		expect(ranked.map(({ taskId, priorityScore }) => [taskId, priorityScore])).toEqual([
			['p0', 100], ['a-p1', 75], ['z-p1', 75], ['p3', 25],
		]);
	});

	it('preserves blocked and source metadata without changing actionability', () => {
		const [row] = rankDailyGraphifyBoardTasks(board([
			{ id: 'blocked', priority: 'P0', status: 'PROPOSED', blockedBy: ['gate-a'], source_ref: 'openspec/change/tasks.md#L12' },
		]));

		expect(row).toMatchObject({
			rank: 1,
			priorityScore: 100,
			status: 'PROPOSED',
			blockedBy: ['gate-a'],
			sourceRef: 'openspec/change/tasks.md#L12',
		});
	});

	it('returns deterministic Top 10 and Top 100 slices bounded by available tasks', () => {
		const ranked = rankDailyGraphifyBoardTasks(board(Array.from({ length: 14 }, (_, index) => ({
			id: `task-${String(index).padStart(2, '0')}`,
			priority: index < 4 ? 'P0' as const : 'P1' as const,
		}))));

		expect(ranked.slice(0, 10)).toHaveLength(10);
		expect(ranked.slice(0, 100)).toHaveLength(14);
		expect(ranked.slice(0, 10).map((row) => row.rank)).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
	});
});
