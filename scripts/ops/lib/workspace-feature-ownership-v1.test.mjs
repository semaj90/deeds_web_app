import test from 'node:test';
import assert from 'node:assert/strict';
import {
	classifyWorkspaceFeatureSourceRefV1,
	summarizeWorkspaceFeatureOwnershipV1,
	WORKSPACE_FEATURE_OWNERSHIP_LANES_V1 as LANES
} from './workspace-feature-ownership-v1.mjs';

test('classifies explicit product and Parent Atlas source paths without granting authority', () => {
	assert.deepEqual(
		classifyWorkspaceFeatureSourceRefV1('local:sveltekit-frontend/src/routes/api/search/+server.ts#L12'),
		{ sourceRef: 'local:sveltekit-frontend/src/routes/api/search/+server.ts#L12', lane: LANES.PRODUCT, basis: 'EXPLICIT_PRODUCT_RUNTIME_SOURCE_PATH_V1', path: 'sveltekit-frontend/src/routes/api/search/+server.ts', line: 12, canonicalAuthority: false }
	);
	assert.equal(classifyWorkspaceFeatureSourceRefV1('local:packages/parent-atlas/src/index.ts#L1').lane, LANES.ATLAS);
	assert.equal(classifyWorkspaceFeatureSourceRefV1('local:scripts/atlas/run.mjs#L4').lane, LANES.TOOLING);
});

test('leaves architecture documentation, unknown paths, and malformed references unassessed', () => {
	for (const ref of ['local:docs/architecture/system.md#L1', 'local:unknown/runtime.ts#L1', 'not-local:path']) {
		assert.equal(classifyWorkspaceFeatureSourceRefV1(ref).lane, LANES.UNASSESSED);
	}
});

test('marks mixed or partially unknown feature ownership for review', () => {
	const mixed = summarizeWorkspaceFeatureOwnershipV1([
		classifyWorkspaceFeatureSourceRefV1('local:sveltekit-frontend/src/routes/+page.svelte#L1'),
		classifyWorkspaceFeatureSourceRefV1('local:packages/parent-atlas/src/index.ts#L1')
	]);
	assert.equal(mixed.status, 'MULTIPLE_LANES_REVIEW_REQUIRED');
	const incomplete = summarizeWorkspaceFeatureOwnershipV1([
		classifyWorkspaceFeatureSourceRefV1('local:docs/architecture/system.md#L1')
	]);
	assert.equal(incomplete.status, 'UNASSESSED_REVIEW_REQUIRED');
	assert.equal(incomplete.canonicalAuthority, false);
});
