import crypto from 'node:crypto';

export const NEO4J_GRAPH_COVERAGE_SCHEMA_V2 = 'atlas.neo4j-graph-coverage.v2';

export function buildNeo4jSourceLineageDiagnosticV2({ label, total, sourceRevisionPresent, workspaceRevisionPresent, bothRevisionsPresent }) {
	for (const [name, value] of Object.entries({ total, sourceRevisionPresent, workspaceRevisionPresent, bothRevisionsPresent })) {
		if (!Number.isSafeInteger(value) || value < 0 || value > total) throw new RangeError(`NEO4J_SOURCE_LINEAGE_COUNT_INVALID:${name}`);
	}
	if (typeof label !== 'string' || label.length === 0 || bothRevisionsPresent > sourceRevisionPresent || bothRevisionsPresent > workspaceRevisionPresent) {
		throw new TypeError('NEO4J_SOURCE_LINEAGE_IDENTITY_INVALID');
	}
	return {
		label,
		total,
		sourceRevisionPresent,
		sourceRevisionUnqualified: total - sourceRevisionPresent,
		workspaceRevisionPresent,
		workspaceRevisionUnqualified: total - workspaceRevisionPresent,
		bothRevisionsPresent,
		revisionAuthority: 'PRESENCE_ONLY_SOURCE_JOIN_AND_STALENESS_NOT_EVALUATED',
	};
}

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export function coverageDigestV2(receipt) {
	const { receiptSha256, ...body } = receipt;
	return `sha256:${crypto.createHash('sha256').update(stableJson(body)).digest('hex')}`;
}

export function buildNeo4jGraphCoverageReceiptV2({ runId, generatedAtUtc, databaseIdentity, readBoundary, queryDefinitions, nodesConsidered, nodeLabels, relationshipEndpoints, sourceLineage, identityDiagnostics }) {
	const sortedNodes = [...nodeLabels].sort((left, right) => left.label.localeCompare(right.label));
	const sortedRelationships = [...relationshipEndpoints].sort((left, right) =>
		`${left.type}\u0000${left.sourceLabels.join(',')}\u0000${left.targetLabels.join(',')}`
			.localeCompare(`${right.type}\u0000${right.sourceLabels.join(',')}\u0000${right.targetLabels.join(',')}`));
	const relationshipsConsidered = sortedRelationships.reduce((sum, row) => sum + row.count, 0);
	const receipt = {
		schema: NEO4J_GRAPH_COVERAGE_SCHEMA_V2,
		runId,
		generatedAtUtc,
		mode: 'READ_ONLY_CENSUS',
		databaseIdentity,
		readBoundary,
		queryDefinitions,
		nodesConsidered,
		relationshipsConsidered,
		nodeLabels: sortedNodes,
		nodeLabelMemberships: sortedNodes.reduce((sum, row) => sum + row.count, 0),
		relationshipEndpoints: sortedRelationships,
		sourceLineage,
		identityDiagnostics,
		revisionAuthority: 'NOT_ESTABLISHED_BY_GRAPH_CENSUS',
		endpointNormalizationAudit: 'NOT_EVALUATED',
		coverageStatus: 'CENSUS_ONLY_NOT_EXPORTED',
		coverageThresholds: null,
		canonicalAuthority: false,
		writesPerformed: false,
	};
	receipt.receiptSha256 = coverageDigestV2(receipt);
	return receipt;
}

export function verifyNeo4jGraphCoverageReceiptV2(receipt) {
	return receipt?.schema === NEO4J_GRAPH_COVERAGE_SCHEMA_V2
		&& receipt.mode === 'READ_ONLY_CENSUS'
		&& typeof receipt.databaseIdentity?.databaseName === 'string'
		&& receipt.databaseIdentity.databaseName.length > 0
		&& typeof receipt.databaseIdentity.databaseId === 'string'
		&& receipt.databaseIdentity.databaseId.length > 0
		&& typeof receipt.readBoundary?.consistency === 'string'
		&& receipt.readBoundary.consistency.length > 0
		&& Array.isArray(receipt.queryDefinitions)
		&& receipt.queryDefinitions.length >= 1
		&& receipt.queryDefinitions.every((query) => typeof query.id === 'string' && /^sha256:[a-f0-9]{64}$/.test(query.sha256))
		&& receipt.canonicalAuthority === false
		&& receipt.writesPerformed === false
		&& receipt.coverageStatus === 'CENSUS_ONLY_NOT_EXPORTED'
		&& receipt.receiptSha256 === coverageDigestV2(receipt);
}
