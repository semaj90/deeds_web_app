import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAtlasAstNodesIndependentReadbackV1 } from './atlas-ast-nodes-independent-readback-v1.mjs';

const expected = {
  treeNodeId: 'node-1',
  relativePath: 'src/example.ts',
  sourceRef: 'src/example.ts',
  nodeKind: 'function',
  qualifiedSymbol: 'example',
  startByte: 10,
  endByte: 32,
  lineStart: 2,
  lineEnd: 4,
  workspaceId: '625743d2-092b-4fa8-abe0-9dc094920c80',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  sourceContentDigest: 'b'.repeat(64),
  parserName: 'ast-grep-napi',
  parserVersion: '0.45.3',
  sourceAuthorityRepoId: 'deeds-web-app',
};
const workspaceRevision = `sha256:${'c'.repeat(64)}`;

function readbackRow(overrides = {}) {
  return {
    tree_node_id: expected.treeNodeId,
    repo_id: expected.repoId,
    relative_path: expected.relativePath,
    node_kind: expected.nodeKind,
    qualified_symbol: expected.qualifiedSymbol,
    start_byte: String(expected.startByte),
    end_byte: String(expected.endByte),
    line_start: expected.lineStart,
    line_end: expected.lineEnd,
    workspace_id: expected.workspaceId,
    source_revision: expected.sourceRevision,
    source_content_hash: expected.sourceContentDigest,
    parser_name: expected.parserName,
    parser_version: expected.parserVersion,
    binding_source_ref: expected.sourceRef,
    binding_workspace_revision: workspaceRevision,
    binding_source_revision: expected.sourceRevision,
    binding_content_digest: expected.sourceContentDigest,
    source_authority_repo_id: expected.sourceAuthorityRepoId,
    ...overrides,
  };
}

test('proves an AST row through an independent exact workspace/source binding join', async () => {
  let queryText = '';
  const result = await verifyAtlasAstNodesIndependentReadbackV1({
    async query(text, params) {
      queryText = String(text);
      assert.deepEqual(params, [[expected.treeNodeId], workspaceRevision, expected.sourceAuthorityRepoId]);
      return { rows: [readbackRow()] };
    },
  }, { expectedRows: [expected], workspaceId: expected.workspaceId, workspaceRevision, sourceAuthorityRepoId: expected.sourceAuthorityRepoId });

  assert.equal(result.status, 'INDEXED_READBACK_PROVEN');
  assert.match(queryText, /atlas_repository_identity/);
  assert.match(queryText, /atlas_workspace_source_bindings/);
  assert.match(queryText, /b\.workspace_revision = \$2/);
  assert.deepEqual(result.mismatches, []);
});

test('fails closed when the independent workspace binding is absent or mismatched', async () => {
  const result = await verifyAtlasAstNodesIndependentReadbackV1({
    async query() {
      return { rows: [readbackRow({ binding_workspace_revision: null, binding_content_digest: 'wrong' })] };
    },
  }, { expectedRows: [expected], workspaceId: expected.workspaceId, workspaceRevision, sourceAuthorityRepoId: expected.sourceAuthorityRepoId });

  assert.equal(result.status, 'INDEPENDENT_READBACK_FAILED');
  assert.deepEqual(result.mismatches, [{ treeNodeId: expected.treeNodeId, fields: ['source_content_digest', 'workspace_revision_binding'] }]);
});

test('rejects duplicate lineage rows instead of choosing one', async () => {
  const result = await verifyAtlasAstNodesIndependentReadbackV1({
    async query() {
      return { rows: [readbackRow(), readbackRow()] };
    },
  }, { expectedRows: [expected], workspaceId: expected.workspaceId, workspaceRevision, sourceAuthorityRepoId: expected.sourceAuthorityRepoId });

  assert.equal(result.status, 'INDEPENDENT_READBACK_FAILED');
  assert.deepEqual(result.mismatches, [{ treeNodeId: expected.treeNodeId, fields: ['ROW_OR_BINDING_AMBIGUOUS'] }]);
});

test('rejects invalid workspace revision before querying', async () => {
  let queryCalled = false;
  await assert.rejects(
    verifyAtlasAstNodesIndependentReadbackV1({ async query() { queryCalled = true; return { rows: [] }; } }, {
      expectedRows: [expected], workspaceId: expected.workspaceId, workspaceRevision: 'workspace:0', sourceAuthorityRepoId: expected.sourceAuthorityRepoId,
    }),
    { message: 'AST_READBACK_WORKSPACE_REVISION_INVALID' },
  );
  assert.equal(queryCalled, false);
});
