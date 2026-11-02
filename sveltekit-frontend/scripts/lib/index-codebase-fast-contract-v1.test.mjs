import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPublishBlockerV1,
  isSvelteKitSourcePathV1,
} from './index-codebase-fast-contract-v1.mjs';

test('G15 includes frontend sources when scanning the parent repository', () => {
  assert.equal(isSvelteKitSourcePathV1('sveltekit-frontend/src/routes/+server.ts'), true);
  assert.equal(isSvelteKitSourcePathV1('src/routes/+server.ts'), true);
  assert.equal(isSvelteKitSourcePathV1('services/api/main.go'), false);
});

test('canonical publication requires full scope and a workspace revision', () => {
  assert.equal(canonicalPublishBlockerV1({ requested: false, canonicalScope: false, workspaceRevision: null }), null);
  assert.equal(canonicalPublishBlockerV1({ requested: true, canonicalScope: false, workspaceRevision: 'abc' }), 'CANONICAL_SCOPE_REQUIRED');
  assert.equal(canonicalPublishBlockerV1({ requested: true, canonicalScope: true, workspaceRevision: null }), 'WORKSPACE_REVISION_REQUIRED');
  assert.equal(canonicalPublishBlockerV1({ requested: true, canonicalScope: true, workspaceRevision: '  ' }), 'WORKSPACE_REVISION_REQUIRED');
  assert.equal(canonicalPublishBlockerV1({ requested: true, canonicalScope: true, workspaceRevision: 'snapshot:sha256:abc' }), null);
});
