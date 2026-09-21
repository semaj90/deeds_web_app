import assert from 'node:assert/strict';
import { writeAtlasAstNodes } from './lib/atlas-ast-nodes-writer.mjs';

function fakeClient() {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
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
assert.equal(client.calls[0].values[13], digest);
assert.equal(client.calls[0].values[14], 'ast-grep-napi');
assert.equal(client.calls[0].values[15], '0.44.0');

await assert.rejects(
  () => writeAtlasAstNodes(fakeClient(), {
    sourceRef: 'sveltekit-frontend/src/example.ts',
    parserLanguage: 'typescript',
    parserName: 'ast-grep-napi',
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
assert.ok(!client.calls[0].sql.includes('ast_generation'), 'default path must not reference ast_generation');
assert.equal(client.calls[0].values.length, 19);

const genClient = fakeClient();
await writeAtlasAstNodes(genClient, {
  sourceRef: 'sveltekit-frontend/src/example.ts',
  parserLanguage: 'typescript',
  parserName: 'ast-grep-napi',
  astGeneration: 'sept_v2',
  nodes: [{
    kind: 'file', qualifiedSymbol: 'example.ts', startByte: 0, endByte: 12, startLine: 1, endLine: 1,
    sourceContentDigest: digest, parentIndex: null,
  }],
});
assert.match(genClient.calls[0].sql, /source_revision, ast_generation\s*\)/);
assert.match(genClient.calls[0].sql, /\$19,\$20\s*\)/);
assert.equal(genClient.calls[0].values.length, 20);
assert.equal(genClient.calls[0].values[19], 'sept_v2');

await assert.rejects(
  () => writeAtlasAstNodes(fakeClient(), {
    sourceRef: 'sveltekit-frontend/src/example.ts',
    parserLanguage: 'typescript',
    parserName: 'ast-grep-napi',
    astGeneration: "sept_v2'; DROP TABLE x;--",
    nodes: [],
  }),
  /AST_GENERATION_INVALID/,
);

console.log('ast-writer-contract: PASS');
