import test from 'node:test';
import assert from 'node:assert/strict';
import { findDeclarations, findSvelteDeclarations, enclosingDeclaration } from './enclosing-declaration-v1.mjs';

const src = [
  'import { h } from "./h";',
  'export function outer(a) { const inner = () => h(a); class K { m() { return h(1); } } return [1].map((x) => h(x)); }',
  'export const arrow = async () => { h(2); };',
  'const table = { run: () => h(3) };',
  'h(4);',
  '',
].join('\n');

const at = (needle, nth = 0) => { let i = -1; for (let k = 0; k <= nth; k += 1) i = src.indexOf(needle, i + 1); const s = Buffer.byteLength(src.slice(0, i), 'utf8'); return [s, s + needle.length]; };

test('named functions, methods, classes, arrow consts and object-property arrows are found with qualified names', () => {
  const r = findDeclarations(src);
  assert.equal(r.outcome, 'FOUND');
  const names = r.declarations.map((d) => d.qualifiedName);
  assert.deepEqual(names.sort(), ['arrow', 'outer', 'outer.K', 'outer.K.m', 'outer.inner', 'run'].sort());
});

test('the innermost named declaration encloses a use; anonymous callbacks resolve to the named ancestor', () => {
  const { declarations } = findDeclarations(src);
  assert.equal(enclosingDeclaration(declarations, ...at('h(a)')).qualifiedName, 'outer.inner');
  assert.equal(enclosingDeclaration(declarations, ...at('h(1)')).qualifiedName, 'outer.K.m');
  assert.equal(enclosingDeclaration(declarations, ...at('h(x)')).qualifiedName, 'outer');
  assert.equal(enclosingDeclaration(declarations, ...at('h(2)')).qualifiedName, 'arrow');
  assert.equal(enclosingDeclaration(declarations, ...at('h(3)')).qualifiedName, 'run');
});

test('a top-level use is file level and every result is non-canonical', () => {
  const { declarations } = findDeclarations(src);
  const top = enclosingDeclaration(declarations, ...at('h(4)'));
  assert.equal(top.status, 'FILE_OR_COMPONENT_LEVEL');
  assert.equal(top.canonical, false);
  assert.equal(enclosingDeclaration(declarations, ...at('h(1)')).canonical, false);
});

test('spans are UTF-8 byte offsets and read back to the declaration text after multibyte characters', () => {
  const s = '// 🚀 héllo\nfunction ünï() { return 1; }\n';
  const d = findDeclarations(s).declarations[0];
  assert.equal(d.name, 'ünï');
  assert.equal(Buffer.from(s, 'utf8').subarray(d.startByte, d.endByte).toString('utf8'), 'function ünï() { return 1; }');
});

test('syntax errors and unsupported languages are typed, not guessed', () => {
  assert.equal(findDeclarations('function (').outcome, 'PARSE_ERROR');
  assert.equal(findDeclarations('x', 'python').outcome, 'UNSUPPORTED_LANGUAGE');
});

test('svelte script declarations are shifted to absolute .svelte byte offsets, including after template text and CRLF', () => {
  const svelte = '<p>🚀</p>\r\n<script lang="ts">\r\n  function save() { return helper(); }\r\n</script>\r\n<button onclick={() => save()}>x</button>\r\n';
  const r = findSvelteDeclarations(svelte);
  assert.equal(r.outcome, 'FOUND');
  const d = r.declarations.find((x) => x.name === 'save');
  assert.equal(Buffer.from(svelte, 'utf8').subarray(d.startByte, d.endByte).toString('utf8'), 'function save() { return helper(); }');
  const use = Buffer.from(svelte, 'utf8').indexOf('helper()');
  assert.equal(enclosingDeclaration(r.declarations, use, use + 8).qualifiedName, 'save');
  // an inline template handler has no named declaration
  const handler = Buffer.from(svelte, 'utf8').indexOf('save()}');
  assert.equal(enclosingDeclaration(r.declarations, handler, handler + 4).status, 'FILE_OR_COMPONENT_LEVEL');
});

test('replay is deterministic', () => {
  assert.equal(JSON.stringify(findDeclarations(src)), JSON.stringify(findDeclarations(src)));
});
