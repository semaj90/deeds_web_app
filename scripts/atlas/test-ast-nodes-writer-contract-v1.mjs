import assert from 'node:assert/strict';
import { writeAtlasAstNodes } from './lib/atlas-ast-nodes-writer.mjs';

function fakeClient() {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (String(sql).includes('atlas_repository_identity')) {
        return { rowCount: 1, rows: [{ repository_id: '01a13137-1378-7df9-9968-53738dbf0e48' }] };
      }
      return { rowCount: 1, rows: [{ tree_node_id: values[0] }] };
    },
  };
}

const client = fakeClient();
const digest = 'sha256:whole-file-digest';
const result = await writeAtlasAstNodes(client, {
  sourceRef: 'sveltekit-frontend/src/example.ts',
  parserLanguage: 'typescript',
  parserName: 'ast-grep-napi',
  parserVersion: '0.44.0',
  sourceRevision: 'sha256:source-revision',
  workspaceId: 'workspace-fixture',
  nodes: [{
    kind: 'file',
    qualifiedSymbol: 'example.ts',
    startByte: 0,
    endByte: 12,
    startLine: 1,
    endLine: 1,
    sourceContentDigest: digest,
    parentIndex: null,
  }],
});

assert.equal(result.inserted, 1);
assert.deepEqual(result.insertedFlags, [true]);
const insertCall = client.calls.find((call) => call.sql.includes('INSERT INTO atlas_ast_nodes'));
assert.ok(client.calls.some((call) => call.sql.includes('atlas_repository_identity')));
assert.equal(insertCall.values[13], digest);
assert.equal(insertCall.values[14], 'ast-grep-napi');
assert.equal(insertCall.values[15], '0.44.0');

await assert.rejects(
  () => writeAtlasAstNodes(fakeClient(), {
    sourceRef: 'sveltekit-frontend/src/example.ts',
    parserLanguage: 'typescript',
    parserName: 'ast-grep-napi',
    parserVersion: '0.44.0',
    workspaceId: 'workspace-fixture',
    sourceRevision: 'sha256:source-revision',
    nodes: [{
      kind: 'file',
      qualifiedSymbol: 'example.ts',
      startByte: 0,
      endByte: 12,
      startLine: 1,
      endLine: 1,
      contentHash: 'ambiguous-node-hash',
      parentIndex: null,
    }],
  }),
  /SOURCE_CONTENT_DIGEST_REQUIRED:0/,
);

// ast_generation (20260920 migration): omitted => the INSERT does not name the column at all, so the
// writer still works against a schema without the migration; supplied => column + value are added.
assert.ok(!insertCall.sql.includes('ast_generation'), 'default path must not reference ast_generation');
assert.equal(insertCall.values.length, 19);

const genClient = fakeClient();
await writeAtlasAstNodes(genClient, {
  sourceRef: 'sveltekit-frontend/src/example.ts',
  parserLanguage: 'typescript',
  parserName: 'ast-grep-napi',
  parserVersion: '0.44.0',
  workspaceId: 'workspace-fixture',
  sourceRevision: 'sha256:source-revision',
  astGeneration: 'sept_v2',
  nodes: [{
    kind: 'file', qualifiedSymbol: 'example.ts', startByte: 0, endByte: 12, startLine: 1, endLine: 1,
    sourceContentDigest: digest, parentIndex: null,
  }],
});
const genInsertCall = genClient.calls.find((call) => call.sql.includes('INSERT INTO atlas_ast_nodes'));
assert.match(genInsertCall.sql, /source_revision, ast_generation\s*\)/);
assert.match(genInsertCall.sql, /\$19,\$20\s*\)/);
assert.equal(genInsertCall.values.length, 20);
assert.equal(genInsertCall.values[19], 'sept_v2');

await assert.rejects(
  () => writeAtlasAstNodes(fakeClient(), {
    sourceRef: 'sveltekit-frontend/src/example.ts',
    parserLanguage: 'typescript',
    parserName: 'ast-grep-napi',
    parserVersion: '0.44.0',
    astGeneration: "sept_v2'; DROP TABLE x;--",
    nodes: [],
  }),
  /AST_GENERATION_INVALID/,
);

console.log('ast-writer-contract: PASS');
