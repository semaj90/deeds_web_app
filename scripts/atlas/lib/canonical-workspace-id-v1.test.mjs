import assert from 'node:assert/strict';
import test from 'node:test';
import { requireCanonicalWorkspaceIdV1 } from './canonical-workspace-id-v1.mjs';

test('accepts a canonical PostgreSQL workspace UUID', () => {
  assert.equal(requireCanonicalWorkspaceIdV1('8b2d0f13-2fe5-4e44-8b25-19ea1637c29a'), '8b2d0f13-2fe5-4e44-8b25-19ea1637c29a');
});

test('rejects scratch IDs and malformed workspace IDs before database use', () => {
  assert.throws(() => requireCanonicalWorkspaceIdV1('scratch-ns7-20261023T042545Z'), /WORKSPACE_ID_NOT_CANONICAL_UUID/);
  assert.throws(() => requireCanonicalWorkspaceIdV1(null), /WORKSPACE_ID_NOT_CANONICAL_UUID/);
});
