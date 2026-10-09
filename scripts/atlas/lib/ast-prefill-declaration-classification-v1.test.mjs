import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAstPrefillDeclarationV1 } from './ast-prefill-declaration-classification-v1.mjs';

test('classifies plain variable declarators', () => {
  assert.deepEqual(classifyAstPrefillDeclarationV1({
    nodeKind: 'variable_declarator',
    nameNodeKind: 'identifier',
    nameText: 'client',
    valueNodeKind: 'call_expression',
    entityKind: 'variable',
  }), { symbolName: 'client', symbolKind: 'variable' });
});

test('classifies arrow and function-expression bindings as functions', () => {
  for (const valueNodeKind of ['arrow_function', 'function_expression', 'generator_function']) {
    assert.deepEqual(classifyAstPrefillDeclarationV1({
      nodeKind: 'variable_declarator',
      nameNodeKind: 'identifier',
      nameText: 'dfs',
      valueNodeKind,
      entityKind: 'variable',
    }), { symbolName: 'dfs', symbolKind: 'function' });
  }
});

test('rejects object, array, and generic destructuring patterns as single symbols', () => {
  for (const nameNodeKind of ['object_pattern', 'array_pattern', 'destructuring_pattern']) {
    assert.equal(classifyAstPrefillDeclarationV1({
      nodeKind: 'variable_declarator',
      nameNodeKind,
      nameText: nameNodeKind === 'object_pattern' ? '{ Pool }' : '[first, second]',
      valueNodeKind: 'identifier',
      entityKind: 'variable',
    }), null);
  }
});

test('preserves names for non-variable declaration kinds', () => {
  assert.deepEqual(classifyAstPrefillDeclarationV1({
    nodeKind: 'function_declaration',
    nameNodeKind: 'identifier',
    nameText: 'retrieve',
    valueNodeKind: null,
    entityKind: 'function',
  }), { symbolName: 'retrieve', symbolKind: 'function' });
});
