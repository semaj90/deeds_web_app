import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildNeo4jGraphCoverageReceiptV2,
	buildNeo4jSourceLineageDiagnosticV2,
	verifyNeo4jGraphCoverageReceiptV2,
} from './neo4j-graph-coverage-v2.mjs';

test('source lineage reports unqualified counts without implying revision authority', () => {
	const row = buildNeo4jSourceLineageDiagnosticV2({
		label: 'Packet',
		total: 5,
		sourceRevisionPresent: 2,
		workspaceRevisionPresent: 0,
		bothRevisionsPresent: 0,
	});
	assert.equal(row.sourceRevisionUnqualified, 3);
	assert.equal(row.workspaceRevisionUnqualified, 5);
	assert.equal(row.revisionAuthority, 'PRESENCE_ONLY_SOURCE_JOIN_AND_STALENESS_NOT_EVALUATED');
	assert.throws(() => buildNeo4jSourceLineageDiagnosticV2({ ...row, sourceRevisionPresent: 6 }), /NEO4J_SOURCE_LINEAGE_COUNT_INVALID/);
});

test('coverage receipt totals sorted graph census rows and never claims export coverage', () => {
	const receipt = buildNeo4jGraphCoverageReceiptV2({
		runId: 'fixture-run',
		generatedAtUtc: '2026-10-27T00:00:00.000Z',
		databaseIdentity: { databaseName: 'neo4j', databaseId: 'fixture-database', endpoint: '127.0.0.1:7687' },
		readBoundary: { accessMode: 'READ', transactionStrategy: 'single_executeRead_transaction', consistency: 'NO_SNAPSHOT_CLAIM' },
		queryDefinitions: [{ id: 'fixture-census.v1', sha256: `sha256:${'a'.repeat(64)}` }],
		nodesConsidered: 2,
		nodeLabels: [{ label: 'Packet', count: 2 }, { label: 'Concept', count: 1 }],
		relationshipEndpoints: [{ type: 'USED_CONCEPT', sourceLabels: ['Packet'], targetLabels: ['Concept'], count: 3 }],
		sourceLineage: [{ label: 'Packet', total: 2, sourceRevisionPresent: 1, workspaceRevisionPresent: 1, bothRevisionsPresent: 1 }],
		identityDiagnostics: { packetsMissingPacketKey: 1 },
	});
	assert.equal(receipt.nodesConsidered, 2);
	assert.equal(receipt.nodeLabelMemberships, 3);
	assert.equal(receipt.relationshipsConsidered, 3);
	assert.equal(receipt.coverageStatus, 'CENSUS_ONLY_NOT_EXPORTED');
	assert.equal(receipt.canonicalAuthority, false);
	assert.equal(receipt.writesPerformed, false);
	assert.equal(verifyNeo4jGraphCoverageReceiptV2(receipt), true);
});

test('coverage receipt verifier rejects changed census values and authority claims', () => {
	const receipt = buildNeo4jGraphCoverageReceiptV2({
		runId: 'fixture-run',
		generatedAtUtc: '2026-10-27T00:00:00.000Z',
		databaseIdentity: { databaseName: 'neo4j', databaseId: 'fixture-database' },
		readBoundary: { consistency: 'NO_SNAPSHOT_CLAIM' },
		queryDefinitions: [{ id: 'fixture-census.v1', sha256: `sha256:${'b'.repeat(64)}` }],
		nodesConsidered: 0,
		nodeLabels: [],
		relationshipEndpoints: [],
		sourceLineage: [],
		identityDiagnostics: {},
	});
	assert.equal(verifyNeo4jGraphCoverageReceiptV2({ ...receipt, nodesConsidered: 1 }), false);
	assert.equal(verifyNeo4jGraphCoverageReceiptV2({ ...receipt, canonicalAuthority: true }), false);
	assert.equal(verifyNeo4jGraphCoverageReceiptV2({ ...receipt, databaseIdentity: undefined }), false);
	assert.equal(verifyNeo4jGraphCoverageReceiptV2({ ...receipt, queryDefinitions: [{ id: 'unhashed', sha256: 'missing' }] }), false);
});
