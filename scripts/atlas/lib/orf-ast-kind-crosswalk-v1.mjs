export const ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1 = Object.freeze({
  function_declaration: 'function',
  generator_function_declaration: 'function',
  class_declaration: 'class',
  method_definition: 'method',
  variable_declarator: 'variable',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
});

export const ORF_AST_PREFILL_UNMAPPED_NODE_KINDS_V1 = Object.freeze(['enum_declaration']);

export const ORF_AST_KIND_CROSSWALK_V1 = Object.freeze({
  function: 'FUNCTION_DECL',
  function_declaration: 'FUNCTION_DECL',
  generator_function_declaration: 'FUNCTION_DECL',
  method: 'FUNCTION_DECL',
  method_definition: 'FUNCTION_DECL',
  class: 'CLASS_DECL',
  class_declaration: 'CLASS_DECL',
  interface: 'INTERFACE_DECL',
  interface_declaration: 'INTERFACE_DECL',
  type: 'TYPE_ALIAS',
  type_alias_declaration: 'TYPE_ALIAS',
  variable: 'VARIABLE_DECL',
  variable_declarator: 'VARIABLE_DECL',
});

export function mapAstGrepDeclarationToOrfKindV1(value) {
  if (typeof value !== 'string') return null;
  return ORF_AST_KIND_CROSSWALK_V1[value.trim().toLowerCase()] ?? null;
}
