import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGraphExportCoverageV2 } from './graph-export-coverage-contract-v2.mjs';

const completeGraph = () => ({
	metadata: {
		exportCoverage: {
			status: 'COMPLETE',
			readConsistency: { status: 'PROVEN', strategy: 'fixture snapshot transaction' },
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			workspaceRevision: `sha256:${'b'.repeat(64)}`,
			selectionChecksum: `sha256:${'c'.repeat(64)}`,
			executionId: '01a1763a-4355-71d7-9b81-2c7a1814a41f',
			thresholdsPassed: true,
			coverageThresholds: [
				{ scope: 'nodeClass', key: 'Packet', minimumCoverage: 1 },
				{ scope: 'relationshipType', key: 'CALLS', minimumCoverage: 1 },
			],
			nodeClasses: { Packet: { considered: 2, exported: 2, excluded: 0, unresolved: 0 } },
			relationshipTypes: { CALLS: { considered: 1, exported: 1, excluded: 0, unresolved: 0 } },
		},
	},
});

test('accepts complete, reconciled, revision-qualified coverage with explicit thresholds', () => {
	assert.deepEqual(evaluateGraphExportCoverageV2(completeGraph()), { status: 'PASS', reasons: [] });
});

test('rejects old exports without a coverage denominator', () => {
	assert.deepEqual(evaluateGraphExportCoverageV2({ nodes: [], edges: [], metadata: {} }), {
		status: 'FAIL',
		reasons: ['EXPORT_COVERAGE_RECEIPT_MISSING'],
	});
});

test('rejects empty coverage cohorts and malformed snapshot provenance', () => {
	const graph = completeGraph();
	graph.metadata.exportCoverage.nodeClasses = {};
	graph.metadata.exportCoverage.relationshipTypes = {};
	graph.metadata.exportCoverage.sourceRevision = 'current';
	graph.metadata.exportCoverage.workspaceRevision = null;
	graph.metadata.exportCoverage.selectionChecksum = 'sha256:short';
	graph.metadata.exportCoverage.executionId = 'not-an-execution-id';
	const result = evaluateGraphExportCoverageV2(graph);
	assert.equal(result.status, 'FAIL');
	assert.ok(result.reasons.includes('SOURCE_REVISION_INVALID'));
	assert.ok(result.reasons.includes('WORKSPACE_REVISION_INVALID'));
	assert.ok(result.reasons.includes('SELECTION_CHECKSUM_INVALID'));
	assert.ok(result.reasons.includes('EXECUTION_ID_INVALID'));
	assert.ok(result.reasons.includes('NODE_CENSUS_MISSING'));
	assert.ok(result.reasons.includes('RELATIONSHIP_CENSUS_MISSING'));
});

test('rejects referentially clean but partial or unreconciled exports', () => {
	const graph = completeGraph();
	graph.metadata.exportCoverage.status = 'PARTIAL';
	graph.metadata.exportCoverage.nodeClasses.Packet.excluded = 1;
	graph.metadata.exportCoverage.relationshipTypes.CALLS.unresolved = 1;
	graph.metadata.exportCoverage.thresholdsPassed = false;
	const result = evaluateGraphExportCoverageV2(graph);
	assert.equal(result.status, 'FAIL');
	assert.ok(result.reasons.includes('EXPORT_NOT_COMPLETE'));
	assert.ok(result.reasons.includes('NODE_CENSUS_NOT_RECONCILED:Packet'));
	assert.ok(result.reasons.includes('RELATIONSHIP_CENSUS_NOT_RECONCILED:CALLS'));
	assert.ok(result.reasons.includes('COVERAGE_THRESHOLDS_NOT_PASSED'));
});

test('rejects a nominally complete export without a proven consistent-read strategy', () => {
	const graph = completeGraph();
	graph.metadata.exportCoverage.readConsistency = {
		status: 'NOT_PROVEN',
		strategy: 'single read transaction without snapshot isolation evidence',
	};
	const result = evaluateGraphExportCoverageV2(graph);
	assert.equal(result.status, 'FAIL');
	assert.ok(result.reasons.includes('READ_CONSISTENCY_NOT_PROVEN'));
});

test('recomputes declared thresholds instead of trusting a passing attestation', () => {
	const graph = completeGraph();
	graph.metadata.exportCoverage.nodeClasses.Packet = { considered: 2, exported: 1, excluded: 1, unresolved: 0 };
	const result = evaluateGraphExportCoverageV2(graph);
	assert.equal(result.status, 'FAIL');
	assert.ok(result.reasons.includes('COVERAGE_THRESHOLD_NOT_MET:nodeClass:Packet:0.5<1'));
	assert.ok(result.reasons.includes('COVERAGE_THRESHOLD_ATTESTATION_CONFLICT'));
});

test('rejects a threshold that names a class absent from the measured census', () => {
	const graph = completeGraph();
	graph.metadata.exportCoverage.coverageThresholds.push({ scope: 'relationshipType', key: 'USES', minimumCoverage: 0.9 });
	const result = evaluateGraphExportCoverageV2(graph);
	assert.equal(result.status, 'FAIL');
	assert.ok(result.reasons.includes('COVERAGE_THRESHOLD_TARGET_UNAVAILABLE:relationshipType:USES'));
});

