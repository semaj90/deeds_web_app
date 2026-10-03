import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSymbolsFromSource } from './ts-ast-extractor.mjs';

test('ambient modules qualify identical exports with distinct module ancestry', () => {
  const symbols = extractSymbolsFromSource(`declare module 'a' { const mod: any; export default mod; }
declare module 'b' { const mod: any; export default mod; }`, 'shim.d.ts');
  const exports = symbols.filter(symbol => symbol.kind === 'export');
  assert.equal(exports.length, 2);
  assert.deepEqual(exports.map(symbol => symbol.parent_chain), [
    [{ kind: 'module', name: 'a' }], [{ kind: 'module', name: 'b' }],
  ]);
  assert.equal(symbols.filter(symbol => symbol.kind === 'module').length, 2);
});

test('nested namespaces preserve the complete declaration parent chain', () => {
  const symbols = extractSymbolsFromSource('namespace A { export namespace B { export interface X {} } }', 'namespace.ts');
  assert.deepEqual(symbols.find(symbol => symbol.kind === 'interface').parent_chain,
    [{ kind: 'module', name: 'A' }, { kind: 'module', name: 'B' }]);
});
