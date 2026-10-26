import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireGraphWorkspaceRevisionV1 } from './bind-graph-ordinal-map-to-snapshot-parity-v1.mjs';

test('GRAPH-06D requires an explicit workspace revision and never substitutes producer revision', () => {
	assert.throws(
		() => requireGraphWorkspaceRevisionV1({ workspaceRevision: null }),
		{ message: 'GRAPH_06D_WORKSPACE_REVISION_REQUIRED' },
	);
	assert.throws(
		() => requireGraphWorkspaceRevisionV1({ workspaceRevision: ' workspace:r1 ' }),
		{ message: 'GRAPH_06D_WORKSPACE_REVISION_NOT_NORMALIZED' },
	);
	assert.equal(requireGraphWorkspaceRevisionV1({ workspaceRevision: 'sha256:workspace-r1' }), 'sha256:workspace-r1');
});
