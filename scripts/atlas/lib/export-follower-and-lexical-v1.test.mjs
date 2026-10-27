import test from 'node:test';
import assert from 'node:assert/strict';
import { followExport } from './export-follower-v1.mjs';
import { classifyOccurrence, topLevelDeclarations } from './lexical-reference-classifier-v1.mjs';

const files = {
  'src/a.ts': 'export const A = 1;\nexport function f() {}\nexport default class K {}\n',
  'src/barrel.ts': "export { A as Alias, f } from './a';\nexport * from './b';\nexport * from './c';\nconst local = 1;\nexport { local as exportedLocal };\n",
  'src/b.ts': 'export const OnlyB = 1;\nexport const Both = 1;\n',
  'src/c.ts': 'export const OnlyC = 1;\nexport const Both = 2;\n',
  'src/cycle1.ts': "export { X } from './cycle2';\n",
  'src/cycle2.ts': "export { X } from './cycle1';\n",
  'src/ext.ts': "export { z } from 'zod';\n",
  'src/missing.ts': "export { Q } from './nope';\n",
};
const manifest = new Map(Object.keys(files).map((k) => [k, 'r']));
const follow = (file, name) => followExport({ file, name, manifest, readSource: (r) => files[r] ?? null });

test('direct declarations and default exports resolve to the declaring file', () => {
  assert.equal(follow('src/a.ts', 'A').status, 'DECLARED');
  assert.equal(follow('src/a.ts', 'default').definingFile, 'src/a.ts');
  assert.equal(follow('src/a.ts', 'Nope').status, 'NOT_EXPORTED');
});

test('re-exports with renames follow to the original declaration', () => {
  const r = follow('src/barrel.ts', 'Alias');
  assert.equal(r.status, 'REEXPORT_RESOLVED');
  assert.equal(r.definingFile, 'src/a.ts');
  assert.equal(r.definingName, 'A');
  assert.equal(follow('src/barrel.ts', 'f').definingFile, 'src/a.ts');
  assert.equal(follow('src/barrel.ts', 'exportedLocal').status, 'LOCAL_ALIAS_RESOLVED');
});

test('star re-exports: unique supplier resolves, two suppliers are ambiguous, default is never supplied by a star', () => {
  assert.equal(follow('src/barrel.ts', 'OnlyB').definingFile, 'src/b.ts');
  assert.equal(follow('src/barrel.ts', 'OnlyC').viaStar, './c');
  const both = follow('src/barrel.ts', 'Both');
  assert.equal(both.status, 'STAR_AMBIGUOUS');
  assert.deepEqual(both.candidates, ['src/b.ts', 'src/c.ts']);
  assert.equal(follow('src/barrel.ts', 'default').status, 'NOT_EXPORTED');
});

test('cycles, external and unresolved re-exports, missing sources and depth limits are typed', () => {
  assert.equal(follow('src/cycle1.ts', 'X').status, 'CYCLE');
  assert.equal(follow('src/ext.ts', 'z').status, 'EXTERNAL_REEXPORT');
  assert.equal(follow('src/missing.ts', 'Q').status, 'MODULE_UNRESOLVED');
  assert.equal(follow('src/absent.ts', 'x').status, 'SOURCE_UNAVAILABLE');
  assert.equal(followExport({ file: 'src/barrel.ts', name: 'Alias', manifest, readSource: (r) => files[r] ?? null, maxDepth: -1 }).status, 'DEPTH_EXCEEDED');
});

const bindings = new Map([['createHash', { specifier: 'node:crypto', imported: 'createHash', kind: 'named' }], ['aliased', { specifier: './x', imported: 'orig', kind: 'named' }]]);
const classify = (source, line, column, name, extra = {}) => classifyOccurrence({ source, line, column, name, importBindings: bindings, ...extra });

test('lexical: member access is never resolved by name', () => {
  assert.equal(classify('const h = crypto.createHash("x");', 1, 17, 'createHash').kind, 'MEMBER_ACCESS');
  assert.equal(classify('a?.run();', 1, 3, 'run').kind, 'MEMBER_ACCESS');
});

test('lexical: imported bindings (including aliases) are distinguished from locals and globals', () => {
  assert.equal(classify('createHash("sha256");', 1, 0, 'createHash').kind, 'IMPORTED');
  assert.equal(classify('aliased();', 1, 0, 'aliased').binding.imported, 'orig');
  assert.equal(classify('function helper() {}\nhelper();', 2, 0, 'helper').kind, 'LOCAL_TOP_LEVEL_DECLARATION');
  assert.equal(classify('expect(1).toBe(1);', 1, 0, 'expect').kind, 'KNOWN_GLOBAL_OR_BUILTIN');
  assert.equal(classify('mystery();', 1, 0, 'mystery').kind, 'FREE_NAME_UNRESOLVED');
});

test('lexical: a local binding in the enclosing chunk shadows an import and blocks resolution', () => {
  const src = 'function run(createHash) {\n  return createHash("x");\n}';
  assert.equal(classify(src, 2, 9, 'createHash', { enclosing: { startLine: 1, endLine: 3 } }).kind, 'IMPORTED_POSSIBLY_SHADOWED');
  const src2 = 'function run() {\n  const createHash = make();\n  return createHash("x");\n}';
  const out = classify(src2, 3, 9, 'createHash', { enclosing: { startLine: 1, endLine: 4 } });
  assert.equal(out.kind, 'IMPORTED_POSSIBLY_SHADOWED');
  assert.equal(out.resolvable, false);
  const free = classify('function run() {\n  const t = 1;\n  return other(t);\n}', 3, 9, 'other', { enclosing: { startLine: 1, endLine: 4 } });
  assert.equal(free.kind, 'FREE_NAME_UNRESOLVED');
});

test('top-level declarations list functions, classes, consts, types and interfaces only at line start', () => {
  const names = topLevelDeclarations('export const A = 1;\nfunction b() {}\n  const nested = 1;\ntype T = string;\ninterface I {}\n');
  assert.deepEqual([...names].sort(), ['A', 'I', 'T', 'b']);
});
