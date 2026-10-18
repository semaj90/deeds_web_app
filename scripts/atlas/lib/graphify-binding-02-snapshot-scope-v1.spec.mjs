import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRootWorkspaceSnapshotScopeV1 } from './graphify-binding-02-snapshot-scope-v1.mjs';

const root = { relativePath: '', kind: 'ROOT', head: 'a'.repeat(40) };
const rootSource = { sourceRef: 'src/a.ts', repositoryId: 'repo:root', repositoryPath: '', sourceRevision: 'sha256:a' };
const nestedSource = { sourceRef: 'vendor/b.ts', repositoryId: 'repo:vendor', repositoryPath: 'vendor', sourceRevision: 'sha256:b' };

test('selects only exact root-repository sources from a multi-repository snapshot', () => {
  const result = selectRootWorkspaceSnapshotScopeV1({
    repositories: [root, { relativePath: 'vendor', kind: 'SUBMODULE' }],
    sources: [rootSource, nestedSource],
  });
  assert.equal(result.rootRepository, root);
  assert.deepEqual(result.rootSources, [rootSource]);
  assert.equal(result.excludedNestedRepositorySourceCount, 1);
});

test('fails closed when root repository identity is missing or ambiguous', () => {
  assert.throws(() => selectRootWorkspaceSnapshotScopeV1({ repositories: [], sources: [rootSource] }), /ROOT_REPOSITORY_NOT_UNIQUE/);
  assert.throws(() => selectRootWorkspaceSnapshotScopeV1({ repositories: [root, root], sources: [rootSource] }), /ROOT_REPOSITORY_NOT_UNIQUE/);
});

test('rejects duplicate canonical root source references', () => {
  assert.throws(() => selectRootWorkspaceSnapshotScopeV1({
    repositories: [root], sources: [rootSource, { ...rootSource }],
  }), /ROOT_SOURCE_REF_DUPLICATE/);
});
