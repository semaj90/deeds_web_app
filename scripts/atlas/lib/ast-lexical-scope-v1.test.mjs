import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLexicalScopes, verifySpans } from './ast-lexical-scope-v1.mjs';

const analyze = (source, language = 'typescript') => analyzeLexicalScopes({ source, language });
const find = (result, name, nth = 0) => result.occurrences.filter((o) => o.name === name)[nth];

test('imports, locals, globals, free names and type names are distinguished', () => {
  const r = analyze("import { a } from './a';\nconst l = 1;\nfunction f(): Unknown { return a + l + Math.max(1) + nope; }");
  assert.equal(find(r, 'a').outcome, 'IMPORT_BINDING_VERIFIED');
  assert.equal(find(r, 'l').outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'Math').outcome, 'GLOBAL_OR_BUILTIN_CANDIDATE');
  assert.equal(find(r, 'nope').outcome, 'FREE_IDENTIFIER');
  assert.equal(find(r, 'Unknown').outcome, 'TYPE_NAMESPACE_UNRESOLVED');
});

test('aliased imports bind the local alias, not the imported name', () => {
  const r = analyze("import { orig as alias } from './x';\nalias();\norig();");
  assert.equal(find(r, 'alias', 0).outcome, 'IMPORT_BINDING_VERIFIED');
  assert.equal(find(r, 'orig').outcome, 'FREE_IDENTIFIER');
});

test('default and namespace imports and type-only imports bind', () => {
  const r = analyze("import D, * as ns from './x';\nimport type { T } from './t';\nD(); ns.go(); const v: T = 1;");
  assert.equal(find(r, 'D').outcome, 'IMPORT_BINDING_VERIFIED');
  assert.equal(find(r, 'ns').outcome, 'IMPORT_BINDING_VERIFIED');
  assert.equal(find(r, 'T').outcome, 'IMPORT_BINDING_VERIFIED');
  assert.equal(find(r, 'go').outcome, 'MEMBER_ACCESS_UNRESOLVED');
});

test('parameter shadowing of an import is reported as shadowed, and the outer use stays an import', () => {
  const r = analyze("import { run } from './x';\nfunction f(run) { return run(); }\nrun();");
  assert.equal(find(r, 'run', 0).outcome, 'SHADOWED_BINDING');
  assert.deepEqual(find(r, 'run', 0).shadows, ['import']);
  assert.equal(find(r, 'run', 1).outcome, 'IMPORT_BINDING_VERIFIED');
});

test('destructuring and rest parameters and defaults are recovered', () => {
  const r = analyze('function f({ a, b: c, ...rest }, [d, e = 2], ...more) { return a + c + rest + d + e + more; }');
  for (const name of ['a', 'c', 'rest', 'd', 'e', 'more']) assert.equal(r.occurrences.filter((o) => o.name === name).at(-1).outcome, 'LOCAL_BINDING_VERIFIED', name);
  assert.equal(r.bindings.filter((b) => b.kind === 'parameter').length, 6);
});

test('closures capture outer locals; arrow callbacks and block scoping', () => {
  const r = analyze('const outer = 1;\nconst g = () => { let inner = outer; return [1].map((x) => x + inner + outer); };\n{ let blockOnly = 1; }\nblockOnly;');
  assert.equal(find(r, 'outer', 1).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'x', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'inner', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'blockOnly', 0).outcome, 'FREE_IDENTIFIER');
});

test('var hoists to the function scope; let does not leak out of its block', () => {
  const r = analyze('function f() { { var v = 1; } return v; }\nfunction g() { { let w = 1; } return w; }');
  assert.equal(find(r, 'v', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'w', 0).outcome, 'FREE_IDENTIFIER');
});

test('catch bindings, named function expressions and classes', () => {
  const r = analyze('try { x(); } catch (err) { err.message; }\nconst h = function named() { return named; };\nclass K { m() { return new K(); } }\nlet e = err;');
  assert.equal(find(r, 'err', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'named', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'K', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'err', 1).outcome, 'FREE_IDENTIFIER');
});

test('optional chaining and member access are never resolved by name', () => {
  const r = analyze("import { o } from './o';\no?.run();\nconst p = { run: 1 };\np.run;");
  assert.equal(r.occurrences.filter((x) => x.name === 'run' && x.outcome === 'MEMBER_ACCESS_UNRESOLVED').length, 2);
  assert.equal(find(r, 'o').outcome, 'IMPORT_BINDING_VERIFIED');
  assert.ok(!r.occurrences.some((x) => x.name === 'run' && x.outcome === 'FREE_IDENTIFIER'));
});

test('object keys and shorthand properties: keys are not references, shorthand values are', () => {
  const r = analyze('const v = 1; const o = { key: v, v };');
  assert.ok(!r.occurrences.some((x) => x.name === 'key'));
  assert.equal(r.occurrences.filter((x) => x.name === 'v').length >= 2, true);
});

test('spans are UTF-8 byte offsets that read back exactly, including after an emoji', () => {
  const source = 'const s = "🚀"; const t = 1; t;';
  const r = analyze(source);
  const check = verifySpans(Buffer.from(source, 'utf8'), r.occurrences);
  assert.equal(check.ok, check.checked);
  assert.ok(check.checked > 0);
  assert.equal(find(r, 't').startByte, Buffer.byteLength(source.slice(0, source.lastIndexOf('t;')), 'utf8'));
});

test('JavaScript works; unsupported language and syntax errors are typed, not guessed', () => {
  assert.equal(find(analyze('const a = 1; a;', 'javascript'), 'a').outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(analyze('<script></script>', 'svelte').outcome, 'PARSE_UNSUPPORTED');
  assert.equal(analyze('const = ;;; function (').outcome, 'PARSE_UNSUPPORTED');
});

test('deterministic replay', () => {
  const src = "import { a } from './a';\nfunction f(b) { return a + b; }";
  assert.equal(JSON.stringify(analyze(src)), JSON.stringify(analyze(src)));
});

test('for-of and for-in declarations bind inside the loop only, including destructuring', () => {
  const r = analyze('for (const row of rows) { row.x; }\nfor (const [k, v] of map) { k + v; }\nfor (const q in obj) { q; }\nrow;');
  assert.equal(find(r, 'row', 0).outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'k').outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'q').outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find(r, 'row', 1).outcome, 'FREE_IDENTIFIER');
  assert.equal(find(r, 'rows').outcome, 'FREE_IDENTIFIER');
});
