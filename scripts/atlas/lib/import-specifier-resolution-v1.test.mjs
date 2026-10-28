import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportStatement, resolveSpecifier, listExports } from './import-specifier-resolution-v1.mjs';

const manifest = new Map([
  ['src/lib/a.ts', 'r1'], ['src/lib/b/index.ts', 'r2'], ['src/lib/c.svelte', 'r3'], ['src/lib/dup.ts', 'r4'], ['src/lib/dup.js', 'r5'], ['src/lib/ui/Button.svelte', 'r6'],
]);
const aliases = [{ prefix: '$lib/', target: 'src/lib/' }, { prefix: '$lib/server/db/client', target: 'src/lib/server/db/client.ts' }];
const resolve = (fromRel, specifier) => resolveSpecifier({ fromRel, specifier, manifest, aliases });

test('import forms are classified: named, aliased, default, namespace, side-effect, type-only', () => {
  assert.deepEqual(parseImportStatement("import { a, b as c } from './x';").bindings, [{ kind: 'named', imported: 'a', local: 'a', typeOnly: false }, { kind: 'named', imported: 'b', local: 'c', typeOnly: false }]);
  assert.equal(parseImportStatement("import Foo from './x';").form, 'default');
  assert.equal(parseImportStatement("import Foo, { a } from './x';").bindings[0].kind, 'default');
  assert.equal(parseImportStatement("import * as ns from './x';").form, 'namespace');
  assert.equal(parseImportStatement("import './x.css';").form, 'side-effect');
  const t = parseImportStatement("import type { T } from './x';");
  assert.equal(t.typeOnly, true);
  assert.equal(t.bindings[0].imported, 'T');
  assert.equal(parseImportStatement('const x = 1;'), null);
});

test('relative resolution: extension probing, index files, and .js specifiers mapping to .ts sources', () => {
  assert.equal(resolve('src/lib/z.ts', './a').target, 'src/lib/a.ts');
  assert.equal(resolve('src/lib/z.ts', './a.js').target, 'src/lib/a.ts');
  assert.equal(resolve('src/lib/z.ts', './b').target, 'src/lib/b/index.ts');
  assert.equal(resolve('src/lib/z.ts', './c.svelte').target, 'src/lib/c.svelte');
  assert.equal(resolve('src/lib/x/y.ts', '../a').target, 'src/lib/a.ts');
});

test('aliases: wildcard $lib, and a more specific exact alias wins', () => {
  assert.equal(resolve('src/routes/p.ts', '$lib/a.js').target, 'src/lib/a.ts');
  assert.equal(resolve('src/routes/p.ts', '$lib/ui/Button.svelte').target, 'src/lib/ui/Button.svelte');
});

test('missing, ambiguous, external and escaping specifiers are typed and never guessed', () => {
  assert.equal(resolve('src/lib/z.ts', './nope').reason, 'TARGET_NOT_IN_ADMITTED_MANIFEST');
  assert.equal(resolve('src/lib/z.ts', './dup').status, 'MODULE_AMBIGUOUS');
  assert.equal(resolve('src/lib/z.ts', 'node:crypto').status, 'EXTERNAL_MODULE');
  assert.equal(resolve('src/lib/z.ts', 'zod').status, 'EXTERNAL_MODULE');
  assert.equal(resolve('a.ts', '../../outside').reason, 'ESCAPES_REPOSITORY');
});

test('export inventory: declarations, lists with aliases, default, re-exports and star re-exports', () => {
  const src = [
    'export const A = 1;', 'export async function f() {}', 'export class K {}', 'export interface I {}', 'export type T = string;',
    "export { x, y as z } from './m';", 'export { local as renamed };', 'export default function () {}', "export * from './all';", 'const hidden = 1;',
  ].join('\n');
  const out = listExports(src);
  assert.deepEqual(out.names, ['A', 'I', 'K', 'T', 'f', 'renamed', 'x', 'z']);
  assert.equal(out.hasDefault, true);
  assert.equal(out.starReExport, true);
  assert.deepEqual(out.reExports.map((r) => r.exported), ['x', 'z']);
  assert.ok(!out.names.includes('hidden'));
  assert.equal(listExports('const a = 1;').hasDefault, false);
});

test('a comment or string mentioning export does not create an export', () => {
  assert.deepEqual(listExports("// export const nope = 1;\nconst s = 'export const x = 2';").names, []);
});
