import { describe, expect, it, vi } from 'vitest';
import { buildRelationshipKernel } from '@deeds/parent-atlas/core/relationship-kernel';
import { projectRelationshipKernelsToNeo4j } from './relationship-kernel-neo4j-projector-v1.js';

const revision = `sha256:${'a'.repeat(64)}`;

function kernel(participantCount: number) {
	return buildRelationshipKernel({
		relationshipId: 'relationship:doc-14:fixture',
		authority: 'FEATURE_INTELLIGENCE',
		relationType: 'DOCUMENTED_BY',
		participants: Array.from({ length: participantCount }, (_, ordinal) => ({
			canonicalId: `entity:${ordinal}`,
			role: `role-${ordinal}`,
			ordinal,
			entityType: ordinal === 0 ? 'API_SYMBOL' : 'DOC_SECTION',
			entityRevision: revision,
			sourceRef: 'docs/cuda/runtime.md',
		})),
		evidenceRefs: ['evidence:doc-span-2', 'evidence:doc-span-1'],
		sourceRef: 'docs/cuda/runtime.md',
		sourceRevision: revision,
		workspaceRevision: `sha256:${'b'.repeat(64)}`,
		graphRevision: `sha256:${'c'.repeat(64)}`,
		relationshipRevision: 'relationship-rev-7',
		producerRevision: 'doc-relation-producer-v1',
	});
}

describe('projectRelationshipKernelsToNeo4j', () => {
	it('passes revision-qualified evidence provenance to binary projection without a live session', async () => {
		const run = vi.fn().mockResolvedValue({});
		const result = await projectRelationshipKernelsToNeo4j({ run } as never, [kernel(2)]);

		expect(result.binaryEdgesWritten).toBe(1);
		expect(run).toHaveBeenCalledTimes(1);
		const [query, params] = run.mock.calls[0]!;
		expect(query).toContain('r.sourceRevision = $sourceRevision');
		expect(query).toContain('r.evidenceRefs = $evidenceRefs');
		expect(params).toMatchObject({
			sourceRef: 'docs/cuda/runtime.md',
			sourceRevision: revision,
			relationshipRevision: 'relationship-rev-7',
			evidenceRefs: ['evidence:doc-span-1', 'evidence:doc-span-2'],
			workspaceRevision: `sha256:${'b'.repeat(64)}`,
		});
	});

	it('preserves the same provenance on n-ary relation hubs and updates', async () => {
		const run = vi.fn().mockResolvedValue({});
		const result = await projectRelationshipKernelsToNeo4j({ run } as never, [kernel(3)]);

		expect(result.hubNodesWritten).toBe(1);
		expect(result.incidentEdgesWritten).toBe(3);
		expect(run).toHaveBeenCalledTimes(4);
		const [hubQuery, hubParams] = run.mock.calls[0]!;
		expect(hubQuery).toContain('relation.sourceRevision = $sourceRevision');
		expect(hubQuery).toContain('relation.evidenceRefs = $evidenceRefs');
		expect(hubQuery).toContain('ON MATCH SET');
		expect(hubParams).toMatchObject({
			sourceRevision: revision,
			relationshipRevision: 'relationship-rev-7',
			evidenceRefs: ['evidence:doc-span-1', 'evidence:doc-span-2'],
		});
	});
});
