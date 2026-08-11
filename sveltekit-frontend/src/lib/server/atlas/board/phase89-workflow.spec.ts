import { describe, expect, it } from 'vitest';
import { buildBoardFabricLaneManifest } from './fabric-lane-manifest.js';
import { buildBoardGpuBenchmarkReceipt } from './fabric-gpu-benchmark.js';
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
							title_id: 'combineViaRRF',
							packet_key: 'packet:rrf-rank-signals',
							priority: 'P1',
							label: 'Audit and persist RRF ranking signal coverage',
							script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage rank_signals',
							gate: 'All ranking gates PASS',
							blockedBy: ['index_bm25'],
              recommendation_id: 'rec:rank-signals',
              source_ref: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
              tree_node_id: 'tree:sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts:combineViaRRF',
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
		expect(plan.recommendationId).toBe('rec:rank-signals');
		expect(plan.sourceRef).toBe('sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts');
		expect(plan.titleId).toBe('combineViaRRF');
		expect(plan.treeNodeId).toContain('combineViaRRF');
		expect(plan.packetKey).toBe('packet:rrf-rank-signals');
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
				title_id: 'index_bm25_title',
				packet_key: 'packet:index-bm25',
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
		expect(JSON.parse(writes[0]?.value ?? '{}')).toMatchObject({
			recommendationId: null,
			sourceRef: null,
			treeNodeId: null,
		});
	});

	it('persists an attached fabric lane manifest when provided', async () => {
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
						id: 'P1',
						label: 'Priority 1',
						tasks: [
						{
							id: 'rank_signals',
							title_id: 'combineViaRRF',
							packet_key: 'packet:rrf-rank-signals',
							priority: 'P1',
								label: 'Audit and persist RRF ranking signal coverage',
								script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage rank_signals',
								gate: 'All ranking gates PASS',
								recommendation_id: 'rec:rank-signals',
								source_ref: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
								tree_node_id: 'tree:rrf:combineViaRRF',
							},
						],
					},
				],
				warnings: [],
			},
			{ taskId: 'rank_signals', dryRun: false },
		);

		const fabricLaneManifest = buildBoardFabricLaneManifest({
			context: {
				workflowId: plan.workflowId,
				collection: 'codebase_chunks_384_hybrid',
				taskId: plan.taskId,
				taskLabel: plan.taskLabel,
				recommendationId: plan.recommendationId,
				sourceRef: plan.sourceRef,
				treeNodeId: plan.treeNodeId,
			},
			packetKey: 'packet:rrf-rank-signals',
			sourceRevision: 'source@rev-1',
			representationRevision: 'semantic@rev-7',
			producerId: 'atlas-phase89',
			producerRevision: 'phase89@rev-2',
			laneKinds: ['kanban_task_board', 'recommendation_policy', 'exact_knn_retrieval'],
			evidenceRefs: ['evidence:rrf'],
		});
		const gpuBenchmarkReceipt = buildBoardGpuBenchmarkReceipt({
			board: {
				generated: '2026-07-23T00:00:00.000Z',
				collection: 'codebase_chunks_384_hybrid',
				recommendationPromotion: {
					proposalCount: 1,
					promotedCount: 1,
					reviewRequiredCount: 0,
				},
				columns: [
					{
						id: 'P1',
						label: 'Priority 1',
						tasks: [
							{
								id: 'rank_signals',
								title_id: 'combineViaRRF',
								packet_key: 'packet:rrf-rank-signals',
								priority: 'P1',
								label: 'Audit and persist RRF ranking signal coverage',
								script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage rank_signals',
								gate: 'All ranking gates PASS',
								recommendation_id: 'rec:rank-signals',
								source_ref: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
								tree_node_id: 'tree:rrf:combineViaRRF',
								evidence_refs: ['evidence:rrf-1'],
								reason_codes: ['RRF_BASELINE'],
							},
						],
					},
				],
				warnings: [],
			},
			plan,
			fabricLaneManifest,
		});

		const result = await recordPhase89WorkflowPlan(
			plan,
			redis as any,
			fabricLaneManifest,
			gpuBenchmarkReceipt,
		);

		expect(result.workflowId).toContain('phase89-board-workflow:rank_signals:');
		expect(writes.some((entry) => entry.key.startsWith('phase89:workflow:'))).toBe(true);
		expect(JSON.parse(writes[0]?.value ?? '{}')).toMatchObject({
			fabricLaneManifest: {
				packetKey: 'packet:rrf-rank-signals',
				representationId: 'semantic_768',
				kanbanTaskBoard: 'codebase_chunks_384_hybrid',
			},
			gpuBenchmarkReceipt: {
				schemaVersion: 'atlas.board-fabric-gpu-benchmark.v1',
				cuvsRequest: {
					representationId: 'semantic_768',
					packetKeys: ['packet:rrf-rank-signals'],
				},
			},
		});
	});

	it('replays a full board identity triad into the manifest when all structural fields exist', () => {
		const board = {
			generated: '2026-07-23T00:00:00.000Z',
			collection: 'codebase_chunks_384_hybrid',
			recommendationPromotion: {
				proposalCount: 1,
				promotedCount: 1,
				reviewRequiredCount: 0,
			},
			columns: [
				{
					id: 'P1',
					label: 'Priority 1',
					tasks: [
						{
							id: 'rank_signals',
							title_id: 'combineViaRRF',
							packet_key: 'packet:rrf-rank-signals',
							priority: 'P1',
							label: 'Audit and persist RRF ranking signal coverage',
							script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage rank_signals',
							gate: 'All ranking gates PASS',
							blockedBy: ['index_bm25'],
							recommendation_id: 'rec:rank-signals',
							source_ref: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
							tree_node_id: 'tree:rrf:combineViaRRF',
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
		const manifest = buildBoardFabricLaneManifest({
			context: {
				workflowId: plan.workflowId,
				collection: board.collection,
				taskId: plan.taskId,
				taskLabel: plan.taskLabel,
				recommendationId: plan.recommendationId,
				sourceRef: plan.sourceRef,
				treeNodeId: plan.treeNodeId,
			},
			packetKey: plan.packetKey ?? 'missing',
			sourceRevision: board.generated,
			representationRevision: 'semantic_768',
			producerId: 'atlas-phase89-board-workflow',
			producerRevision: board.generated,
			laneKinds: ['kanban_task_board', 'recommendation_policy', 'exact_knn_retrieval'],
			evidenceRefs: ['evidence:rrf'],
		});

		expect(plan.titleId).toBe('combineViaRRF');
		expect(plan.packetKey).toBe('packet:rrf-rank-signals');
		expect(manifest.packetKey).toBe('packet:rrf-rank-signals');
		expect(manifest.sourceRef).toBe('sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts');
		expect(manifest.kanbanTaskBoard).toBe('codebase_chunks_384_hybrid');
	});
});
