export function evaluateGraphExportCoverageV2(graphJson) {
	const coverage = graphJson?.metadata?.exportCoverage;
	if (!coverage || typeof coverage !== 'object') {
		return { status: 'FAIL', reasons: ['EXPORT_COVERAGE_RECEIPT_MISSING'] };
	}
	const reasons = [];
	if (coverage.status !== 'COMPLETE') reasons.push('EXPORT_NOT_COMPLETE');
	if (coverage.readConsistency?.status !== 'PROVEN' || typeof coverage.readConsistency?.strategy !== 'string' || coverage.readConsistency.strategy.length === 0) {
		reasons.push('READ_CONSISTENCY_NOT_PROVEN');
	}
	const digestPattern = /^sha256:[0-9a-f]{64}$/i;
	if (!digestPattern.test(coverage.sourceRevision ?? '')) reasons.push('SOURCE_REVISION_INVALID');
	if (!digestPattern.test(coverage.workspaceRevision ?? '')) reasons.push('WORKSPACE_REVISION_INVALID');
	if (!digestPattern.test(coverage.selectionChecksum ?? '')) reasons.push('SELECTION_CHECKSUM_INVALID');
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(coverage.executionId ?? '')) reasons.push('EXECUTION_ID_INVALID');
	if ((!Array.isArray(coverage.relationshipTypes) && (!coverage.relationshipTypes || typeof coverage.relationshipTypes !== 'object'))
		|| Object.keys(coverage.relationshipTypes).length === 0) {
		reasons.push('RELATIONSHIP_TYPE_COVERAGE_MISSING');
	}
	if (!Array.isArray(coverage.coverageThresholds) || coverage.coverageThresholds.length === 0) {
		reasons.push('COVERAGE_THRESHOLDS_MISSING');
	}
	let computedThresholdsPassed = true;
	for (const threshold of Array.isArray(coverage.coverageThresholds) ? coverage.coverageThresholds : []) {
		const scope = threshold?.scope;
		const key = threshold?.key;
		const minimumCoverage = threshold?.minimumCoverage;
		if (!['nodeClass', 'relationshipType'].includes(scope)
			|| typeof key !== 'string' || key.length === 0
			|| typeof minimumCoverage !== 'number' || !Number.isFinite(minimumCoverage)
			|| minimumCoverage < 0 || minimumCoverage > 1) {
			computedThresholdsPassed = false;
			reasons.push('COVERAGE_THRESHOLD_INVALID');
			continue;
		}
		const rows = scope === 'nodeClass' ? coverage.nodeClasses : coverage.relationshipTypes;
		const row = rows?.[key];
		if (!row || !Number.isSafeInteger(row.considered) || row.considered <= 0
			|| !Number.isSafeInteger(row.exported) || row.exported < 0 || row.exported > row.considered) {
			computedThresholdsPassed = false;
			reasons.push(`COVERAGE_THRESHOLD_TARGET_UNAVAILABLE:${scope}:${key}`);
			continue;
		}
		const actualCoverage = row.exported / row.considered;
		if (actualCoverage < minimumCoverage) {
			computedThresholdsPassed = false;
			reasons.push(`COVERAGE_THRESHOLD_NOT_MET:${scope}:${key}:${actualCoverage}<${minimumCoverage}`);
		}
	}
	if (coverage.thresholdsPassed === true && !computedThresholdsPassed) reasons.push('COVERAGE_THRESHOLD_ATTESTATION_CONFLICT');
	for (const [name, row] of Object.entries(coverage.nodeClasses ?? {})) {
		if (!Number.isSafeInteger(row?.considered) || !Number.isSafeInteger(row?.exported)
			|| !Number.isSafeInteger(row?.excluded) || !Number.isSafeInteger(row?.unresolved)
			|| row.considered !== row.exported + row.excluded + row.unresolved) {
			reasons.push(`NODE_CENSUS_NOT_RECONCILED:${name}`);
		}
	}
	for (const [name, row] of Object.entries(coverage.relationshipTypes ?? {})) {
		if (!Number.isSafeInteger(row?.considered) || !Number.isSafeInteger(row?.exported)
			|| !Number.isSafeInteger(row?.excluded) || !Number.isSafeInteger(row?.unresolved)
			|| row.considered !== row.exported + row.excluded + row.unresolved) {
			reasons.push(`RELATIONSHIP_CENSUS_NOT_RECONCILED:${name}`);
		}
	}
	if (Object.keys(coverage.nodeClasses ?? {}).length === 0) reasons.push('NODE_CENSUS_MISSING');
	if (Object.keys(coverage.relationshipTypes ?? {}).length === 0) reasons.push('RELATIONSHIP_CENSUS_MISSING');
	if (coverage.thresholdsPassed !== true || !computedThresholdsPassed) reasons.push('COVERAGE_THRESHOLDS_NOT_PASSED');
	return { status: reasons.length === 0 ? 'PASS' : 'FAIL', reasons };
}

