import { describe, expect, it } from 'vitest';
import { buildBoardFabricLaneManifest } from './fabric-lane-manifest.js';
import { buildBoardGpuBenchmarkReceipt, publishBoardGpuBenchmarkReceipt } from './fabric-gpu-benchmark.js';
import { buildPhase89WorkflowPlan } from './phase89-workflow.js';

describe('board fabric gpu benchmark receipt', () => {
	it('builds a stable cuDF/cuVS-shaped benchmark receipt from the board plan', () => {
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
							recommendation_id: 'rec:rank-signals',
							source_ref: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
							tree_node_id: 'tree:rrf:combineViaRRF',
							evidence_refs: ['evidence:rrf-1', 'evidence:rrf-2'],
							reason_codes: ['RRF_BASELINE', 'GPU_READY'],
						},
					],
				},
			],
			warnings: [],
		};

		const plan = buildPhase89WorkflowPlan(board, { taskId: 'rank_signals', dryRun: true });
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
			packetKey: 'packet:rrf-rank-signals',
			sourceRevision: board.generated,
			representationRevision: 'semantic_768',
			producerId: 'atlas-phase89',
			producerRevision: 'phase89@v1',
			laneKinds: ['kanban_task_board', 'recommendation_policy', 'exact_knn_retrieval', 'ewin_tang_low_rank'],
			evidenceRefs: ['evidence:rrf'],
		});

		const receipt = buildBoardGpuBenchmarkReceipt({
			board,
			plan: { ...plan, packetKey: 'packet:rrf-rank-signals' },
			fabricLaneManifest: manifest,
		});

		expect(receipt.schemaVersion).toBe('atlas.board-fabric-gpu-benchmark.v1');
		expect(receipt.jsonRows).toHaveLength(1);
		expect(receipt.jsonRows[0]?.taskId).toBe('rank_signals');
		expect(receipt.jsonRows[0]?.packetKey).toBe('packet:rrf-rank-signals');
		expect(receipt.cuvsRequest.representationId).toBe('semantic_768');
		expect(receipt.cuvsRequest.packetKeys).toEqual(['packet:rrf-rank-signals']);
		expect(receipt.lowRankFeatureBlock.featureRevision).toBe('atlas.board-fabric-gpu-benchmark.v1');
		expect(receipt.jsonl).toContain('rank_signals');
		expect(receipt.matrix[0]?.length).toBe(6);
	});

	it('publishes the receipt through an injected subject publisher', async () => {
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
							recommendation_id: 'rec:rank-signals',
							source_ref: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
							tree_node_id: 'tree:rrf:combineViaRRF',
						},
					],
				},
			],
			warnings: [],
		};
		const plan = buildPhase89WorkflowPlan(board, { taskId: 'rank_signals', dryRun: true });
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
			packetKey: 'packet:rrf-rank-signals',
			sourceRevision: board.generated,
			representationRevision: 'semantic_768',
			producerId: 'atlas-phase89',
			producerRevision: 'phase89@v1',
			laneKinds: ['kanban_task_board', 'recommendation_policy', 'exact_knn_retrieval'],
		});
		const receipt = buildBoardGpuBenchmarkReceipt({ board, plan: { ...plan, packetKey: 'packet:rrf-rank-signals' }, fabricLaneManifest: manifest });
		const published: Array<{ subject: string; payload: string }> = [];

		const result = await publishBoardGpuBenchmarkReceipt(receipt, {
			subject: 'atlas.board.fabric.gpu-benchmark',
			publisher: {
				publish(subject, payload) {
					published.push({ subject, payload: Buffer.from(payload).toString('utf8') });
				},
			},
		});

		expect(result).toMatchObject({ published: true, subject: 'atlas.board.fabric.gpu-benchmark', transport: 'stub' });
		expect(published).toHaveLength(1);
		expect(JSON.parse(published[0]?.payload ?? '{}')).toMatchObject({
			schemaVersion: 'atlas.board-fabric-gpu-benchmark.v1',
			cuvsRequest: {
				representationId: 'semantic_768',
			},
		});
	});
});
