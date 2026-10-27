import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRepositoryScopes } from './repository-scope-resolution-core.mjs';

const ROOT = { repository_id: '11111111-1111-7111-8111-111111111111', source_authority_repo_id: 'deeds-web-app', repository_kind: 'ROOT', parent_repository_id: null };
const nested = (name, parent = ROOT.repository_id, id = '22222222-2222-7222-8222-222222222222') => ({ repository_id: id, source_authority_repo_id: name, gitmodule_name: name, repository_kind: 'NESTED_GIT_REPOSITORY', parent_repository_id: parent });
const byScope = (results, scope) => results.find((r) => r.scope === scope);

test('root scope maps only to the single persisted root identity, whatever its UUID is', () => {
  const [r] = resolveRepositoryScopes({ scopes: ['repo:root'], identityRows: [ROOT] });
  assert.equal(r.status, 'MAPPED');
  assert.equal(r.repositoryId, ROOT.repository_id);
});

test('missing persisted root is unresolved, never a default', () => {
  const [r] = resolveRepositoryScopes({ scopes: ['repo:root'], identityRows: [] });
  assert.equal(r.status, 'SCOPE_UNRESOLVED');
  assert.equal(r.repositoryId, null);
});

test('two root identities are ambiguous', () => {
  const [r] = resolveRepositoryScopes({ scopes: ['repo:root'], identityRows: [ROOT, { ...ROOT, repository_id: '33333333-3333-7333-8333-333333333333', source_authority_repo_id: 'other' }] });
  assert.equal(r.status, 'SCOPE_AMBIGUOUS');
});

test('nested scopes without a persisted row are SCOPE_UNRESOLVED and never fall back to root', () => {
  const results = resolveRepositoryScopes({ scopes: ['repo:root', 'repo:turbovec', 'models/embeddinggemma_300m'], identityRows: [ROOT] });
  assert.equal(byScope(results, 'repo:turbovec').status, 'SCOPE_UNRESOLVED');
  assert.equal(byScope(results, 'models/embeddinggemma_300m').reason, 'SCOPE_LABEL_NOT_REPO_PREFIXED');
  assert.ok(results.filter((r) => r.scope !== 'repo:root').every((r) => r.repositoryId === null));
});

test('an exact nested row whose parent is the root maps; a wrong parent is a mismatch', () => {
  const ok = resolveRepositoryScopes({ scopes: ['repo:turbovec'], identityRows: [ROOT, nested('turbovec')] });
  assert.equal(ok[0].status, 'MAPPED');
  const wrong = resolveRepositoryScopes({ scopes: ['repo:turbovec'], identityRows: [ROOT, nested('turbovec', '99999999-9999-7999-8999-999999999999')] });
  assert.equal(wrong[0].status, 'SCOPE_MISMATCH');
});

test('case-fold collisions and duplicate nested identities are ambiguous', () => {
  const folded = resolveRepositoryScopes({ scopes: ['repo:Turbovec', 'repo:turbovec'], identityRows: [ROOT] });
  assert.ok(folded.some((r) => r.status === 'SCOPE_AMBIGUOUS'));
  const dup = resolveRepositoryScopes({ scopes: ['repo:turbovec'], identityRows: [ROOT, nested('turbovec'), nested('turbovec', ROOT.repository_id, '44444444-4444-7444-8444-444444444444')] });
  assert.equal(dup[0].status, 'SCOPE_AMBIGUOUS');
});

test('rows with non-UUID repository ids are ignored', () => {
  const [r] = resolveRepositoryScopes({ scopes: ['repo:root'], identityRows: [{ ...ROOT, repository_id: 'repo:root' }] });
  assert.equal(r.status, 'SCOPE_UNRESOLVED');
});
