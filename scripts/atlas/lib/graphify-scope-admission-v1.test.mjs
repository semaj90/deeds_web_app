import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGraphifyMembershipScopeV1 } from './graphify-scope-admission-v1.mjs';

const membership = (scope = 'repo:root') => [{ membership_repository_scope: scope }];
const mapping = [{
  membership_repository_scope: 'repo:root',
  repository_id: '01a13137-1378-7df9-9968-53738dbf0e48',
  source_authority_repo_id: 'deeds-web-app',
  persisted_source_authority_repo_id: 'deeds-web-app',
  mapping_kind: 'ROOT_SCOPE',
  repository_kind: 'ROOT',
  parent_repository_id: null,
}];

test('resolves one matching membership scope through the persisted map to its repository UUID', () => {
  assert.deepEqual(classifyGraphifyMembershipScopeV1({
    membershipRows: membership(), repositoryScope: 'repo:root', scopeMapPresent: true, scopeMappings: mapping,
  }), { ok: true, code: null, repositoryId: mapping[0].repository_id });
});

test('rejects absent or duplicate membership rows', () => {
  for (const membershipRows of [[], [...membership(), ...membership()]]) {
    assert.equal(classifyGraphifyMembershipScopeV1({
      membershipRows, repositoryScope: 'repo:root', scopeMapPresent: true, scopeMappings: mapping,
    }).code, 'MEMBERSHIP_NOT_UNIQUE');
  }
});

test('rejects mismatched membership scope before resolving repository identity', () => {
  assert.equal(classifyGraphifyMembershipScopeV1({
    membershipRows: membership('repo:packages'), repositoryScope: 'repo:root', scopeMapPresent: true, scopeMappings: mapping,
  }).code, 'MEMBERSHIP_SCOPE_MISMATCH');
});

test('returns a typed blocker for missing mapping DDL and unresolved map rows', () => {
  assert.equal(classifyGraphifyMembershipScopeV1({
    membershipRows: membership(), repositoryScope: 'repo:root', scopeMapPresent: false, scopeMappings: [],
  }).code, 'SCOPE_MAPPING_DDL_NOT_APPLIED');
  assert.equal(classifyGraphifyMembershipScopeV1({
    membershipRows: membership(), repositoryScope: 'repo:root', scopeMapPresent: true, scopeMappings: [],
  }).code, 'SCOPE_MAPPING_UNRESOLVED');
});
