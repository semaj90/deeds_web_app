export const ORF_AST_KIND_CROSSWALK_V1 = Object.freeze({
  function: 'FUNCTION_DECL',
  function_declaration: 'FUNCTION_DECL',
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
