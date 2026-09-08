import { describe, expect, it } from 'vitest';
import { buildRouteHeadDagV1 } from './route-head-dag-builder-v1.js';
import {
	admitRouteHeadDecisionV1,
	buildRouteHeadDecisionV1,
	ROUTE_HEAD_ACTIONS_V1,
	RouteHeadDecisionV1Schema,
	verifyRouteHeadDecisionV1,
} from './route-head-decision-v1.js';

const base = {
	schema: 'parent-atlas.route-head-decision.v1' as const,
	requestId: 'request:1',
	candidateSnapshotRevision: 'candidate:rev-1',
	ordinalMapChecksum: 'a'.repeat(64),
	featureSnapshotRevision: 'features:rev-1',
	modelRevision: 'atlas-gemma-rank:untrained-init',
	routeRevision: 'route-head:v1',
	action: 'ONTOLOGY_EXPAND' as const,
	confidence: 0.84,
	evidenceRefs: ['feature:row-1', 'ontology:tuple-1'],
	candidateOrdinals: [3, 7],
	canonicalAuthority: false as const,
	executionDelegated: true as const,
};

describe('RouteHeadDecisionV1', () => {
	it('accepts only the closed action vocabulary and delegates execution', () => {
		for (const action of ROUTE_HEAD_ACTIONS_V1) {
			const decision = buildRouteHeadDecisionV1({ ...base, action, candidateOrdinals: action === 'STOP' ? [] : [3] });
			expect(decision.action).toBe(action);
			expect(decision.canonicalAuthority).toBe(false);
			expect(decision.executionDelegated).toBe(true);
		}
	});

	it('is deterministic and checksum-verifiable', () => {
		const first = buildRouteHeadDecisionV1(base);
		const second = buildRouteHeadDecisionV1({ ...base });
		expect(first).toEqual(second);
		expect(verifyRouteHeadDecisionV1(first)).toEqual(first);
		expect(() => verifyRouteHeadDecisionV1({ ...first, action: 'STOP' })).toThrow(/CHECKSUM/);
	});

	it('requires evidence and a candidate for every non-stop action', () => {
		expect(() => buildRouteHeadDecisionV1({ ...base, evidenceRefs: [] })).toThrow();
		expect(() => buildRouteHeadDecisionV1({ ...base, candidateOrdinals: [] })).toThrow(/CANDIDATE_ORDINAL/);
	});

	it('rejects duplicate ordinals, unknown actions, and model-owned authority', () => {
		expect(() => buildRouteHeadDecisionV1({ ...base, candidateOrdinals: [3, 3] })).toThrow(/DUPLICATE/);
		expect(() => buildRouteHeadDecisionV1({ ...base, action: 'FREEFORM_DAG' as never })).toThrow();
		expect(() => RouteHeadDecisionV1Schema.parse({ ...base, checksum: 'a'.repeat(64), canonicalAuthority: true })).toThrow();
	});

	it('admits only proposals bound to the exact execution snapshot', () => {
		const decision = buildRouteHeadDecisionV1(base);
		const context = {
			requestId: base.requestId,
			candidateSnapshotRevision: base.candidateSnapshotRevision,
			ordinalMapChecksum: base.ordinalMapChecksum,
			featureSnapshotRevision: base.featureSnapshotRevision,
		};
		const admitted = admitRouteHeadDecisionV1(decision, context);
		expect(admitted.status).toBe('ADMITTED');
		if (admitted.status === 'ADMITTED') {
			expect(admitted.executor).toBe('DETERMINISTIC_DAG_BUILDER');
			expect(admitted.canonicalWritesAllowed).toBe(false);
		}
		expect(admitRouteHeadDecisionV1(decision, { ...context, ordinalMapChecksum: 'b'.repeat(64) })).toMatchObject({
			status: 'REJECTED',
			reason: 'ORDINAL_MAP_CHECKSUM_MISMATCH',
		});
		expect(admitRouteHeadDecisionV1({ ...decision, checksum: 'b'.repeat(64) }, context)).toMatchObject({
			status: 'REJECTED',
			reason: 'INVALID_DECISION',
		});
	});

	it('builds a read-only existing ContextToolDag from canonical ordinal resolution', () => {
		const decision = buildRouteHeadDecisionV1(base);
		const result = buildRouteHeadDagV1(decision, {
			requestId: base.requestId,
			candidateSnapshotRevision: base.candidateSnapshotRevision,
			ordinalMapChecksum: base.ordinalMapChecksum,
			featureSnapshotRevision: base.featureSnapshotRevision,
			workflowId: 'workflow:1',
			workflowRevision: 1,
			workspaceRevision: 'workspace:rev-1',
			graphRevision: 'graph:rev-1',
			producerRevision: 'route-builder:v1',
			canonicalIdsByOrdinal: new Map([[3, 'chunk:3'], [7, 'chunk:7']]),
		});
		expect(result.status).toBe('BUILT');
		if (result.status === 'BUILT') {
			expect(result.dag.nodes[0]?.canonicalIds).toEqual(['chunk:3', 'chunk:7']);
			expect(result.dag.nodes[0]?.kind).toBe('CONTEXT_FANOUT');
			expect(result.dag.nodes[0]?.readOnly).toBe(true);
			expect(result.dag.workspaceRevision).toBe('workspace:rev-1');
			expect(result.dag.workspaceRevision).not.toBe(base.candidateSnapshotRevision);
			expect(result.dag.canonicalWritesAllowed).toBe(false);
		}
		expect(buildRouteHeadDagV1(decision, {
			requestId: base.requestId,
			candidateSnapshotRevision: base.candidateSnapshotRevision,
			ordinalMapChecksum: base.ordinalMapChecksum,
			featureSnapshotRevision: base.featureSnapshotRevision,
			workflowId: 'workflow:1',
			workflowRevision: 1,
			workspaceRevision: 'workspace:rev-1',
			graphRevision: 'graph:rev-1',
			producerRevision: 'route-builder:v1',
			canonicalIdsByOrdinal: new Map([[3, 'chunk:3']]),
		})).toMatchObject({ status: 'REJECTED', reason: 'CANDIDATE_ORDINAL_UNRESOLVED' });
	});

	it('emits no DAG for STOP and never treats an ordinal as a canonical ID', () => {
		const decision = buildRouteHeadDecisionV1({ ...base, action: 'STOP', candidateOrdinals: [] });
		const result = buildRouteHeadDagV1(decision, {
			requestId: base.requestId,
			candidateSnapshotRevision: base.candidateSnapshotRevision,
			ordinalMapChecksum: base.ordinalMapChecksum,
			featureSnapshotRevision: base.featureSnapshotRevision,
			workflowId: 'workflow:1',
			workflowRevision: 1,
			workspaceRevision: 'workspace:rev-1',
			graphRevision: 'graph:rev-1',
			producerRevision: 'route-builder:v1',
			canonicalIdsByOrdinal: new Map(),
		});
		expect(result).toMatchObject({ status: 'STOP', dag: null });
	});
});
