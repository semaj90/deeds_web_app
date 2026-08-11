import { describe, expect, it } from 'vitest';

import { buildBoardFabricLaneManifest } from './fabric-lane-manifest.js';

describe('board fabric lane manifest', () => {
	it('binds kanban workflow context to a semantic_768 fabric manifest', () => {
		const manifest = buildBoardFabricLaneManifest({
			context: {
				workflowId: 'phase89-board-workflow:rank_signals:123',
				collection: 'kanban-board:daily-graphify',
				taskId: 'rank_signals',
				taskLabel: 'Audit and persist RRF ranking signal coverage',
				recommendationId: 'rec:rank-signals',
				sourceRef: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
				treeNodeId: 'tree:rrf:combineViaRRF',
			},
			packetKey: 'packet-abc',
			sourceRevision: 'source@rev-1',
			representationRevision: 'semantic@rev-7',
			producerId: 'atlas-phase89',
			producerRevision: 'phase89@rev-2',
			laneKinds: ['kanban_task_board', 'recommendation_policy', 'exact_knn_retrieval'],
			evidenceRefs: ['evidence:1', 'evidence:2'],
			graphRevision: 'graph@rev-4',
			telemetryRevision: 'telemetry@rev-3',
			toolPolicyRevision: 'tool-policy@rev-1',
		});

		expect(manifest.packetKey).toBe('packet-abc');
		expect(manifest.sourceRef).toBe('sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts');
		expect(manifest.representationId).toBe('semantic_768');
		expect(manifest.kanbanTaskBoard).toBe('kanban-board:daily-graphify');
		expect(manifest.taskIds).toEqual(['rank_signals']);
		expect(manifest.recommendationIds).toEqual(['rec:rank-signals']);
		expect(manifest.laneKinds).toEqual(['exact_knn_retrieval', 'kanban_task_board', 'recommendation_policy']);
		expect(manifest.notes).toContain('phase89-board-workflow:rank_signals:123');
	});
});
