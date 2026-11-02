const LANES = Object.freeze({
	PRODUCT: 'LEGAL_AI_PRODUCT',
	ATLAS: 'PARENT_ATLAS_CANONICAL_OR_DERIVED',
	TOOLING: 'WORKSTATION_DEV_TEST',
	UNASSESSED: 'UNASSESSED'
});

function normalizeSourceRef(sourceRef) {
	if (typeof sourceRef !== 'string' || !sourceRef.startsWith('local:')) {
		return { lane: LANES.UNASSESSED, basis: 'INVALID_OR_NONLOCAL_SOURCE_REF', path: null, line: null };
	}
	const match = /^local:([^#]+)(?:#L(\d+)(?::\d+)?)?$/.exec(sourceRef);
	if (!match) {
		return { lane: LANES.UNASSESSED, basis: 'SOURCE_REF_FORMAT_UNRECOGNIZED', path: null, line: null };
	}
	const sourcePath = match[1].replaceAll('\\', '/').replace(/^\.\//, '');
	if (sourcePath.split('/').includes('..') || sourcePath.startsWith('/')) {
		return { lane: LANES.UNASSESSED, basis: 'SOURCE_REF_PATH_NOT_REPOSITORY_RELATIVE', path: sourcePath, line: match[2] ? Number(match[2]) : null };
	}
	return { path: sourcePath, line: match[2] ? Number(match[2]) : null };
}

export function classifyWorkspaceFeatureSourceRefV1(sourceRef) {
	const parsed = normalizeSourceRef(sourceRef);
	if (parsed.lane) {
		return { sourceRef, lane: parsed.lane, basis: parsed.basis, path: parsed.path, line: parsed.line, canonicalAuthority: false };
	}
	const sourcePath = parsed.path;
	let lane = LANES.UNASSESSED;
	let basis = 'PATH_DOES_NOT_ESTABLISH_RUNTIME_OWNER';

	if (
		sourcePath.startsWith('scripts/') ||
		sourcePath.startsWith('tests/') ||
		sourcePath.startsWith('python/tests/') ||
		sourcePath.startsWith('vscode-extension/') ||
		sourcePath.startsWith('docker/') ||
		sourcePath.startsWith('models/') ||
		sourcePath.startsWith('backups/') ||
		sourcePath.startsWith('deeds_labs/') ||
		sourcePath.startsWith('.vscode/') ||
		sourcePath.startsWith('docs/reports/') ||
		sourcePath.startsWith('docs/archive/') ||
		sourcePath.startsWith('docs/status/') ||
		sourcePath.startsWith('docs/operator/') ||
		sourcePath.startsWith('docs/ai-os/') ||
		sourcePath.startsWith('sveltekit-frontend/scripts/') ||
		sourcePath.startsWith('sveltekit-frontend/tests/')
	) {
		lane = LANES.TOOLING;
		basis = 'EXPLICIT_TOOLING_TEST_OR_ARTIFACT_PATH_V1';
	} else if (
		sourcePath.startsWith('packages/parent-atlas/') ||
		sourcePath.startsWith('packages/atlas-native-core/') ||
		sourcePath.startsWith('sveltekit-frontend/src/lib/server/atlas/') ||
		sourcePath.startsWith('sveltekit-frontend/src/routes/api/atlas/') ||
		sourcePath.startsWith('python/atlas_') ||
		sourcePath.startsWith('python/atlas_corpus_lib/')
	) {
		lane = LANES.ATLAS;
		basis = 'EXPLICIT_PARENT_ATLAS_SOURCE_PATH_V1';
	} else if (
		sourcePath.startsWith('sveltekit-frontend/src/routes/') ||
		sourcePath.startsWith('sveltekit-frontend/src/lib/components/') ||
		sourcePath.startsWith('sveltekit-frontend/src/lib/server/') ||
		sourcePath.startsWith('sveltekit-frontend/src/lib/client/') ||
		sourcePath.startsWith('services/')
	) {
		lane = LANES.PRODUCT;
		basis = 'EXPLICIT_PRODUCT_RUNTIME_SOURCE_PATH_V1';
	}

	return { sourceRef, lane, basis, path: sourcePath, line: parsed.line, canonicalAuthority: false };
}

export function summarizeWorkspaceFeatureOwnershipV1(classifications) {
	const laneCounts = Object.fromEntries(Object.values(LANES).map((lane) => [lane, 0]));
	for (const item of classifications) laneCounts[item.lane] = (laneCounts[item.lane] ?? 0) + 1;
	const assignedLanes = Object.entries(laneCounts).filter(([lane, count]) => lane !== LANES.UNASSESSED && count > 0).map(([lane]) => lane);
	const status = classifications.length === 0 || laneCounts[LANES.UNASSESSED] > 0
		? 'UNASSESSED_REVIEW_REQUIRED'
		: assignedLanes.length === 1
			? 'SINGLE_LANE_PATH_CLASSIFICATION'
			: 'MULTIPLE_LANES_REVIEW_REQUIRED';
	return { status, assignedLanes, laneCounts, canonicalAuthority: false };
}

export const WORKSPACE_FEATURE_OWNERSHIP_LANES_V1 = LANES;
