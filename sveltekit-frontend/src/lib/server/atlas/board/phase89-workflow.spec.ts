import { describe, expect, it } from 'vitest';
import {
	buildPhase89WorkflowPlan,
	recordPhase89WorkflowPlan,
} from './phase89-workflow.js';

describe('phase89 board workflow', () => {
	it('builds a board-backed validation plan from a task id', () => {
		const board = {
			generated: '2026-07-23T00:00:00.000Z',
			collection: 'codebase_chunks_384_hybrid',
			recommendationPromotion: {
				proposalCount: 4,
				promotedCount: 2,
				reviewRequiredCount: 1,
			},
			columns: [
				{
					id: 'P1',
					label: 'Priority 1',
					tasks: [
						{
							id: 'rank_signals',
							priority: 'P1',
							label: 'Audit and persist RRF ranking signal coverage',
							script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage rank_signals',
							gate: 'All ranking gates PASS',
							blockedBy: ['index_bm25'],
						},
					],
				},
			],
			warnings: [],
		};

		const plan = buildPhase89WorkflowPlan(board, {
			taskId: 'rank_signals',
			dryRun: true,
		});

		expect(plan.taskId).toBe('rank_signals');
		expect(plan.validationRoutes).toContain('/admin/ai-dashboard');
		expect(plan.validationRoutes).toContain('/admin/phase89');
		expect(plan.validationQueueKeys).toContain('playwright-check:/admin/ai-dashboard');
		expect(plan.steps.map((step) => step.action)).toContain('queue:playwright-check');
		expect(plan.steps.map((step) => step.action)).toContain('acp:phase89');
	});

	it('records queued workflow and playwright keys without a live redis dependency', async () => {
		const writes: Array<{ key: string; value: string; ttl: number }> = [];
		const redis = {
			async set(key: string, value: string, _mode: string, ttl: number) {
				writes.push({ key, value, ttl });
				return 'OK';
			},
		};

		const plan = buildPhase89WorkflowPlan(
			{
				generated: '2026-07-23T00:00:00.000Z',
				collection: 'codebase_chunks_384_hybrid',
				recommendationPromotion: {
					proposalCount: 1,
					promotedCount: 1,
					reviewRequiredCount: 0,
				},
				columns: [
					{
						id: 'P2',
						label: 'Priority 2',
						tasks: [
							{
								id: 'index_bm25',
								priority: 'P2',
								label: 'Backfill bm25_text in payload for BM25 search lane',
								script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage index_bm25',
								gate: 'BM25 coverage ≥ 85%',
								blockedBy: ['feature_extract'],
							},
						],
					},
				],
				warnings: ['BOARD_LEDGER_UNAVAILABLE'],
			},
			{ taskId: 'index_bm25', dryRun: false },
		);

		const result = await recordPhase89WorkflowPlan(plan, redis as any);

		expect(result.workflowId).toContain('phase89-board-workflow:index_bm25:');
		expect(result.queuedRoutes).toContain('/admin/ai-dashboard');
		expect(result.queuedRoutes).toContain('/admin/phase89');
		expect(writes.some((entry) => entry.key.startsWith('phase89:workflow:'))).toBe(true);
		expect(writes.filter((entry) => entry.key.startsWith('playwright-check:'))).toHaveLength(2);
		expect(writes.every((entry) => entry.ttl > 0)).toBe(true);
	});
});
