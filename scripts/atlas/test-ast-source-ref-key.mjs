import assert from 'node:assert/strict';
import { buildAstSourceRefKey, normalizeAstNodeKind, normalizeAstSourceRef } from './lib/ast-source-ref-key.mjs';

assert.equal(normalizeAstSourceRef('.\\sveltekit-frontend\\src\\x.ts'), 'sveltekit-frontend/src/x.ts');
assert.equal(normalizeAstNodeKind('method_definition'), 'function');
assert.equal(normalizeAstNodeKind('interface'), 'type');
assert.equal(buildAstSourceRefKey('.\\src\\x.ts', 'method_definition', 'Outer.inner'), 'src/x.ts#function:Outer.inner');
assert.equal(buildAstSourceRefKey('src/x.ts', 'function', '  foo   bar '), 'src/x.ts#function:foo bar');
assert.equal(buildAstSourceRefKey('', 'function', 'foo'), null);

console.log(JSON.stringify({ schema: 'atlas.ast-source-ref-key-proof.v1', status: 'PASS', canonicalWrites: false }));
