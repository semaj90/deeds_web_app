// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client', () => ({
	pool: {
		query: mockQuery,
	},
}));

import { evaluateExecution, reviewAndSaveExecution } from '$lib/server/agent/execution-review.js';

describe('execution-review', () => {
	beforeEach(() => {
		mockQuery.mockReset();
	});

	it('promotes a matched, completed execution with evidence to continue', async () => {
		const createdAt = new Date('2026-07-10T12:00:00Z');

		mockQuery
			.mockResolvedValueOnce({
				rows: [
					{
						id: 'event-1',
						trace_id: 'trace-1',
						execution_id: 'exec-1',
						tool_name: 'rg.search',
						tool_namespace: 'search',
						arguments: { query: 'find missing contract' },
						status: 'completed',
						start_time: createdAt,
						end_time: new Date('2026-07-10T12:00:01Z'),
						duration_ms: 1000,
						result_class: 'candidates',
						result_count: 3,
						source_ref_count: 2,
						source_refs: ['src/a.ts', 'src/b.ts'],
						error_message: null,
						from_server: false,
						event_json: { summary: 'ok' },
						created_at: createdAt,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: 'proposal-1',
						trace_id: 'trace-1',
						decision_id: 'decision-1',
						query: 'find missing contract',
						previous_state: 'RETRIEVE',
						selected_tool_name: 'rg.search',
						selected_tool_namespace: 'search',
						candidate_tools: ['rg.search', 'qdrant.search'],
						confidence_score: 0.92,
						approval_required: false,
						created_at: createdAt,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: 'outcome-1',
						trace_id: 'trace-1',
						previous_state: 'RETRIEVE',
						next_state: 'CONTINUE',
						tool_name: 'rg.search',
						execution_id: 'exec-1',
						result_class: 'candidates',
						recovery_attempted: false,
						final_state: 'CONTINUE',
						final_outcome: 'success',
						total_duration_ms: 1000,
						created_at: createdAt,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [],
			});

		const review = await evaluateExecution('exec-1');

		expect(review.decision).toBe('continue');
		expect(review.proposalMatched).toBe(true);
		expect(review.toolExecuted).toBe(true);
		expect(review.exitCodeValid).toBe(true);
		expect(review.evidenceComplete).toBe(true);
		expect(review.issues).toEqual([]);
		expect(review.evidenceRefs).toEqual(
			expect.arrayContaining(['source refs: src/a.ts, src/b.ts', 'result class: candidates'])
		);
	});

	it('flags a mismatched tool as repair', async () => {
		const createdAt = new Date('2026-07-10T12:00:00Z');

		mockQuery
			.mockResolvedValueOnce({
				rows: [
					{
						id: 'event-1',
						trace_id: 'trace-1',
						execution_id: 'exec-2',
						tool_name: 'qdrant.search',
						tool_namespace: 'search',
						arguments: {},
						status: 'completed',
						start_time: createdAt,
						end_time: createdAt,
						duration_ms: 1,
						result_class: 'candidates',
						result_count: 1,
						source_ref_count: 1,
						source_refs: ['src/a.ts'],
						error_message: null,
						from_server: false,
						event_json: {},
						created_at: createdAt,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: 'proposal-1',
						trace_id: 'trace-1',
						decision_id: 'decision-1',
						query: 'find missing contract',
						previous_state: 'RETRIEVE',
						selected_tool_name: 'rg.search',
						selected_tool_namespace: 'search',
						candidate_tools: ['rg.search', 'qdrant.search'],
						confidence_score: 0.92,
						approval_required: false,
						created_at: createdAt,
					},
				],
			})
			.mockResolvedValueOnce({ rows: [] });

		const review = await reviewAndSaveExecution('exec-2');

		expect(review.decision).toBe('repair');
		expect(review.proposalMatched).toBe(false);
		expect(review.issues[0]).toContain('Tool mismatch');
	});
});
