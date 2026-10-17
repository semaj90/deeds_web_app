import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const frontendRequire = createRequire(new URL('../../sveltekit-frontend/package.json', import.meta.url));
const typescript = frontendRequire('typescript');
const owners = [
  ['scripts/atlas/backfill-tree-nodes.mjs', 'findExistingTreeNodeId'],
  ['scripts/atlas/ingest-tree-nodes.mjs', 'getExistingNodeId'],
  ['packages/parent-atlas/src/pipelines/backfill-tree-nodes.ts', 'findExistingTreeNodeId'],
];

function loadResolver(filePath, functionName) {
  const source = readFileSync(new URL(`../../${filePath}`, import.meta.url), 'utf8');
  const parsed = typescript.createSourceFile(filePath, source, typescript.ScriptTarget.Latest, true);
  const declarations = parsed.statements.filter((statement) =>
    typescript.isFunctionDeclaration(statement) && statement.name?.text === functionName);
  assert.equal(declarations.length, 1);
  const compiled = typescript.transpileModule(declarations[0].getText(parsed), {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);
  return runInNewContext(`${compiled.outputText}\n${functionName}`, {}, { timeout: 1000 });
}

for (const [filePath, functionName] of owners) {
  const resolve = loadResolver(filePath, functionName);
  const identity = { nodeType: 'chunk', sourceRef: 'repo:file.ts', packetKey: 'packet:one' };

  test(`${filePath}: canonical lookup binds full supplied identity and checks two rows`, async () => {
    let calls = 0;
    const client = { query: async (sql, params) => {
      calls++;
      assert.match(sql, /ledger_type = 'canonical'/);
      assert.match(sql, /LIMIT 2\b/);
      assert.doesNotMatch(sql, /ORDER BY|page_index_path/);
      assert.match(sql, /node_type = \$1/);
      assert.equal(params[0], 'chunk');
      assert.equal(params[Number(sql.match(/source_ref = \$(\d+)/)[1]) - 1], identity.sourceRef);
      assert.equal(params[Number(sql.match(/packet_key = \$(\d+)/)[1]) - 1], identity.packetKey);
      return { rows: [{ node_id: 'node:existing' }] };
    } };
    assert.equal(await resolve(client, identity), 'node:existing');
    assert.equal(calls, 1);
  });

  test(`${filePath}: no row is the only null result`, async () => {
    assert.equal(await resolve({ query: async () => ({ rows: [] }) }, identity), null);
  });

  test(`${filePath}: duplicate matches reject instead of selecting the oldest`, async () => {
    await assert.rejects(resolve({ query: async () => ({ rows: [
      { node_id: 'node:first' }, { node_id: 'node:second' },
    ] }) }, identity), /TREE_NODE_AMBIGUOUS_LOOKUP/);
  });

  test(`${filePath}: incomplete or malformed lookup cannot reach the database`, async () => {
    const client = { query: async () => assert.fail('invalid identity reached database') };
    for (const input of [
      { nodeType: 'document' },
      { nodeType: 'document', packetKey: 'packet:one' },
      { nodeType: 'chunk', sourceRef: 'repo:file.ts' },
      { nodeType: '', sourceRef: 'repo:file.ts' },
      { nodeType: 'document', sourceRef: '   ' },
      { ...identity, packetKey: 12 },
      { ...identity, sourceRef: '' },
    ]) {
      await assert.rejects(resolve(client, input), /TREE_NODE_(MISSING|INVALID)_LOOKUP_IDENTITY/);
    }
  });

  test(`${filePath}: malformed existing row cannot trigger insertion`, async () => {
    for (const nodeId of [undefined, null, '', ' ', 12]) {
      await assert.rejects(resolve({ query: async () => ({ rows: [{ node_id: nodeId }] }) }, identity),
        /TREE_NODE_INVALID_LOOKUP_RESULT/);
    }
  });

  test(`${filePath}: SQL-like identities remain parameters`, async () => {
    const sourceRef = "repo:' OR true --";
    const packetKey = "packet:' OR true --";
    await resolve({ query: async (sql, params) => {
      assert.ok(!sql.includes(sourceRef));
      assert.ok(!sql.includes(packetKey));
      assert.ok(params.includes(sourceRef));
      assert.ok(params.includes(packetKey));
      return { rows: [] };
    } }, { nodeType: 'chunk', sourceRef, packetKey });
  });

  test(`${filePath}: document and packet-only canonical grains remain supported`, async () => {
    for (const input of [
      { nodeType: 'document', sourceRef: 'repo:file.ts', packetKey: null },
      { nodeType: 'chunk', packetKey: 'packet:one' },
    ]) {
      assert.equal(await resolve({ query: async () => ({ rows: [{ node_id: 'node:existing' }] }) }, input),
        'node:existing');
    }
  });
}
