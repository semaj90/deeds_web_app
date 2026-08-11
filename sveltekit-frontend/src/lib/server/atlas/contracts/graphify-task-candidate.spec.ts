import { describe, expect, it } from 'vitest';
import { buildGraphifyTaskCandidate, GraphifyTaskCandidateSchema } from './graphify-task-candidate.js';

describe('GraphifyTaskCandidateSchema', () => {
	it('keeps packet identity, provenance, and semantic_768 explicit', () => {
		const candidate = buildGraphifyTaskCandidate({
			taskId: 'feature_extract',
			priority: 'P0',
			taskLabel: 'Assign feature_id to unclassified packets',
			kind: 'graphify_evidence',
			producerId: 'graphify-langgraph-pipeline:kanban_task',
			producerRevision: 'abc1234',
			workspaceRevision: 'workspace:main',
			sourceRevision: '2026-08-11T00:00:00.000Z',
			graphRevision: '2026-08-11T00:00:00.000Z',
			representationRevision: 'semantic_768',
			confidence: 0.9,
			packetKeys: ['packet:1'],
			evidenceRefs: ['evidence:a', 'evidence:b'],
			requiredGates: ['feature_id coverage ≥ 60%'],
			blockedBy: ['index_bm25'],
			sourceRef: 'docs/reports/atlas-kanban-tasks.json',
			treeNodeId: 'tree:node:1',
			titleId: 'title:1',
			script: 'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage feature_extract',
		});

		const parsed = GraphifyTaskCandidateSchema.parse(candidate);

		expect(parsed.representation_id).toBe('semantic_768');
		expect(parsed.packet_keys).toEqual(['packet:1']);
		expect(parsed.evidence_refs).toEqual(['evidence:a', 'evidence:b']);
		expect(parsed.required_gates).toEqual(['feature_id coverage ≥ 60%']);
		expect(parsed.blocked_by).toEqual(['index_bm25']);
		expect(parsed.dedup_key).toHaveLength(64);
	});

	it('keeps the dedup key stable when evidence order changes', () => {
		const a = buildGraphifyTaskCandidate({
			taskId: 'feature_extract',
			priority: 'P0',
			taskLabel: 'Assign feature_id to unclassified packets',
			kind: 'graphify_evidence',
			producerId: 'graphify-langgraph-pipeline:kanban_task',
			producerRevision: 'abc1234',
			workspaceRevision: 'workspace:main',
			sourceRevision: '2026-08-11T00:00:00.000Z',
			representationRevision: 'semantic_768',
			evidenceRefs: ['b', 'a'],
		});

		const b = buildGraphifyTaskCandidate({
			taskId: 'feature_extract',
			priority: 'P0',
			taskLabel: 'Assign feature_id to unclassified packets',
			kind: 'graphify_evidence',
			producerId: 'graphify-langgraph-pipeline:kanban_task',
			producerRevision: 'abc1234',
			workspaceRevision: 'workspace:main',
			sourceRevision: '2026-08-11T00:00:00.000Z',
			representationRevision: 'semantic_768',
			evidenceRefs: ['a', 'b'],
		});

		expect(a.dedup_key).toBe(b.dedup_key);
	});
});
