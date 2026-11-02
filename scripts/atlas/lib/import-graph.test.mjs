import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildImportGraph } from './import-graph.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-graph-'));
  const write = (rel, text) => { const full = path.join(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, text); return { path: rel, fullPath: full, extension: path.extname(rel) }; };
  return [
    write('app/src/lib/a.ts', "import { b } from './b';\nimport c from '$lib/c';\nimport x from 'left-pad';"),
    write('app/src/lib/b.ts', 'export const b = 1;'),
    write('app/src/lib/c/index.ts', 'export default 1;'),
  ];
}

test('default behavior is unchanged: $lib is not resolved and counts as external', () => {
  const { edges, externalImports } = buildImportGraph(fixture());
  assert.deepEqual(edges.map((e) => `${e.from}>${e.to}`), ['app/src/lib/a.ts>app/src/lib/b.ts']);
  assert.ok(externalImports.some((e) => e.module === '$lib/c'));
});

test('with an alias, $lib resolves (incl. index files) and is not counted as external', () => {
  const { edges, externalImports } = buildImportGraph(fixture(), { aliases: [{ prefix: '$lib/', target: 'app/src/lib/' }] });
  assert.deepEqual(edges.map((e) => e.to), ['app/src/lib/b.ts', 'app/src/lib/c/index.ts']);
  assert.deepEqual(externalImports.map((e) => e.module), ['left-pad']);
});
