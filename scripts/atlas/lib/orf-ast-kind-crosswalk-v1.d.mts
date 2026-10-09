export type OrfAstKindV1 =
  | 'FUNCTION_DECL'
  | 'CLASS_DECL'
  | 'INTERFACE_DECL'
  | 'TYPE_ALIAS'
  | 'VARIABLE_DECL';

export const ORF_AST_KIND_CROSSWALK_V1: Readonly<Record<string, OrfAstKindV1>>;

export function mapAstGrepDeclarationToOrfKindV1(value: unknown): OrfAstKindV1 | null;
