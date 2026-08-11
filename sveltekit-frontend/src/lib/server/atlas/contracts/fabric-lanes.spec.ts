import { describe, expect, it } from 'vitest';

import { buildFabricLaneManifest, FabricLaneManifestSchema } from './fabric-lanes.js';

describe('fabric lane manifest contract', () => {
	it('deduplicates and sorts lane kinds and evidence receipts deterministically', () => {
		const manifest = buildFabricLaneManifest({
			packetKey: 'packet-123',
			sourceRef: 'src/foo.ts',
			sourceRevision: 'src@rev-1',
			representationId: 'semantic_768',
			representationRevision: 'semantic@rev-7',
			producerId: 'atlas-fabric',
			producerRevision: 'fabric@rev-3',
			featureRevision: 'feature@rev-9',
			graphRevision: 'graph@rev-4',
			telemetryRevision: 'telemetry@rev-2',
			modelRevision: 'model@rev-5',
			toolPolicyRevision: 'policy@rev-1',
			laneKinds: [
				'kanban_task_board',
				'gnn_graph_evidence',
				'kanban_task_board',
				'ewin_tang_low_rank',
				'exact_knn_retrieval',
			],
			evidenceRefs: ['evidence:b', 'evidence:a', 'evidence:a'],
			taskIds: ['task-2', 'task-1', 'task-1'],
			recommendationIds: ['rec-2', 'rec-1', 'rec-2'],
			kanbanTaskBoard: 'board:atlas-fabric',
			notes: 'lane manifest proof',
		});

		expect(manifest.laneKinds).toEqual([
			'ewin_tang_low_rank',
			'exact_knn_retrieval',
			'gnn_graph_evidence',
			'kanban_task_board',
		]);
		expect(manifest.evidenceRefs).toEqual(['evidence:a', 'evidence:b']);
		expect(manifest.taskIds).toEqual(['task-1', 'task-2']);
		expect(manifest.recommendationIds).toEqual(['rec-1', 'rec-2']);
		expect(manifest.representationId).toBe('semantic_768');
		expect(manifest.packetKey).toBe('packet-123');
	});

	it('rejects empty lane manifests and missing canonical representation ids', () => {
		expect(() =>
			FabricLaneManifestSchema.parse({
				packetKey: 'packet-123',
				sourceRef: 'src/foo.ts',
				sourceRevision: 'src@rev-1',
				representationRevision: 'semantic@rev-7',
				producerId: 'atlas-fabric',
				producerRevision: 'fabric@rev-3',
				laneKinds: [],
			})
		).toThrow();
	});
});
