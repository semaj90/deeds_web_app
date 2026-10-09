import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapAstGrepDeclarationToOrfKindV1,
  ORF_AST_KIND_CROSSWALK_V1,
} from './orf-ast-kind-crosswalk-v1.mjs';

test('maps the declaration producer vocabulary to the five established ORF classes', () => {
  assert.deepEqual([...new Set(Object.values(ORF_AST_KIND_CROSSWALK_V1))].sort(), [
    'CLASS_DECL',
    'FUNCTION_DECL',
    'INTERFACE_DECL',
    'TYPE_ALIAS',
    'VARIABLE_DECL',
  ]);
  assert.equal(mapAstGrepDeclarationToOrfKindV1('FUNCTION_DECLARATION'), 'FUNCTION_DECL');
  assert.equal(mapAstGrepDeclarationToOrfKindV1('method_definition'), 'FUNCTION_DECL');
  assert.equal(mapAstGrepDeclarationToOrfKindV1('generator_function_declaration'), 'FUNCTION_DECL');
  assert.equal(mapAstGrepDeclarationToOrfKindV1('enum_declaration'), null);
  assert.equal(mapAstGrepDeclarationToOrfKindV1('enum'), null);
  assert.equal(mapAstGrepDeclarationToOrfKindV1('constant'), null);
  assert.equal(mapAstGrepDeclarationToOrfKindV1('variable_declarator'), 'VARIABLE_DECL');
});

test('normalizes whitespace and case but abstains on unknown or non-string kinds', () => {
  assert.equal(mapAstGrepDeclarationToOrfKindV1('  CLASS_DECLARATION '), 'CLASS_DECL');
  assert.equal(mapAstGrepDeclarationToOrfKindV1('call_expression'), null);
  assert.equal(mapAstGrepDeclarationToOrfKindV1(null), null);
});
