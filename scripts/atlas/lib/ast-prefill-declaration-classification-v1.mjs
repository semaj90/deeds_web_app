const DESTRUCTURING_NODE_KINDS = new Set(['object_pattern', 'array_pattern', 'destructuring_pattern']);
const FUNCTION_VALUE_NODE_KINDS = new Set(['arrow_function', 'function_expression', 'generator_function']);

export function classifyAstPrefillDeclarationV1(input) {
  if (input.nodeKind !== 'variable_declarator') {
    return input.nameText
      ? { symbolName: input.nameText, symbolKind: input.entityKind }
      : null;
  }

  if (!input.nameText || DESTRUCTURING_NODE_KINDS.has(input.nameNodeKind)) return null;

  return {
    symbolName: input.nameText,
    symbolKind: FUNCTION_VALUE_NODE_KINDS.has(input.valueNodeKind) ? 'function' : 'variable',
  };
}
