import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGraphifyScopeRepositoryMappingV1 } from './packet-key-v2-admission-v1.mjs';

const rootMapping = (overrides = {}) => ({
  membership_repository_scope: 'repo:root',
  repository_id: '01a13137-1378-7df9-9968-53738dbf0e48',
  source_authority_repo_id: 'deeds-web-app',
  persisted_source_authority_repo_id: 'deeds-web-app',
  mapping_kind: 'ROOT_SCOPE',
  repository_kind: 'ROOT',
  parent_repository_id: null,
  ...overrides,
});

test('resolves persisted membership scope to canonical repository UUID', () => {
  assert.deepEqual(resolveGraphifyScopeRepositoryMappingV1('repo:root', [rootMapping()]), {
    ok: true,
    code: null,
    repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48',
    mappingKind: 'ROOT_SCOPE',
  });
});

test('rejects absent, duplicate, unknown, and authority-mismatched scope mappings', () => {
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:root', []).code, 'SCOPE_MAPPING_UNRESOLVED');
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:root', [rootMapping(), rootMapping()]).code, 'SCOPE_MAPPING_AMBIGUOUS');
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:nested', [rootMapping()]).code, 'SCOPE_MAPPING_AUTHORITY_MISMATCH');
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:root', [rootMapping({ source_authority_repo_id: 'other' })]).code, 'SCOPE_MAPPING_AUTHORITY_MISMATCH');
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:root', [rootMapping({ repository_id: 'not-a-uuid' })]).code, 'SCOPE_MAPPING_AUTHORITY_MISMATCH');
});

test('rejects a non-root repository or mapping kind masquerading as repo:root', () => {
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:root', [rootMapping({
    mapping_kind: 'NESTED_REPOSITORY',
    repository_kind: 'NESTED_GIT_REPOSITORY',
    parent_repository_id: '01a13137-1378-7df9-9968-53738dbf0e49',
  })]).code, 'SCOPE_MAPPING_KIND_MISMATCH');
});

test('accepts an evidence-classified non-root logical subscope only on the persisted root identity', () => {
  assert.equal(resolveGraphifyScopeRepositoryMappingV1('repo:packages', [rootMapping({
    membership_repository_scope: 'repo:packages',
    mapping_kind: 'LOGICAL_SUBSCOPE',
  })]).ok, true);
});
