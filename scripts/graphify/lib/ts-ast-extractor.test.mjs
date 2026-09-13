import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import { extractSymbolsFromSource } from './ts-ast-extractor.mjs';

test('extracts a top-level function with correct byte offsets and fingerprint', () => {
  const source = `export function PATCH() { return authorizeCase(); }\n`;
  const symbols = extractSymbolsFromSource(source, 'fixture.ts');

  const fn = symbols.find((s) => s.kind === 'function' && s.name === 'PATCH');
  assert.ok(fn, 'expected a function symbol named PATCH');
  assert.equal(fn.start_byte, source.indexOf('export function PATCH'));
  assert.equal(fn.end_byte, source.indexOf('\n'));
  assert.equal(fn.parent_chain.length, 0);

  const expectedText = source.slice(fn.start_byte, fn.end_byte);
  assert.equal(fn.signature_text, expectedText.slice(0, 400));
  assert.equal(fn.ast_fingerprint, crypto.createHash('sha256').update(expectedText).digest('hex'));
  assert.equal(fn.ast_fingerprint.length, 64);
});

test('a function declared inside another function carries a parent_chain entry', () => {
  // Class bodies hold MethodDeclaration nodes, not FunctionDeclaration nodes -- out of scope
  // for this v1 extractor's handled-kind list (function/class/interface/import/export/enum/
  // type_alias). A nested function DECLARATION (only valid inside another function/module body)
  // is the correct fixture for exercising the parent_chain container-stack mechanism.
  const source = `function outer() {\n  function inner() { return 1; }\n  return inner();\n}\n`;
  const symbols = extractSymbolsFromSource(source, 'fixture.ts');

  const outer = symbols.find((s) => s.kind === 'function' && s.name === 'outer');
  assert.ok(outer, 'expected function symbol outer');
  assert.equal(outer.parent_chain.length, 0);

  const inner = symbols.find((s) => s.kind === 'function' && s.name === 'inner');
  assert.ok(inner, 'expected nested function symbol inner');
  assert.deepEqual(inner.parent_chain, [{ kind: 'function', name: 'outer' }]);
});

test('interface, enum, and type_alias declarations are all captured', () => {
  const source = [
    'interface Shape { area(): number; }',
    'enum Color { Red, Green, Blue }',
    'type Point = { x: number; y: number };',
  ].join('\n');
  const symbols = extractSymbolsFromSource(source, 'fixture.ts');

  assert.ok(symbols.some((s) => s.kind === 'interface' && s.name === 'Shape'));
  assert.ok(symbols.some((s) => s.kind === 'enum' && s.name === 'Color'));
  assert.ok(symbols.some((s) => s.kind === 'type_alias' && s.name === 'Point'));
});

test('two structurally different symbols never collide on ast_fingerprint', () => {
  const source = `function a() { return 1; }\nfunction b() { return 2; }\n`;
  const symbols = extractSymbolsFromSource(source, 'fixture.ts');
  const fingerprints = symbols.map((s) => s.ast_fingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
});
